// こども AI（レベル1・2）: 必ず合法手を選ぶ、詰み・タダ取りの扱い
import { describe, expect, it } from 'vitest';
import { materialScore } from '../src/ai/eval';
import {
  chooseKidsMove,
  chooseRandomMove,
  freeCaptureMoves,
  mateInOneMoves,
} from '../src/ai/kids-ai';
import { getLevel, type KidsParams } from '../src/ai/levels';
import { createRng } from '../src/ai/rng';
import { INITIAL_SFEN, legalMoves, parseSfen } from '../src/rules';
import crosscheck from './fixtures/crosscheck-500.json';

const L1 = getLevel(1)?.kids as KidsParams;
const L2 = getLevel(2)?.kids as KidsParams;
/** 詰み・避ける動きを止めて、調べたい動きだけを見る */
const NO_AVOIDING = {
  mateInOneProb: 0,
  avoidHangProb: 0,
  avoidBigHangProb: 0,
  avoidKingAdvanceProb: 0,
};

interface Fixture {
  positions: Array<{ sfen: string }>;
}
const sfens = (crosscheck as Fixture).positions.map((p) => p.sfen);

// 後手玉 1a、先手の金 2c・歩 …: 3b の金打ちなどで 1 手詰め。先手は 1 手で詰ませられる
const MATE_IN_ONE = '8k/9/7G1/9/9/9/9/9/K8 b G 1';
// 先手の飛車 5e が、だれも守っていない後手の角 5a を取れる（取り返されない）
const FREE_BISHOP = '4b4/9/9/9/4R4/9/9/9/K7k b - 1';

describe('どのレベルも合法手だけを指す', () => {
  const rng = createRng(1);
  it.each(sfens.slice(0, 200).map((s, i) => [i, s] as const))('局面 %i', (_, sfen) => {
    const pos = parseSfen(sfen, false);
    const legal = legalMoves(pos);
    // 避ける確率をすべて 1 にしても、合法手の中から必ず選ぶ
    const avoidAll: KidsParams = {
      ...L1,
      avoidHangProb: 1,
      avoidBigHangProb: 1,
      avoidKingAdvanceProb: 1,
    };
    for (const params of [L1, L2, avoidAll]) {
      const move = chooseKidsMove(pos, params, rng);
      if (legal.length === 0) expect(move).toBeUndefined();
      else expect(legal).toContain(move);
    }
    const random = chooseRandomMove(pos, rng);
    if (legal.length > 0) expect(legal).toContain(random);
  });
});

describe('1 手詰め', () => {
  const pos = parseSfen(MATE_IN_ONE);
  const legal = legalMoves(pos);

  it('詰ませる手を見つけられる', () => {
    expect(mateInOneMoves(pos, legal).length).toBeGreaterThan(0);
  });

  it('L2 は見逃さない', () => {
    const mates = new Set(mateInOneMoves(pos, legal));
    for (let seed = 0; seed < 50; seed++) {
      expect(mates).toContain(chooseKidsMove(pos, L2, createRng(seed)));
    }
  });

  it('L1 は levels.ts の確率ほどしか気づかず、ふだんは別の手も指す', () => {
    const mates = new Set(mateInOneMoves(pos, legal));
    const rng = createRng(7);
    let found = 0;
    const trials = 600;
    for (let i = 0; i < trials; i++) {
      if (mates.has(chooseKidsMove(pos, L1, rng) ?? '')) found++;
    }
    // 気づく分 + ランダムに選んだ手がたまたま詰めの手になる分
    expect(found / trials).toBeGreaterThan(L1.mateInOneProb * 0.8);
    expect(found / trials).toBeLessThan(L1.mateInOneProb + 0.3);
    expect(found).toBeLessThan(trials);
  });
});

describe('タダ取り', () => {
  const pos = parseSfen(FREE_BISHOP, false);

  it('取り返されない取りだけを見つける', () => {
    expect(freeCaptureMoves(pos, legalMoves(pos))).toEqual(['5e5a', '5e5a+']);
  });

  it('L2 はタダの駒を取る', () => {
    for (let seed = 0; seed < 30; seed++) {
      const move = chooseKidsMove(pos, L2, createRng(seed));
      expect(move?.startsWith('5e5a')).toBe(true);
    }
  });

  it('L1 が取りにいく割合は levels.ts の設定どおり', () => {
    const rng = createRng(3);
    const trials = 2000;
    let taken = 0;
    for (let i = 0; i < trials; i++) {
      if (
        chooseKidsMove(pos, { ...L1, ...NO_AVOIDING, freePieceTakeProb: 0.5 }, rng)?.startsWith(
          '5e5a',
        )
      ) {
        taken++;
      }
    }
    // 0.5 + ランダムに選んだ手がたまたま取りの手になる分
    expect(taken / trials).toBeGreaterThan(0.45);
    expect(taken / trials).toBeLessThan(0.6);
  });
});

describe('L1 のうっかり', () => {
  const trials = 300;
  /** 後手の歩 5c が、5d に出た先手の飛車をタダで取れる形 */
  const hangPos = parseSfen('8k/9/4p4/9/4R4/9/9/9/K8 b - 1');
  const countMove = (pos: ReturnType<typeof parseSfen>, params: KidsParams, move: string) => {
    const rng = createRng(11);
    let n = 0;
    for (let i = 0; i < trials; i++) if (chooseKidsMove(pos, params, rng) === move) n++;
    return n;
  };
  const base: KidsParams = { ...L1, ...NO_AVOIDING, freePieceTakeProb: 0 };

  it('タダで取られる所へ飛車を出す手は、避ける確率 1 なら指さない', () => {
    const careful = { ...base, avoidHangProb: 1, avoidBigHangProb: 1 };
    expect(countMove(hangPos, careful, '5e5d')).toBe(0);
  });

  it('避ける確率 0 なら、ときどき飛車をうっかりおく', () => {
    expect(countMove(hangPos, base, '5e5d')).toBeGreaterThan(0);
  });

  it('大駒用の確率が小さければ、大駒はうっかりおく', () => {
    const careless = { ...base, avoidHangProb: 1, avoidBigHangProb: 0 };
    expect(countMove(hangPos, careless, '5e5d')).toBeGreaterThan(0);
  });

  it('王手されていないときの王の前進は、避ける確率 1 なら指さない', () => {
    const kingPos = parseSfen('8k/9/9/9/4K4/9/9/9/9 b - 1');
    const forward = ['5e5d', '5e4d', '5e6d'];
    const careful = { ...base, avoidKingAdvanceProb: 1 };
    const rng = createRng(5);
    for (let i = 0; i < trials; i++) {
      expect(forward).not.toContain(chooseKidsMove(kingPos, careful, rng));
    }
    expect(forward.some((m) => countMove(kingPos, base, m) > 0)).toBe(true);
  });
});

describe('駒得評価', () => {
  it('平手の初期局面は互角', () => {
    const pos = parseSfen(INITIAL_SFEN);
    expect(materialScore(pos, 'sente')).toBe(0);
    expect(materialScore(pos, 'gote')).toBe(0);
  });

  it('持ち駒も数える', () => {
    const pos = parseSfen('4k4/9/9/9/9/9/9/9/4K4 b 2P 1');
    expect(materialScore(pos, 'sente')).toBe(200);
    expect(materialScore(pos, 'gote')).toBe(-200);
  });
});

describe('同じ種なら同じ手', () => {
  it('種を固定すると再現できる', () => {
    const pos = parseSfen(INITIAL_SFEN);
    expect(chooseKidsMove(pos, L1, createRng(42))).toBe(chooseKidsMove(pos, L1, createRng(42)));
  });
});
