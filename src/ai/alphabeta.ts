// 自作αβ探索。L4〜7 と、やねうら王が動かない端末での L8〜10（「かんたんモード」）で使う。
// 反復深化＋取る手だけの静止探索。評価は駒得（eval.ts）。手は必ず legalMoves() から選ぶ。
import { isDrop } from 'shogiops/util';
import { legalMoves, parseMove, playUnchecked, type Position } from '../rules';
import { MATE_SCORE } from './engine';
import { materialScore, pieceValue } from './eval';
import type { Rng } from './rng';

export interface AlphaBetaOptions {
  /** 読む深さの上限（手） */
  maxDepth: number;
  /** 考える時間の上限。深さ 1 は時間を過ぎても必ず読み切る */
  timeMs: number;
  /** 末端の評価に足すゆらぎ（点）。0 ならいつも同じ手 */
  noise?: number;
  rng?: Rng;
  /** 静止探索（取り合いだけ読む）の深さ */
  quiescenceDepth?: number;
  /** テストで差し替える */
  now?: () => number;
}

export interface AlphaBetaResult {
  move: string;
  /** 手番側から見た点。詰みは ±(MATE_SCORE - 手数) */
  score: number;
  /** 読み切れた深さ */
  depth: number;
}

class TimeUp extends Error {}

interface Child {
  usi: string;
  next: Position;
  order: number;
}

/**
 * 合法手を指した後の局面を、よさそうな順（大きい駒を取る手・成る手が先）に並べる。
 * capturesOnly なら駒を取る手だけ（静止探索用）
 */
function children(
  pos: Position,
  moves: readonly string[],
  first?: string,
  capturesOnly = false,
): Child[] {
  const out: Child[] = [];
  for (const usi of moves) {
    const md = parseMove(usi);
    if (!md) continue;
    let order = 0;
    const victim = isDrop(md) ? undefined : pos.board.pieceAt(md.to);
    if (capturesOnly && !victim) continue;
    if (!isDrop(md)) {
      const attacker = pos.board.pieceAt(md.from);
      if (victim)
        order += 10 * pieceValue(victim.role) - (attacker ? pieceValue(attacker.role) : 0);
      if (md.promotion) order += 500;
    }
    if (usi === first) order = Infinity;
    out.push({ usi, next: playUnchecked(pos, md), order });
  }
  return out.sort((a, b) => b.order - a.order);
}

/** 手番側から見た αβ 探索。指せる手が無ければ負け（詰み・行き詰まり） */
export function searchAlphaBeta(
  pos: Position,
  opts: AlphaBetaOptions,
): AlphaBetaResult | undefined {
  const now = opts.now ?? (() => Date.now());
  const deadline = now() + opts.timeMs;
  const noise = opts.noise ?? 0;
  const rng = opts.rng ?? Math.random;
  const qDepth = opts.quiescenceDepth ?? 2;
  let checkTime = false;

  const evaluate = (p: Position): number =>
    materialScore(p, p.turn) + (noise > 0 ? (rng() + rng() - 1) * noise : 0);

  const tick = (): void => {
    if (checkTime && now() > deadline) throw new TimeUp();
  };

  function quiesce(p: Position, alpha: number, beta: number, q: number, ply: number): number {
    tick();
    const moves = legalMoves(p);
    if (moves.length === 0) return -(MATE_SCORE - ply);
    const standPat = evaluate(p);
    if (q <= 0 || standPat >= beta) return standPat;
    let best = standPat;
    let a = Math.max(alpha, standPat);
    for (const c of children(p, moves, undefined, true)) {
      const score = -quiesce(c.next, -beta, -a, q - 1, ply + 1);
      if (score > best) best = score;
      if (score > a) a = score;
      if (a >= beta) break;
    }
    return best;
  }

  function negamax(p: Position, depth: number, alpha: number, beta: number, ply: number): number {
    if (depth <= 0) return quiesce(p, alpha, beta, qDepth, ply);
    tick();
    const list = children(p, legalMoves(p));
    if (list.length === 0) return -(MATE_SCORE - ply);
    let best = -Infinity;
    let a = alpha;
    for (const c of list) {
      const score = -negamax(c.next, depth - 1, -beta, -a, ply + 1);
      if (score > best) best = score;
      if (score > a) a = score;
      if (a >= beta) break;
    }
    return best;
  }

  // 最初の並びを乱数でまぜる。並べ替えは同じ点の順番を変えないので、同点の最善手は乱数で選ばれる
  // （ゆらぎ 0 でも毎回同じ手にならず、駒を行ったり来たりさせて千日手になるのを防ぐ）
  const rootMoves = legalMoves(pos);
  for (let i = rootMoves.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rootMoves[i], rootMoves[j]] = [rootMoves[j] as string, rootMoves[i] as string];
  }
  let result: AlphaBetaResult | undefined;
  for (let depth = 1; depth <= opts.maxDepth; depth++) {
    checkTime = depth > 1;
    try {
      let bestMove: string | undefined;
      let bestScore = -Infinity;
      for (const c of children(pos, rootMoves, result?.move)) {
        const score = -negamax(c.next, depth - 1, -Infinity, -bestScore, 1);
        if (bestMove === undefined || score > bestScore) {
          bestScore = score;
          bestMove = c.usi;
        }
      }
      if (bestMove === undefined) return undefined;
      result = { move: bestMove, score: bestScore + 0, depth }; // +0 で -0 を 0 に
      if (bestScore >= MATE_SCORE - depth) break; // 詰みを見つけた
    } catch (err) {
      if (err instanceof TimeUp) break;
      throw err;
    }
  }
  return result;
}
