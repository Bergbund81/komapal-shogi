// 自作αβ（かんたんモード）: 詰み・タダ取り・駒損を避ける・時間で打ち切る・必ず合法手
import { describe, expect, it } from 'vitest';
import { searchAlphaBeta } from '../src/ai/alphabeta';
import { MATE_SCORE } from '../src/ai/engine';
import { createRng } from '../src/ai/rng';
import { INITIAL_SFEN, legalMoves, parseSfen, playMove } from '../src/rules';

describe('searchAlphaBeta', () => {
  it('1 手詰めを見つける', () => {
    const pos = parseSfen('4k4/9/4P4/9/9/9/9/9/4K4 b G2r2b3g4s4n4l17p 1');
    const r = searchAlphaBeta(pos, { maxDepth: 3, timeMs: 5000 });
    expect(r?.move).toBe('G*5b');
    expect(r?.score).toBe(MATE_SCORE - 1);
  });

  it('タダで取れる飛車を取る', () => {
    // 先手の角が 5e、後手の飛車が 2b（守りなし）
    const pos = parseSfen('4k4/7r1/9/9/4B4/9/9/9/4K4 b - 1');
    const r = searchAlphaBeta(pos, { maxDepth: 2, timeMs: 5000 });
    expect(r?.move.startsWith('5e2b')).toBe(true);
  });

  it('取られる駒を取り返される形では、取らない（駒損を避ける）', () => {
    // 先手の飛車 5h、後手の歩 5d を後手の銀 5c が守っている → 飛車で歩を取ると飛車をとられる
    const pos = parseSfen('k8/9/4s4/4p4/9/9/9/4R4/8K b - 1');
    const r = searchAlphaBeta(pos, { maxDepth: 2, timeMs: 5000 });
    expect(r?.move).not.toBe('5h5d');
    expect(r?.move).not.toBe('5h5d+');
  });

  it('時間を過ぎたら、読み切れた深さの手を返す（深さ 1 は必ず読む）', () => {
    const pos = ['7g7f', '3c3d'].reduce(playMove, parseSfen(INITIAL_SFEN));
    let t = 0;
    const r = searchAlphaBeta(pos, { maxDepth: 6, timeMs: 10, now: () => (t += 1) });
    expect(r?.depth).toBeGreaterThanOrEqual(1);
    expect(r?.depth).toBeLessThan(6);
    expect(legalMoves(pos)).toContain(r?.move);
  });

  it('ゆらぎがあっても、いつも合法手を返す', () => {
    let pos = parseSfen(INITIAL_SFEN);
    const rng = createRng(3);
    for (let i = 0; i < 12; i++) {
      const r = searchAlphaBeta(pos, { maxDepth: 2, timeMs: 2000, noise: 150, rng });
      expect(r).toBeDefined();
      expect(legalMoves(pos)).toContain(r?.move);
      pos = playMove(pos, r?.move ?? '');
    }
  });

  it('ゆらぎ 0 でも、同点の手は乱数で選ぶ（毎回同じ手にならない）', () => {
    const pos = parseSfen(INITIAL_SFEN);
    const seen = new Set<string | undefined>();
    for (let seed = 1; seed <= 20; seed++) {
      seen.add(searchAlphaBeta(pos, { maxDepth: 2, timeMs: 5000, rng: createRng(seed) })?.move);
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it('指せる手が無ければ undefined', () => {
    // 後手玉が詰んでいる局面（後手番）
    const pos = parseSfen('4k4/4G4/4P4/9/9/9/9/9/4K4 w 2r2b3g4s4n4l17p 2');
    expect(searchAlphaBeta(pos, { maxDepth: 2, timeMs: 1000 })).toBeUndefined();
  });
});
