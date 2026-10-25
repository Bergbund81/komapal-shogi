// 合法手の一覧と「なぜ指せないか」の判定。
// UI・AI は合法手判定をここだけに任せる（CLAUDE.md の絶対ルール）。
import { pieceCanPromote, pieceForcePromote } from 'shogiops/position/util';
import type { DropMove, NormalMove, Role, Square } from 'shogiops/types';
import { isDrop, makeUsi, parseSquareName, squareFile } from 'shogiops/util';
import { parseMove, type Position } from './position';

/** 持ち駒にできる駒（打てる駒） */
export const HAND_ROLES: readonly Role[] = [
  'rook',
  'bishop',
  'gold',
  'silver',
  'knight',
  'lance',
  'pawn',
];

/** from の駒が to へ動く手を、成・不成の選択肢ごとに展開する */
function expandPromotions(pos: Position, from: Square, to: Square): NormalMove[] {
  const piece = pos.board.pieceAt(from);
  if (!piece) return [];
  if (pieceForcePromote('standard')(piece, to)) return [{ from, to, promotion: true }];
  const moves: NormalMove[] = [{ from, to }];
  if (pieceCanPromote('standard')(piece, from, to, pos.board.pieceAt(to))) {
    moves.push({ from, to, promotion: true });
  }
  return moves;
}

function boardMovesFrom(pos: Position, from: Square): string[] {
  const usis: string[] = [];
  for (const to of pos.moveDests(from)) {
    for (const md of expandPromotions(pos, from, to)) usis.push(makeUsi(md));
  }
  return usis;
}

function dropsOfRole(pos: Position, role: Role): string[] {
  if (pos.hands.color(pos.turn).get(role) <= 0) return [];
  const usis: string[] = [];
  for (const to of pos.dropDests({ role, color: pos.turn })) usis.push(makeUsi({ role, to }));
  return usis;
}

/** 手番側のすべての合法手（USI）。成れる手は成・不成の両方を含む。強制成りは成のみ */
export function legalMoves(pos: Position): string[] {
  const usis: string[] = [];
  for (const from of pos.board.byColor(pos.turn)) usis.push(...boardMovesFrom(pos, from));
  for (const role of HAND_ROLES) usis.push(...dropsOfRole(pos, role));
  return usis;
}

/** 盤上の升（USI の升名、例 "7g"）にある手番側の駒の合法手 */
export function movesFrom(pos: Position, square: string): string[] {
  const from = parseSquareName(square);
  if (from === undefined) return [];
  const piece = pos.board.pieceAt(from);
  if (!piece || piece.color !== pos.turn) return [];
  return boardMovesFrom(pos, from);
}

/** 手番側が持ち駒 role を打つ合法手 */
export function dropsOf(pos: Position, role: Role): string[] {
  return HAND_ROLES.includes(role) ? dropsOfRole(pos, role) : [];
}

/** USI を標準形にそろえる（書式が正しくなければ undefined） */
export function normalizeUsi(usi: string): string | undefined {
  const md = parseMove(usi);
  return md ? makeUsi(md) : undefined;
}

export function isLegalMove(pos: Position, usi: string): boolean {
  const md = parseMove(usi);
  if (!md) return false;
  const norm = makeUsi(md);
  if (isDrop(md)) return dropsOf(pos, md.role).includes(norm);
  const piece = pos.board.pieceAt(md.from);
  if (!piece || piece.color !== pos.turn) return false;
  return boardMovesFrom(pos, md.from).includes(norm);
}

/**
 * 指せない理由。子どもに「なぜ指せないか」を説明するために使う。文言は UI 側で作る。
 * - invalidUsi: 手の書式がおかしい
 * - noPiece / notYourPiece: 動かす駒が無い / あいての駒
 * - noPieceInHand: その持ち駒を持っていない
 * - ownPieceThere: 動かす先に自分の駒がある
 * - occupied: 打つ升に駒がある
 * - cannotMoveThere: その駒の動きでは行けない（とびこえ含む）
 * - cannotPromote: 成れない場面で成ろうとした
 * - mustPromote: 成らないと行き所のない駒になる（移動）
 * - deadPiece: 行き所のない升に打とうとした（1段目の歩・香、1〜2段目の桂）
 * - nifu: 二歩
 * - uchifuzume: 打ち歩詰め
 * - leavesKingInCheck: 王手放置（王手されているのに防いでいない）
 * - selfCheck: 自殺手（自分から玉を取られる形にする）
 */
export type IllegalReason =
  | 'invalidUsi'
  | 'noPiece'
  | 'notYourPiece'
  | 'noPieceInHand'
  | 'ownPieceThere'
  | 'occupied'
  | 'cannotMoveThere'
  | 'cannotPromote'
  | 'mustPromote'
  | 'deadPiece'
  | 'nifu'
  | 'uchifuzume'
  | 'leavesKingInCheck'
  | 'selfCheck';

function kingSafetyReason(pos: Position, md: DropMove | NormalMove): IllegalReason | null {
  const after = pos.play(md);
  if (!after.isCheck(pos.turn)) return null;
  return pos.isCheck() ? 'leavesKingInCheck' : 'selfCheck';
}

function dropReason(pos: Position, md: DropMove): IllegalReason | null {
  const color = pos.turn;
  if (!HAND_ROLES.includes(md.role) || pos.hands.color(color).get(md.role) <= 0) {
    return 'noPieceInHand';
  }
  if (pos.board.hasPieceAt(md.to)) return 'occupied';
  if (pieceForcePromote('standard')({ role: md.role, color }, md.to)) return 'deadPiece';
  if (md.role === 'pawn') {
    const file = squareFile(md.to);
    for (const sq of pos.board.byPiece(color, 'pawn')) {
      if (squareFile(sq) === file) return 'nifu';
    }
  }
  const safety = kingSafetyReason(pos, md);
  if (safety) return safety;
  if (md.role === 'pawn' && pos.play(md).outcome()?.result === 'checkmate') return 'uchifuzume';
  return null;
}

function moveReason(pos: Position, md: NormalMove): IllegalReason | null {
  const piece = pos.board.pieceAt(md.from);
  if (!piece) return 'noPiece';
  if (piece.color !== pos.turn) return 'notYourPiece';
  const target = pos.board.pieceAt(md.to);
  if (target && target.color === pos.turn) return 'ownPieceThere';
  // 玉の安全を考えない「駒の動きとして行けるか」
  if (!pos.illegalMoveDests(md.from).has(md.to)) return 'cannotMoveThere';
  if (md.promotion && !pieceCanPromote('standard')(piece, md.from, md.to, target)) {
    return 'cannotPromote';
  }
  if (!md.promotion && pieceForcePromote('standard')(piece, md.to)) return 'mustPromote';
  return kingSafetyReason(pos, md);
}

export class IllegalMoveError extends Error {
  constructor(
    readonly usi: string,
    readonly reason: IllegalReason,
  ) {
    super(`指せない手です (${reason}): ${usi}`);
    this.name = 'IllegalMoveError';
  }
}

/** 合法手を確かめてから指す。合法手でなければ IllegalMoveError（理由つき） */
export function playMove(pos: Position, usi: string): Position {
  const md = parseMove(usi);
  if (md && isLegalMove(pos, usi)) return pos.play(md);
  throw new IllegalMoveError(usi, illegalReason(pos, usi) ?? 'cannotMoveThere');
}

/** 指せない理由を返す。合法手なら null */
export function illegalReason(pos: Position, usi: string): IllegalReason | null {
  const md = parseMove(usi);
  if (!md || (!isDrop(md) && md.midStep !== undefined)) return 'invalidUsi';
  const reason = isDrop(md) ? dropReason(pos, md) : moveReason(pos, md);
  if (reason) return reason;
  // ここまでで理由が見つからない手は合法手と一致するはず（テストで照合している）
  return isLegalMove(pos, usi) ? null : 'cannotMoveThere';
}
