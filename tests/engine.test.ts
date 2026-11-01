// やねうら王とのやり取り（USI の読み取り・手の選び方）と、本物の wasm を Node で動かす結合テスト
import { describe, expect, it } from 'vitest';
import { MATE_SCORE, parseInfo, positionCommand, UsiEngine } from '../src/ai/engine';
import { goOptionsFor, pickEngineMove } from '../src/ai/engine-ai';
import { getLevel, type EngineParams } from '../src/ai/levels';
import { createRng } from '../src/ai/rng';
import { INITIAL_SFEN, legalMoves, parseSfen, playMove } from '../src/rules';
import { createNodeBackend } from './engine-node';
import { fakeEngine } from './fake-engine';

const params = (level: number): EngineParams => {
  const p = getLevel(level)?.engine;
  if (!p) throw new Error(`L${level} にエンジン設定がありません`);
  return p;
};

describe('parseInfo', () => {
  it('cp・multipv・pv を読む（pv の中の rep_draw などは捨てる）', () => {
    expect(
      parseInfo(
        'info depth 6 seldepth 7 score cp -66 multipv 2 nodes 826 nps 22324 time 37 pv 5a4b 5h6g rep_draw',
      ),
    ).toEqual({ multipv: 2, depth: 6, score: -66, nodes: 826, nps: 22324, pv: ['5a4b', '5h6g'] });
  });

  it('詰みは ±(MATE_SCORE - 手数) にする', () => {
    expect(parseInfo('info depth 3 score mate 1 pv G*5b')).toMatchObject({
      mate: 1,
      score: MATE_SCORE - 1,
      pv: ['G*5b'],
    });
    expect(parseInfo('info depth 3 score mate -4 pv 5a4b')).toMatchObject({
      mate: -4,
      score: -(MATE_SCORE - 4),
    });
    expect(parseInfo('info depth 3 score mate -0')?.score).toBe(-MATE_SCORE);
  });

  it('lowerbound などがあっても読める。評価値の無い行は undefined', () => {
    expect(parseInfo('info depth 9 score cp 120 lowerbound nodes 10 pv 7g7f')?.score).toBe(120);
    expect(parseInfo('info string hello')).toBeUndefined();
    expect(parseInfo('bestmove 7g7f')).toBeUndefined();
  });
});

describe('positionCommand', () => {
  it('開始局面と手順を sfen で渡す', () => {
    expect(positionCommand({ startSfen: INITIAL_SFEN, moves: [] })).toBe(
      `position sfen ${INITIAL_SFEN}`,
    );
    expect(positionCommand({ startSfen: INITIAL_SFEN, moves: ['7g7f', '3c3d'] })).toBe(
      `position sfen ${INITIAL_SFEN} moves 7g7f 3c3d`,
    );
  });
});

describe('UsiEngine', () => {
  it('usiok・readyok を待ち、go の結果を multipv 順の候補にまとめる', async () => {
    const backend = fakeEngine(() => [
      'info depth 1 score cp 10 multipv 1 pv 7g7f',
      'info depth 1 score cp 5 multipv 2 pv 2g2f',
      'info depth 2 score cp 30 multipv 2 pv 2g2f 8c8d',
      'info depth 2 score cp 20 multipv 1 nps 1234 pv 7g7f 3c3d',
      'bestmove 2g2f ponder 8c8d',
    ]);
    const engine = new UsiEngine(backend);
    await engine.init({ threads: 3, hashMb: 64 });
    expect(backend.sent.slice(0, 3)).toEqual([
      'usi',
      'setoption name Threads value 3',
      'setoption name USI_Hash value 64',
    ]);
    expect(backend.sent.at(-2)).toBe('isready');
    expect(backend.sent.at(-1)).toBe('usinewgame');
    const result = await engine.go({ startSfen: INITIAL_SFEN, moves: [] }, { multipv: 2 });
    expect(result.bestmove).toBe('2g2f');
    expect(result.nps).toBe(1234);
    expect(result.candidates.map((c) => [c.move, c.score])).toEqual([
      ['7g7f', 20],
      ['2g2f', 30],
    ]);
  });

  it('go は 1 つずつ順番に動く', async () => {
    let n = 0;
    const backend = fakeEngine(() => {
      n++;
      return [`info depth 1 score cp ${n} pv 7g7f`, 'bestmove 7g7f'];
    });
    const engine = new UsiEngine(backend);
    await engine.init({ threads: 1, hashMb: 16 });
    const spec = { startSfen: INITIAL_SFEN, moves: [] };
    const [a, b] = await Promise.all([
      engine.go(spec, { multipv: 1, nodes: 10 }),
      engine.go(spec, { multipv: 1, nodes: 20 }),
    ]);
    expect([a.candidates[0]?.score, b.candidates[0]?.score]).toEqual([1, 2]);
    expect(backend.sent.filter((c) => c.startsWith('go'))).toEqual(['go nodes 10', 'go nodes 20']);
  });
});

describe('goOptionsFor / pickEngineMove', () => {
  it('L8 は nodes 3000・MultiPV 4、L9 は nodes 300000', () => {
    expect(goOptionsFor(params(8))).toEqual({ multipv: 4, nodes: 3000 });
    expect(goOptionsFor(params(9))).toEqual({ multipv: 1, nodes: 300_000 });
  });

  it('L10 は 3 秒。遅い端末だけ局面数の上限をつける', () => {
    expect(goOptionsFor(params(10))).toEqual({ multipv: 1, byoyomiMs: 3000 });
    expect(goOptionsFor(params(10), 5_000_000)).toEqual({ multipv: 1, byoyomiMs: 3000 });
    expect(goOptionsFor(params(10), 200_000)).toEqual({
      multipv: 1,
      byoyomiMs: 3000,
      nodes: 300_000,
    });
  });

  it('合法手でない候補は捨てる。全部だめなら undefined', () => {
    const pos = parseSfen(INITIAL_SFEN);
    const rng = createRng(1);
    const ok = pickEngineMove(
      pos,
      {
        bestmove: '5e5d',
        candidates: [
          { move: '5e5d', score: 500, pv: [] },
          { move: '7g7f', score: 40, pv: [] },
        ],
      },
      params(9),
      rng,
    );
    expect(ok).toEqual({ move: '7g7f', score: 40 });
    expect(
      pickEngineMove(pos, { bestmove: 'resign', candidates: [] }, params(9), rng),
    ).toBeUndefined();
  });

  it('詰みの候補があれば、ゆらぎがあっても必ず選ぶ', () => {
    const pos = parseSfen('4k4/9/4P4/9/9/9/9/9/4K4 b G2r2b3g4s4n4l17p 1');
    for (let seed = 1; seed <= 20; seed++) {
      const chosen = pickEngineMove(
        pos,
        {
          bestmove: 'G*5b',
          candidates: [
            { move: 'G*5b', score: MATE_SCORE - 1, mate: 1, pv: [] },
            { move: 'G*4b', score: 900, pv: [] },
            { move: 'G*6b', score: 900, pv: [] },
          ],
        },
        params(8),
        createRng(seed),
      );
      expect(chosen?.move).toBe('G*5b');
    }
  });
});

describe('本物のやねうら王（Node で wasm を動かす）', () => {
  it('初期局面から合法手を返し、1 手詰めを見つける', async () => {
    const engine = new UsiEngine(await createNodeBackend());
    try {
      await engine.init({ threads: 1, hashMb: 16 });
      const spec = { startSfen: INITIAL_SFEN, moves: ['7g7f', '3c3d'] };
      const res = await engine.go(spec, { multipv: 4, nodes: 3000 });
      const pos = spec.moves.reduce(playMove, parseSfen(INITIAL_SFEN));
      expect(legalMoves(pos)).toContain(res.bestmove);
      expect(res.candidates).toHaveLength(4);

      const mateSfen = '4k4/9/4P4/9/9/9/9/9/4K4 b G2r2b3g4s4n4l17p 1';
      const mate = await engine.go({ startSfen: mateSfen, moves: [] }, { multipv: 1, nodes: 3000 });
      expect(mate.bestmove).toBe('G*5b');
      expect(mate.candidates[0]?.mate).toBe(1);
    } finally {
      engine.dispose();
    }
  });
});
