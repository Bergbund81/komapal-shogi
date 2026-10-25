// レベル1・2の「こども AI」。必ず legalMoves() の中から手を選ぶ。
// L1: ほぼランダム（タダ取りと 1 手詰めは、決まった確率でだけ気づく）
// L2: 全合法手を 1 手読みして駒得で選ぶ（ゆらぎつき・1 手詰めは見逃さない）
import { isDrop } from 'shogiops/util';
import { isCheckmate, legalMoves, parseMove, playUnchecked, type Position } from '../rules';
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
  return pick(moves, rng);
}

/** 自己対局用の「ランダム」相手 */
export function chooseRandomMove(pos: Position, rng: Rng): string | undefined {
  return pick(legalMoves(pos), rng);
}
