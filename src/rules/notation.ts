// USI → 日本語の棋譜表記（▲7六歩、△同銀、▲2二角成、▲5五角打、▲5二金右 など）。
// 区別の字（右・左・上・引・寄・直）と成・不成・打は shogiops の日本式表記を使い、
// 画面向けに数字を半角に、「同」の後の全角空白を取ってそろえる。
import { makeJapaneseMoveOrDrop } from 'shogiops/notation/move/japanese';
import type { Square } from 'shogiops/types';
import { parseSquareName } from 'shogiops/util';
import { playMove } from './legal';
import { parseMove, parseSfen, type Color, type Position } from './position';

export const COLOR_MARK: Record<Color, string> = { sente: '▲', gote: '△' };

function toHalfWidthDigits(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

export interface JapaneseOptions {
  /**
   * 直前の手の行き先（USI の升名、例 "7f"）。「同」の判定に使う。
   * 省略時は局面が覚えている直前の手を使う。null なら「同」を使わない。
   */
  lastTo?: string | null;
  /** 先頭に ▲/△ を付けるか（既定 true） */
  mark?: boolean;
}

/** 局面 pos で指す手 usi の日本語表記。書式がおかしい・駒が無いときは undefined */
export function toJapanese(
  pos: Position,
  usi: string,
  opts: JapaneseOptions = {},
): string | undefined {
  const md = parseMove(usi);
  if (!md) return undefined;
  let lastDest: Square | undefined;
  if (opts.lastTo === null) lastDest = -1;
  else if (opts.lastTo !== undefined) lastDest = parseSquareName(opts.lastTo);
  const body = makeJapaneseMoveOrDrop(pos, md, lastDest);
  if (body === undefined) return undefined;
  const text = toHalfWidthDigits(body).replace(/^同\s+/, '同'); // \s は全角空白も含む
  return opts.mark === false ? text : COLOR_MARK[pos.turn] + text;
}

/** 開始局面から手順を日本語表記の配列にする。途中に指せない手があれば IllegalMoveError */
export function movesToJapanese(startSfen: string, usis: readonly string[]): string[] {
  let pos = parseSfen(startSfen);
  const out: string[] = [];
  for (const usi of usis) {
    out.push(toJapanese(pos, usi) ?? usi);
    pos = playMove(pos, usi);
  }
  return out;
}
