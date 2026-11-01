// 自己対局: CPU どうしを対戦させ、反則チェックと勝率を集計する。
//   npm run selfplay -- --black 2 --white 1 --games 50 [--seed 1] [--max-plies 300]
//   L8〜10 はやねうら王（wasm）を Node で動かす: [--threads 1] [--l10-ms 3000] [--easy]
// レベル 0 は完全ランダム。先後は 1 局ごとに入れ替え、--black / --white は「A 側」「B 側」の意味。
// --easy を付けると、L8〜10 はエンジンの代わりに自作αβ（かんたんモード）で指す。
// 投了するレベル（L8〜10）は画面と同じく、評価値 RESIGN_SCORE 以下が RESIGN_STREAK 手続いたら投了する。
import { UsiEngine } from '../src/ai/engine';
import { chooseSearchMove, goOptionsFor, pickEngineMove } from '../src/ai/engine-ai';
import { chooseKidsMove, chooseRandomMove } from '../src/ai/kids-ai';
import { ENGINE_HASH_MB, getLevel, RESIGN_SCORE, RESIGN_STREAK } from '../src/ai/levels';
import type { PositionSpec } from '../src/ai/protocol';
import { createRng, type Rng } from '../src/ai/rng';
import { GameSession } from '../src/game/session';
import { legalMoves, type Color, type Position } from '../src/rules';
import { createNodeBackend } from './engine-node';

interface Chosen {
  move: string;
  score?: number;
}

interface Player {
  name: string;
  resigns: boolean;
  choose: (pos: Position, spec: PositionSpec, rng: Rng) => Promise<Chosen | undefined>;
  dispose: () => void;
}

interface Args {
  a: number;
  b: number;
  games: number;
  seed: number;
  maxPlies: number;
  threads: number;
  l10Ms: number | undefined;
  easy: boolean;
}

async function playerFor(level: number, args: Args): Promise<Player> {
  const base = { dispose: () => undefined };
  if (level === 0) {
    return {
      ...base,
      name: 'ランダム',
      resigns: false,
      choose: (pos, _spec, rng) => {
        const move = chooseRandomMove(pos, rng);
        return Promise.resolve(move ? { move } : undefined);
      },
    };
  }
  const lv = getLevel(level);
  if (!lv?.available) throw new Error(`レベル${level}は自己対局できません`);
  const name = `L${level} ${lv.name}`;
  if (lv.kids) {
    const params = lv.kids;
    return {
      ...base,
      name,
      resigns: lv.resigns,
      choose: (pos, _spec, rng) => {
        const move = chooseKidsMove(pos, params, rng);
        return Promise.resolve(move ? { move } : undefined);
      },
    };
  }
  if (lv.search) {
    const params = lv.search;
    return {
      ...base,
      name,
      resigns: lv.resigns,
      choose: (pos, _spec, rng) => Promise.resolve(chooseSearchMove(pos, params, rng)),
    };
  }
  if (!lv.engine) throw new Error(`レベル${level}の設定がありません`);
  const params =
    level === 10 && args.l10Ms !== undefined ? { ...lv.engine, byoyomiMs: args.l10Ms } : lv.engine;
  if (args.easy) {
    return {
      ...base,
      name: `${name}（かんたんモード）`,
      resigns: lv.resigns,
      choose: (pos, _spec, rng) => Promise.resolve(chooseSearchMove(pos, params.fallback, rng)),
    };
  }
  // 先後で別々のエンジンを使う（置換表を共有しない）
  const engine = new UsiEngine(await createNodeBackend());
  await engine.init({ threads: args.threads, hashMb: ENGINE_HASH_MB });
  return {
    name,
    resigns: lv.resigns,
    choose: async (pos, spec, rng) => {
      const result = await engine.go(spec, goOptionsFor(params));
      return pickEngineMove(pos, result, params, rng);
    },
    dispose: () => engine.dispose(),
  };
}

function parseArgs(argv: string[]): Args {
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
    threads: get('threads', 1),
    l10Ms: argv.includes('--l10-ms') ? get('l10-ms', 3000) : undefined,
    easy: argv.includes('--easy'),
  };
}

interface GameOutcome {
  winner: 'a' | 'b' | 'draw';
  plies: number;
  illegal: string[];
  reason: string;
}

async function playGame(
  a: Player,
  b: Player,
  aColor: Color,
  rng: Rng,
  maxPlies: number,
): Promise<GameOutcome> {
  const session = new GameSession();
  const illegal: string[] = [];
  const losing: Record<Color, number> = { sente: 0, gote: 0 };
  while (!session.isOver && session.ply < maxPlies) {
    const turn = session.turn;
    const player = turn === aColor ? a : b;
    const spec = { startSfen: session.startSfen, moves: [...session.history] };
    const chosen = await player.choose(session.position, spec, rng);
    if (chosen === undefined) break;
    const isLosing = chosen.score !== undefined && chosen.score <= RESIGN_SCORE;
    losing[turn] = player.resigns && isLosing ? losing[turn] + 1 : 0;
    if (losing[turn] >= RESIGN_STREAK) {
      session.resign(turn);
      break;
    }
    if (!legalMoves(session.position).includes(chosen.move)) {
      illegal.push(`${session.sfen} ${chosen.move}`);
      break;
    }
    try {
      session.play(chosen.move);
    } catch {
      illegal.push(`${session.sfen} ${chosen.move}`);
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const a = await playerFor(args.a, args);
  const b = await playerFor(args.b, args);
  const rng = createRng(args.seed);
  const tally = { a: 0, b: 0, draw: 0 };
  const reasons = new Map<string, number>();
  let totalPlies = 0;
  let illegalCount = 0;
  const started = Date.now();

  for (let i = 0; i < args.games; i++) {
    const aColor: Color = i % 2 === 0 ? 'sente' : 'gote';
    const out = await playGame(a, b, aColor, rng, args.maxPlies);
    tally[out.winner]++;
    totalPlies += out.plies;
    illegalCount += out.illegal.length;
    reasons.set(out.reason, (reasons.get(out.reason) ?? 0) + 1);
    for (const line of out.illegal) console.error(`反則: ${line}`);
    const who = out.winner === 'draw' ? '引き分け' : out.winner === 'a' ? 'A' : 'B';
    console.error(
      `  ${i + 1}局目: A=${aColor === 'sente' ? '先手' : '後手'} → ${who}（${out.reason}・${out.plies}手）`,
    );
  }
  a.dispose();
  b.dispose();

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
  // やねうら王の Worker スレッドが残ってもプロセスを終わらせる
  process.exit();
}

void main();
