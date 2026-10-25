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
    for (const params of [L1, L2]) {
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

  it('L1 は気づくのが 3 割ほどで、ふだんは別の手も指す', () => {
    const mates = new Set(mateInOneMoves(pos, legal));
    const rng = createRng(7);
    let found = 0;
    const trials = 600;
    for (let i = 0; i < trials; i++) {
      if (mates.has(chooseKidsMove(pos, L1, rng) ?? '')) found++;
    }
    expect(found / trials).toBeGreaterThan(0.2);
    expect(found / trials).toBeLessThan(0.5);
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
        chooseKidsMove(pos, { ...L1, mateInOneProb: 0, freePieceTakeProb: 0.5 }, rng)?.startsWith(
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
