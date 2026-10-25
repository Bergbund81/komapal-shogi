// 種を渡せる乱数（mulberry32）。テストと自己対局を同じ結果で再現できるようにする。
export type Rng = () => number;

/** 0 以上 1 未満の乱数を返す関数を作る */
export function createRng(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 毎回ちがう種の乱数（対局用） */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000);
}

/** 配列から 1 つ選ぶ。空なら undefined */
export function pick<T>(items: readonly T[], rng: Rng): T | undefined {
  return items[Math.floor(rng() * items.length)];
}
