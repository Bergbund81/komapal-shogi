// Worker の中身。DOM にも Worker にも依存しないので、Vitest からそのまま試せる。
// L1〜3 = こども AI、L4〜7 = 自作αβ、L8〜10 = やねうら王（読み込めなければ自作αβ = かんたんモード）。
import { INITIAL_SFEN, parseSfen, playMove, type Position } from '../rules';
import {
  createWorkerBackend,
  engineUnsupportedReason,
  UsiEngine,
  type EngineBackend,
} from './engine';
import { chooseSearchMove, goOptionsFor, pickEngineMove, type ChosenMove } from './engine-ai';
import { chooseKidsMove } from './kids-ai';
import {
  BENCH_NODES,
  ENGINE_HASH_MB,
  ENGINE_MAX_THREADS,
  getLevel,
  type EngineParams,
} from './levels';
import type { AiRequest, AiResponse, PositionSpec } from './protocol';
import { createRng, randomSeed, type Rng } from './rng';

function buildPosition(spec: PositionSpec): Position {
  let pos = parseSfen(spec.startSfen);
  for (const usi of spec.moves) pos = playMove(pos, usi);
  return pos;
}

/** 読み込みが済んだエンジンと、起動時に測った速さ */
export interface LoadedEngine {
  engine: UsiEngine;
  nps?: number;
}

export interface AiHandlerDeps {
  /** エンジン本体を起動する（テストで偽物に差し替える） */
  createBackend: (url: string) => Promise<EngineBackend>;
  /** この環境でエンジンが動かない理由。動くなら undefined */
  unsupportedReason: () => string | undefined;
  threads: () => number;
  /** エンジンの返事が来ないときにあきらめるまでの余裕（ミリ秒） */
  watchdogMs: number;
}

function defaultThreads(): number {
  const cores = typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 2;
  return Math.min(ENGINE_MAX_THREADS, Math.max(1, cores - 1));
}

const DEFAULT_DEPS: AiHandlerDeps = {
  createBackend: (url) => createWorkerBackend(url),
  unsupportedReason: engineUnsupportedReason,
  threads: defaultThreads,
  watchdogMs: 20_000,
};

class Timeout extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Timeout('エンジンから返事がありません')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/** メッセージを 1 件ずつ受け取る関数を作る。返事は post に渡す */
export function createAiHandler(
  post: (response: AiResponse) => void,
  deps: Partial<AiHandlerDeps> = {},
): (req: AiRequest) => void {
  const d: AiHandlerDeps = { ...DEFAULT_DEPS, ...deps };
  /** stop が来た要求の id。計算の前後で見て、返事を出さない */
  const stopped = new Set<number>();
  /** warmup 前は undefined。読み込めなかったときは undefined に解決する */
  let enginePromise: Promise<LoadedEngine | undefined> | undefined;
  /** いまエンジンが考えている要求 */
  let searchingId: number | undefined;

  function fallback(reason: string): undefined {
    post({ type: 'engine-status', status: 'fallback', reason });
    return undefined;
  }

  async function loadEngine(url: string): Promise<LoadedEngine | undefined> {
    const reason = d.unsupportedReason();
    if (reason) return fallback(reason);
    post({ type: 'engine-status', status: 'loading' });
    let engine: UsiEngine | undefined;
    try {
      engine = new UsiEngine(await d.createBackend(url));
      await withTimeout(
        engine.init({ threads: d.threads(), hashMb: ENGINE_HASH_MB }),
        d.watchdogMs,
      );
      // 端末の速さを測る（L5 を遅い端末で短く打ち切るため）
      const bench = await withTimeout(
        engine.go({ startSfen: INITIAL_SFEN, moves: [] }, { nodes: BENCH_NODES, multipv: 1 }),
        d.watchdogMs,
      );
      post({ type: 'engine-status', status: 'ready' });
      return bench.nps === undefined ? { engine } : { engine, nps: bench.nps };
    } catch (err) {
      engine?.dispose();
      return fallback(err instanceof Error ? err.message : String(err));
    }
  }

  function warmup(engineUrl: string | null): void {
    if (enginePromise) return;
    enginePromise =
      engineUrl === null
        ? Promise.resolve(fallback('エンジンを使わない設定です'))
        : loadEngine(engineUrl);
  }

  async function engineMove(
    req: Extract<AiRequest, { type: 'choose' }>,
    pos: Position,
    params: EngineParams,
    rng: Rng,
  ): Promise<ChosenMove | undefined> {
    const loaded = await (enginePromise ?? Promise.resolve(undefined));
    if (!loaded || stopped.has(req.id)) return undefined;
    searchingId = req.id;
    try {
      const opts = goOptionsFor(params, loaded.nps);
      const limit = (opts.byoyomiMs ?? 0) + d.watchdogMs;
      const result = await withTimeout(loaded.engine.go(req, opts), limit);
      return pickEngineMove(pos, result, params, rng);
    } catch (err) {
      if (!(err instanceof Timeout)) throw err;
      // 返事が来ない = エンジンが止まった。これからはかんたんモードで続ける
      loaded.engine.dispose();
      enginePromise = Promise.resolve(fallback(err.message));
      return undefined;
    } finally {
      if (searchingId === req.id) searchingId = undefined;
    }
  }

  async function choose(req: Extract<AiRequest, { type: 'choose' }>): Promise<void> {
    const level = getLevel(req.level);
    if (!level?.available || (!level.kids && !level.search && !level.engine)) {
      post({ type: 'error', id: req.id, message: `レベル${req.level}はまだ使えません` });
      return;
    }
    const pos = buildPosition(req);
    const rng = createRng(req.seed ?? randomSeed());
    if (level.kids) {
      const move = chooseKidsMove(pos, level.kids, rng);
      if (stopped.has(req.id)) return;
      post(move ? { type: 'bestmove', id: req.id, move } : { type: 'nomove', id: req.id });
      return;
    }
    let chosen: ChosenMove | undefined;
    if (level.search) chosen = chooseSearchMove(pos, level.search, rng);
    else {
      const params = level.engine as EngineParams;
      chosen = await engineMove(req, pos, params, rng);
      if (stopped.has(req.id)) return;
      chosen ??= chooseSearchMove(pos, params.fallback, rng);
    }
    if (stopped.has(req.id)) return;
    post(
      chosen
        ? { type: 'bestmove', id: req.id, move: chosen.move, score: chosen.score }
        : { type: 'nomove', id: req.id },
    );
  }

  return (req) => {
    if (req.type === 'warmup') {
      warmup(req.engineUrl);
      return;
    }
    if (req.type === 'stop') {
      stopped.add(req.id);
      if (searchingId === req.id) {
        void enginePromise?.then((loaded) => loaded?.engine.stop());
      }
      return;
    }
    if (req.type === 'analyze') {
      post({ type: 'unsupported', id: req.id });
      return;
    }
    // 一度メッセージ処理に制御を返す。直後に stop が届いていれば計算せずに捨てる
    setTimeout(() => {
      if (stopped.has(req.id)) return;
      choose(req).catch((err: unknown) => {
        post({
          type: 'error',
          id: req.id,
          message: err instanceof Error ? err.message : String(err),
        });
      });
    }, 0);
  };
}
