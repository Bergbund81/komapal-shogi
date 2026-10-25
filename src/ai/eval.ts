// 駒得の評価。盤上の駒と持ち駒の価値の合計を、指定した側から見た点で返す。
import type { Color, Position, Role } from '../rules';

/** 駒の価値（歩 = 100）。玉は両方にあるので 0 */
export const PIECE_VALUES: Readonly<Partial<Record<Role, number>>> = {
  pawn: 100,
  lance: 300,
  knight: 350,
  silver: 500,
  gold: 550,
  bishop: 800,
  rook: 900,
  tokin: 600,
  promotedlance: 550,
  promotedknight: 550,
  promotedsilver: 550,
  horse: 1000,
  dragon: 1200,
  king: 0,
};

export function pieceValue(role: Role): number {
  return PIECE_VALUES[role] ?? 0;
}

function sideMaterial(pos: Position, color: Color): number {
  let total = 0;
  for (const sq of pos.board.byColor(color)) {
    const piece = pos.board.pieceAt(sq);
    if (piece) total += pieceValue(piece.role);
  }
  for (const [role, count] of pos.hands.color(color)) total += pieceValue(role) * count;
  return total;
}

/** color から見た駒得（自分の駒の価値 − あいての駒の価値） */
export function materialScore(pos: Position, color: Color): number {
  const other: Color = color === 'sente' ? 'gote' : 'sente';
  return sideMaterial(pos, color) - sideMaterial(pos, other);
}
