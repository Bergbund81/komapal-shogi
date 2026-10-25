// 局面の読み書きと基本判定。将棋ルールは shogiops（GPL-3.0）を土台にし、
// アプリ内では手を USI 文字列（7g7f, P*5e, 8h2b+）でやり取りする。
import type { Shogi } from 'shogiops/position/rules/shogi';
import { initialSfen, makeSfen, parseSfen as opsParseSfen } from 'shogiops/sfen';
import type { Color, MoveOrDrop, Role } from 'shogiops/types';
import { parseUsi } from 'shogiops/util';

export type Position = Shogi;
export type { Color, MoveOrDrop, Role };

/** 平手の初期局面 */
export const INITIAL_SFEN: string = initialSfen('standard');

export class SfenParseError extends Error {
  constructor(
    readonly sfen: string,
    readonly code: string,
  ) {
    super(`SFEN を読めませんでした (${code}): ${sfen}`);
    this.name = 'SfenParseError';
  }
}

/**
 * SFEN から局面を作る。strict=true（既定）では二歩・行き所のない駒・玉の数なども検査する。
 * 練習用の特殊な盤（玉なし等）は strict=false で読む。
 */
export function parseSfen(sfen: string, strict = true): Position {
  const result = opsParseSfen('standard', sfen.trim(), strict);
  if (result.isErr) throw new SfenParseError(sfen, result.error.message);
  return result.value;
}

export function isValidSfen(sfen: string, strict = true): boolean {
  return opsParseSfen('standard', sfen.trim(), strict).isOk;
}

export function toSfen(pos: Position): string {
  return makeSfen(pos);
}

/** 千日手判定用のキー。手数を除いた「盤・手番・持ち駒」 */
export function positionKey(pos: Position): string {
  return makeSfen(pos).split(' ').slice(0, 3).join(' ');
}

/** USI を内部の指し手に変換。書式が正しくなければ undefined */
export function parseMove(usi: string): MoveOrDrop | undefined {
  return parseUsi(usi.trim());
}

/** 合法性を確かめずに指す。合法手であることを呼び出し側（legal.ts）で保証すること */
export function playUnchecked(pos: Position, md: MoveOrDrop): Position {
  return pos.play(md);
}

/** 手番側（color 指定時はその側）の玉に王手がかかっているか */
export function isCheck(pos: Position, color?: Color): boolean {
  return pos.isCheck(color);
}

/** 手番側が詰んでいるか（王手されていて合法手が無い） */
export function isCheckmate(pos: Position): boolean {
  return pos.outcome()?.result === 'checkmate';
}

/** 手番側に合法手が無いか（詰み、または王手されていないのに動けない「行き詰まり」） */
export function hasNoLegalMoves(pos: Position): boolean {
  return !pos.hasDests();
}

export function opposite(color: Color): Color {
  return color === 'sente' ? 'gote' : 'sente';
}
