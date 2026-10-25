// L3〜5 の手の選び方。やねうら王の結果から選ぶ／エンジンが無いときは自作αβで選ぶ。
// どちらも最後に legalMoves() に入っているかを確かめる（CLAUDE.md の絶対ルール）。
import { legalMoves, type Position } from '../rules';
import { searchAlphaBeta } from './alphabeta';
import type { GoOptions, SearchResult } from './engine';
import type { EngineParams } from './levels';
import type { Rng } from './rng';

export interface ChosenMove {
  move: string;
  /** 手番側から見た評価値（最善手の値） */
  score: number;
}

/** go の条件。nps は起動時に測った速さ（遅い端末なら L5 を短く打ち切る） */
export function goOptionsFor(params: EngineParams, nps?: number): GoOptions {
  const opts: GoOptions = { multipv: params.multipv };
  if (params.byoyomiMs !== undefined) opts.byoyomiMs = params.byoyomiMs;
  let nodes = params.nodes;
  const slow = params.slowDevice;
  if (slow && nps !== undefined && nps < slow.npsBelow) {
    const cap = Math.max(1000, Math.round((nps * slow.thinkMs) / 1000));
    nodes = nodes === undefined ? cap : Math.min(nodes, cap);
  }
  if (nodes !== undefined) opts.nodes = nodes;
  return opts;
}

/**
 * エンジンの結果から手を選ぶ。候補が複数あればゆらぎつきで選ぶ。
 * 合法手でない手しか無ければ undefined（呼び出し側が自作αβに切り替える）
 */
export function pickEngineMove(
  pos: Position,
  result: SearchResult,
  params: EngineParams,
  rng: Rng,
): ChosenMove | undefined {
  const legal = new Set(legalMoves(pos));
  const candidates = result.candidates.filter((c) => legal.has(c.move));
  const best = candidates[0];
  if (!best) {
    return legal.has(result.bestmove) ? { move: result.bestmove, score: 0 } : undefined;
  }
  if (candidates.length === 1 || params.noise <= 0) {
    const move = legal.has(result.bestmove) ? result.bestmove : best.move;
    return { move, score: best.score };
  }
  let chosen = best;
  let chosenValue = -Infinity;
  for (const c of candidates) {
    // 2 つの乱数の和でゆらぎを作る（kids-ai と同じ形）。詰みは点が大きいので必ず選ばれる
    const value = c.score + (rng() + rng() - 1) * params.noise;
    if (value > chosenValue) {
      chosenValue = value;
      chosen = c;
    }
  }
  return { move: chosen.move, score: best.score };
}

/** かんたんモード: 自作αβで選ぶ。合法手が無ければ undefined */
export function chooseFallbackMove(
  pos: Position,
  params: EngineParams,
  rng: Rng,
): ChosenMove | undefined {
  const { depth, timeMs, noise } = params.fallback;
  const r = searchAlphaBeta(pos, { maxDepth: depth, timeMs, noise, rng });
  return r ? { move: r.move, score: r.score } : undefined;
}
