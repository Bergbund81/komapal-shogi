// KIF 形式の棋譜の出力と読込。局面ヘッダと指し手の書式は shogiops を使い、
// 対局情報・終局行・不成の扱いをここで補う。
import {
  makeKifHeader,
  makeKifMoveOrDrop,
  normalizedKifLines,
  parseKifHeader,
  parseKifMoveOrDrop,
} from 'shogiops/notation/game/kif';
import { pieceCanPromote } from 'shogiops/position/util';
import { makeSfen } from 'shogiops/sfen';
import type { Square } from 'shogiops/types';
import { isDrop, makeUsi } from 'shogiops/util';
import { isLegalMove, playMove } from './legal';
import { parseMove, parseSfen, type Position } from './position';

/** KIF の終局の表記 */
export type KifEnding =
  | '投了'
  | '中断'
  | '千日手'
  | '詰み'
  | '持将棋'
  | '入玉勝ち'
  | '反則勝ち'
  | '反則負け'
  | '切れ負け';

const ENDINGS: readonly string[] = [
  '投了',
  '中断',
  '千日手',
  '詰み',
  '持将棋',
  '入玉勝ち',
  '反則勝ち',
  '反則負け',
  '切れ負け',
];

export interface KifGame {
  startSfen: string;
  moves: string[];
  sente?: string;
  gote?: string;
  /** 開始日時（KIF にそのまま書く文字列、例 "2026/10/25 10:00:00"） */
  startedAt?: string;
  ending?: KifEnding;
}

export class KifParseError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(line === undefined ? message : `${line}行目: ${message}`);
    this.name = 'KifParseError';
  }
}

/** 1手分の KIF 表記（例 "７六歩(77)"、"同 角不成(88)"（空白は全角）、"５五角打"） */
function kifMoveText(pos: Position, usi: string): string {
  const md = parseMove(usi);
  if (!md) throw new KifParseError(`手の書式がおかしいです: ${usi}`);
  const text = makeKifMoveOrDrop(pos, md);
  if (text === undefined) throw new KifParseError(`手を KIF にできません: ${usi}`);
  if (isDrop(md) || md.promotion) return text;
  const piece = pos.board.pieceAt(md.from);
  // 成れるのに成らなかった手は「不成」を付ける
  if (piece && pieceCanPromote('standard')(piece, md.from, md.to, pos.board.pieceAt(md.to))) {
    return text.replace('(', '不成(');
  }
  return text;
}

export function toKif(game: KifGame): string {
  const start = parseSfen(game.startSfen);
  const lines: string[] = ['# ---- KomaPal Shogi 棋譜ファイル ----'];
  if (game.startedAt) lines.push(`開始日時：${game.startedAt}`);
  lines.push(makeKifHeader(start));
  lines.push(`先手：${game.sente ?? ''}`, `後手：${game.gote ?? ''}`);
  lines.push('手数----指手---------消費時間--');

  let pos = start;
  game.moves.forEach((usi, i) => {
    lines.push(`${String(i + 1).padStart(4)} ${kifMoveText(pos, usi)}`);
    pos = playMove(pos, usi);
  });
  if (game.ending) lines.push(`${String(game.moves.length + 1).padStart(4)} ${game.ending}`);
  return lines.join('\n') + '\n';
}

const MOVE_LINE = /^(\d+)\s+(.+)$/;
const TAG_LINE = /^(先手|後手|開始日時)[：:](.*)$/;

export function parseKif(kif: string): KifGame {
  const header = parseKifHeader(kif);
  if (header.isErr) throw new KifParseError(`局面を読めませんでした (${header.error.message})`);
  const startSfen = makeSfen(header.value);
  const game: KifGame = { startSfen, moves: [] };

  // 対局情報は元の行から読む（normalizedKifLines は時刻の ":" も "：" に変えてしまうため）
  for (const raw of kif.split(/\r?\n/)) {
    const tag = TAG_LINE.exec(raw.trim());
    if (!tag) continue;
    const value = (tag[2] ?? '').trim();
    if (tag[1] === '先手') game.sente = value;
    else if (tag[1] === '後手') game.gote = value;
    else game.startedAt = value;
  }

  let pos = parseSfen(startSfen);
  let lastDest: Square | undefined;
  const lines = normalizedKifLines(kif);
  for (const [index, line] of lines.entries()) {
    if (line.startsWith('変化：')) break; // 分岐は読まない（本譜のみ）
    const m = MOVE_LINE.exec(line);
    if (!m || !m[2]) continue;
    const moveText = m[2].trim();
    const ending = ENDINGS.find((e) => moveText.startsWith(e));
    if (ending) {
      game.ending = ending as KifEnding;
      break;
    }
    const md = parseKifMoveOrDrop(moveText, lastDest);
    if (!md) throw new KifParseError(`手を読めませんでした: ${moveText}`, index + 1);
    let usi = makeUsi(md);
    // 強制成りを「成」なしで書いた棋譜にも対応
    if (!isLegalMove(pos, usi) && !isDrop(md) && isLegalMove(pos, `${usi}+`)) usi = `${usi}+`;
    if (!isLegalMove(pos, usi)) {
      throw new KifParseError(`指せない手があります: ${moveText}`, index + 1);
    }
    pos = playMove(pos, usi);
    game.moves.push(usi);
    lastDest = md.to;
  }
  return game;
}
