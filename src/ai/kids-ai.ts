// レベル1・2の「こども AI」。必ず legalMoves() の中から手を選ぶ。
// L1: ほぼランダム（タダ取りと 1 手詰めは、決まった確率でだけ気づく。
//     タダで取られる手や、意味のない王の前進は、ときどきだけ避ける）
// L2: 全合法手を 1 手読みして駒得で選ぶ（ゆらぎつき・1 手詰めは見逃さない）
import { isDrop, parseSquareName, squareRank } from 'shogiops/util';
import {
  isCheckmate,
  legalMoves,
  parseMove,
  playUnchecked,
  type Position,
  type Role,
} from '../rules';
import { materialScore, pieceValue } from './eval';
import type { KidsParams } from './levels';
import { pick, type Rng } from './rng';

/** 指した後の局面。moves は legalMoves の結果なので合法性は確認済み */
function after(pos: Position, usi: string): Position | undefined {
  const md = parseMove(usi);
  return md ? playUnchecked(pos, md) : undefined;
}

/** 1 手で相手を詰ませる手 */
export function mateInOneMoves(pos: Position, moves: readonly string[]): string[] {
  return moves.filter((usi) => {
    const next = after(pos, usi);
    return next !== undefined && next.isCheck() && isCheckmate(next);
  });
}

/** 取れる駒の価値。駒を取らない手は 0 */
function capturedValue(pos: Position, usi: string): number {
  const md = parseMove(usi);
  if (!md || isDrop(md)) return 0;
  const target = pos.board.pieceAt(md.to);
  return target && target.color !== pos.turn ? pieceValue(target.role) : 0;
}

/** あいてに取り返されない形で駒を取る手（タダ取り） */
export function freeCaptureMoves(pos: Position, moves: readonly string[]): string[] {
  const free: string[] = [];
  for (const usi of moves) {
    if (capturedValue(pos, usi) <= 0) continue;
    const next = after(pos, usi);
    if (!next) continue;
    const to = usi.slice(2, 4);
    if (!legalMoves(next).some((reply) => reply.slice(2, 4) === to)) free.push(usi);
  }
  return free;
}

/** 1 手読み: 指した後の駒得に、ゆらぎを足した点で最もよい手 */
function lookaheadMove(pos: Position, moves: readonly string[], noise: number, rng: Rng): string {
  const me = pos.turn;
  let best = moves[0] ?? '';
  let bestScore = -Infinity;
  for (const usi of moves) {
    const next = after(pos, usi);
    if (!next) continue;
    // 2 つの乱数の和でゆらぎを作る（真ん中が出やすく、たまに大きくぶれる）
    const wobble = (rng() + rng() - 1) * noise;
    const score = materialScore(next, me) + wobble;
    if (score > bestScore) {
      bestScore = score;
      best = usi;
    }
  }
  return best;
}

const BIG_ROLES: readonly Role[] = ['rook', 'bishop', 'dragon', 'horse'];

/** 指した駒が、あいてにタダで取られる（取り返せない）手か。next は指した後の局面 */
function leavesPieceHanging(next: Position, to: string): boolean {
  for (const capture of legalMoves(next)) {
    if (capture[1] === '*' || capture.slice(2, 4) !== to) continue;
    const taken = after(next, capture);
    if (taken && !legalMoves(taken).some((reply) => reply.slice(2, 4) === to)) return true;
  }
  return false;
}

/** 王手でも取る手でもないのに、王が前（あいての陣のほう）へ出る手か */
function isAimlessKingAdvance(pos: Position, usi: string): boolean {
  const md = parseMove(usi);
  if (!md || isDrop(md) || pos.isCheck()) return false;
  if (pos.board.pieceAt(md.from)?.role !== 'king' || pos.board.hasPieceAt(md.to)) return false;
  const dRank = squareRank(md.to) - squareRank(md.from);
  return pos.turn === 'sente' ? dRank < 0 : dRank > 0;
}

/** ほぼランダム。避ける手に当たっても、確率でそのまま指す（ほかの手が無ければ必ず指す） */
function weakRandomMove(pos: Position, moves: readonly string[], p: KidsParams, rng: Rng): string {
  const order = [...moves];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j] as string, order[i] as string];
  }
  for (const usi of order) {
    if (p.avoidKingAdvanceProb > 0 && isAimlessKingAdvance(pos, usi)) {
      if (rng() < p.avoidKingAdvanceProb) continue;
    }
    if (p.avoidHangProb > 0 || p.avoidBigHangProb > 0) {
      const next = after(pos, usi);
      const to = usi.slice(2, 4);
      const role = next?.board.pieceAt(parseSquareName(to) ?? -1)?.role;
      if (next && role && leavesPieceHanging(next, to)) {
        const avoid = BIG_ROLES.includes(role) ? p.avoidBigHangProb : p.avoidHangProb;
        if (rng() < avoid) continue;
      }
    }
    return usi;
  }
  return order[0] ?? '';
}

/** 手番側の手を 1 つ選ぶ。合法手が無ければ undefined */
export function chooseKidsMove(pos: Position, params: KidsParams, rng: Rng): string | undefined {
  const moves = legalMoves(pos);
  if (moves.length === 0) return undefined;

  if (rng() < params.mateInOneProb) {
    const mates = mateInOneMoves(pos, moves);
    const mate = pick(mates, rng);
    if (mate) return mate;
  }

  if (params.lookahead) return lookaheadMove(pos, moves, params.noise, rng);

  if (rng() < params.freePieceTakeProb) {
    const free = freeCaptureMoves(pos, moves);
    // いちばん大きい駒をタダで取れる手を選ぶ
    let bestFree: string | undefined;
    for (const usi of free) {
      if (bestFree === undefined || capturedValue(pos, usi) > capturedValue(pos, bestFree)) {
        bestFree = usi;
      }
    }
    if (bestFree) return bestFree;
  }
  return weakRandomMove(pos, moves, params, rng);
}

/** 自己対局用の「ランダム」相手 */
export function chooseRandomMove(pos: Position, rng: Rng): string | undefined {
  return pick(legalMoves(pos), rng);
}
