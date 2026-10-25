// 自己対局: CPU どうしを対戦させ、反則チェックと勝率を集計する。
//   npm run selfplay -- --black 2 --white 1 --games 50 [--seed 1] [--max-plies 300]
// レベル 0 は完全ランダム。先後は 1 局ごとに入れ替え、--black / --white は「A 側」「B 側」の意味。
import { chooseKidsMove, chooseRandomMove } from '../src/ai/kids-ai';
import { getLevel } from '../src/ai/levels';
import { createRng, type Rng } from '../src/ai/rng';
import { GameSession } from '../src/game/session';
import { legalMoves, type Color, type Position } from '../src/rules';

type Chooser = (pos: Position, rng: Rng) => string | undefined;

function chooserFor(level: number): { name: string; choose: Chooser } {
  if (level === 0) return { name: 'ランダム', choose: chooseRandomMove };
  const lv = getLevel(level);
  if (!lv?.kids || !lv.available) throw new Error(`レベル${level}は自己対局できません`);
  const params = lv.kids;
  return { name: `L${level} ${lv.name}`, choose: (pos, rng) => chooseKidsMove(pos, params, rng) };
}

function parseArgs(argv: string[]): {
  a: number;
  b: number;
  games: number;
  seed: number;
  maxPlies: number;
} {
  const get = (name: string, fallback: number): number => {
    const i = argv.indexOf(`--${name}`);
    const value = i >= 0 ? Number(argv[i + 1]) : fallback;
    if (!Number.isInteger(value)) throw new Error(`--${name} は整数で指定してください`);
    return value;
  };
  return {
    a: get('black', 1),
    b: get('white', 1),
    games: get('games', 50),
    seed: get('seed', 1),
    maxPlies: get('max-plies', 300),
  };
}

interface GameOutcome {
  winner: 'a' | 'b' | 'draw';
  plies: number;
  illegal: string[];
  reason: string;
}

function playGame(a: Chooser, b: Chooser, aColor: Color, rng: Rng, maxPlies: number): GameOutcome {
  const session = new GameSession();
  const illegal: string[] = [];
  while (!session.isOver && session.ply < maxPlies) {
    const chooser = session.turn === aColor ? a : b;
    const usi = chooser(session.position, rng);
    if (usi === undefined) break;
    if (!legalMoves(session.position).includes(usi)) {
      illegal.push(`${session.sfen} ${usi}`);
      break;
    }
    try {
      session.play(usi);
    } catch {
      illegal.push(`${session.sfen} ${usi}`);
      break;
    }
  }
  const status = session.status();
  if (status.type === 'playing' || !('winner' in status)) {
    return { winner: 'draw', plies: session.ply, illegal, reason: status.type };
  }
  return {
    winner: status.winner === aColor ? 'a' : 'b',
    plies: session.ply,
    illegal,
    reason: status.type,
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const a = chooserFor(args.a);
  const b = chooserFor(args.b);
  const rng = createRng(args.seed);
  const tally = { a: 0, b: 0, draw: 0 };
  const reasons = new Map<string, number>();
  let totalPlies = 0;
  let illegalCount = 0;
  const started = Date.now();

  for (let i = 0; i < args.games; i++) {
    const aColor: Color = i % 2 === 0 ? 'sente' : 'gote';
    const out = playGame(a.choose, b.choose, aColor, rng, args.maxPlies);
    tally[out.winner]++;
    totalPlies += out.plies;
    illegalCount += out.illegal.length;
    reasons.set(out.reason, (reasons.get(out.reason) ?? 0) + 1);
    for (const line of out.illegal) console.error(`反則: ${line}`);
  }

  const n = args.games;
  const pct = (x: number): string => `${((x / n) * 100).toFixed(1)}%`;
  const decided = tally.a + tally.b;
  console.log(
    `${a.name}（A） vs ${b.name}（B）  ${n}局  種=${args.seed}  手数上限=${args.maxPlies}`,
  );
  console.log(
    `  A勝ち ${tally.a} (${pct(tally.a)})  B勝ち ${tally.b} (${pct(tally.b)})  引き分け ${tally.draw} (${pct(tally.draw)})`,
  );
  if (decided > 0) {
    console.log(`  決着した対局だけで A の勝率 ${((tally.a / decided) * 100).toFixed(1)}%`);
  }
  console.log(
    `  平均手数 ${(totalPlies / n).toFixed(1)}  終わり方 ${[...reasons].map(([k, v]) => `${k}:${v}`).join(' ')}`,
  );
  console.log(
    `  反則 ${illegalCount}  かかった時間 ${((Date.now() - started) / 1000).toFixed(1)}秒`,
  );
  if (illegalCount > 0) process.exitCode = 1;
}

main();
