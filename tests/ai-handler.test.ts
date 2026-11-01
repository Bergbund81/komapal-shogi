// AI の Worker の中身（メッセージ処理）と、画面側の窓口
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiCancelledError, AiClient, type WorkerLike } from '../src/ai/client';
import { createAiHandler } from '../src/ai/handler';
import type { AiRequest, AiResponse } from '../src/ai/protocol';
import { INITIAL_SFEN, legalMoves, parseSfen, playMove } from '../src/rules';
import { fakeEngine, type FakeEngine } from './fake-engine';

const spec = { startSfen: INITIAL_SFEN, moves: ['7g7f', '3c3d'] };
const afterSpec = spec.moves.reduce(playMove, parseSfen(INITIAL_SFEN));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const idOf = (r: AiResponse | undefined): number | undefined =>
  r && r.type !== 'engine-status' ? r.id : undefined;

describe('createAiHandler', () => {
  it('choose は局面の合法手を返す', () => {
    const out: AiResponse[] = [];
    const handle = createAiHandler((r) => out.push(r));
    handle({ type: 'choose', id: 1, level: 1, seed: 5, ...spec });
    vi.runAllTimers();
    expect(out).toHaveLength(1);
    const res = out[0];
    expect(res?.type).toBe('bestmove');
    expect(legalMoves(afterSpec)).toContain(res?.type === 'bestmove' ? res.move : '');
    expect(idOf(res)).toBe(1);
  });

  it('stop した要求には返事を出さない', () => {
    const out: AiResponse[] = [];
    const handle = createAiHandler((r) => out.push(r));
    handle({ type: 'choose', id: 1, level: 2, ...spec });
    handle({ type: 'stop', id: 1 });
    handle({ type: 'choose', id: 2, level: 2, ...spec });
    vi.runAllTimers();
    expect(out.map(idOf)).toEqual([2]);
  });

  it('analyze はフェーズ5まで unsupported', () => {
    const out: AiResponse[] = [];
    createAiHandler((r) => out.push(r))({ type: 'analyze', id: 3, ...spec });
    expect(out).toEqual([{ type: 'unsupported', id: 3 }]);
  });

  it('L4〜7 はエンジンを使わず自作αβで指し、評価値も返す', async () => {
    const out: AiResponse[] = [];
    const createBackend = vi.fn(() => Promise.resolve(fakeEngine()));
    const handle = createAiHandler((r) => out.push(r), {
      createBackend,
      unsupportedReason: () => undefined,
    });
    handle({ type: 'choose', id: 1, level: 4, seed: 3, ...spec });
    await vi.runAllTimersAsync();
    expect(createBackend).not.toHaveBeenCalled();
    const res = out.at(-1);
    expect(res?.type).toBe('bestmove');
    expect(legalMoves(afterSpec)).toContain(res?.type === 'bestmove' ? res.move : '');
    expect(res?.type === 'bestmove' && typeof res.score).toBe('number');
  });

  it('無いレベルや壊れた局面は error になる', async () => {
    const out: AiResponse[] = [];
    const handle = createAiHandler((r) => out.push(r));
    handle({ type: 'choose', id: 1, level: 99, ...spec });
    handle({ type: 'choose', id: 2, level: 1, startSfen: 'でたらめ', moves: [] });
    await vi.runAllTimersAsync();
    expect(out.map((r) => r.type)).toEqual(['error', 'error']);
  });
});

/** 速さ測定（go nodes 200000）への返事。nps 200 万の端末のふり */
const BENCH_REPLY = ['info depth 1 score cp 0 nps 2000000 pv 7g7f', 'bestmove 7g7f'];

/** 偽のエンジンを使う handler。warmup まで済ませる */
async function engineHandler(engine: FakeEngine, watchdogMs = 20_000) {
  const out: AiResponse[] = [];
  const handle = createAiHandler((r) => out.push(r), {
    createBackend: () => Promise.resolve(engine),
    unsupportedReason: () => undefined,
    threads: () => 2,
    watchdogMs,
  });
  handle({ type: 'warmup', engineUrl: 'engine/engine-host.js' });
  await vi.advanceTimersByTimeAsync(0);
  return { out, handle };
}

describe('createAiHandler（L8〜10 のやねうら王）', () => {
  it('warmup で読み込み、速さを測ってから ready を知らせる', async () => {
    const engine = fakeEngine();
    const { out } = await engineHandler(engine);
    expect(out).toEqual([
      { type: 'engine-status', status: 'loading' },
      { type: 'engine-status', status: 'ready' },
    ]);
    expect(engine.sent).toContain('setoption name Threads value 2');
    expect(engine.sent).toContain('go nodes 200000');
  });

  it('エンジンの手と評価値を返す（L9 は nodes 300000）', async () => {
    const engine = fakeEngine((_pos, go) =>
      go === 'go nodes 300000'
        ? ['info depth 9 score cp -250 nodes 300000 pv 8h2b+ 3a2b', 'bestmove 8h2b+']
        : BENCH_REPLY,
    );
    const { out, handle } = await engineHandler(engine);
    handle({ type: 'choose', id: 1, level: 9, ...spec });
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.sent).toContain(`position sfen ${INITIAL_SFEN} moves 7g7f 3c3d`);
    expect(out.at(-1)).toEqual({ type: 'bestmove', id: 1, move: '8h2b+', score: -250 });
  });

  it('L8 は MultiPV で候補を出させ、その中からゆらぎつきで選ぶ', async () => {
    const engine = fakeEngine((_pos, go) =>
      go === 'go nodes 3000'
        ? [
            'info depth 3 score cp 90 multipv 1 pv 2g2f',
            'info depth 3 score cp 80 multipv 2 pv 8h2b+',
            'info depth 3 score cp 70 multipv 3 pv 6i7h',
            'info depth 3 score cp -900 multipv 4 pv 9g9f',
            'bestmove 2g2f',
          ]
        : BENCH_REPLY,
    );
    const { out, handle } = await engineHandler(engine);
    const picked = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      handle({ type: 'choose', id: seed, level: 8, seed, ...spec });
      await vi.advanceTimersByTimeAsync(0);
      const res = out.at(-1);
      if (res?.type === 'bestmove') {
        picked.add(res.move);
        expect(res.score).toBe(90); // 投了の判断には最善の値を使う
      }
    }
    expect(engine.sent).toContain('setoption name MultiPV value 4');
    expect(picked.size).toBeGreaterThan(1);
    expect(picked.has('9g9f')).toBe(false); // ずっと悪い手は選ばない
  });

  it('エンジンが合法手でない手を返したら、自作αβの手にする', async () => {
    const engine = fakeEngine((_pos, go) =>
      go === 'go nodes 300000' ? ['info depth 1 score cp 0 pv 5e5d', 'bestmove 5e5d'] : BENCH_REPLY,
    );
    const { out, handle } = await engineHandler(engine);
    handle({ type: 'choose', id: 1, level: 9, ...spec });
    await vi.advanceTimersByTimeAsync(0);
    const res = out.at(-1);
    expect(res?.type).toBe('bestmove');
    expect(legalMoves(afterSpec)).toContain(res?.type === 'bestmove' ? res.move : '');
  });

  it('engineUrl が null ならかんたんモード（自作αβ）で指す', async () => {
    const out: AiResponse[] = [];
    const handle = createAiHandler((r) => out.push(r));
    handle({ type: 'warmup', engineUrl: null });
    handle({ type: 'choose', id: 1, level: 8, ...spec });
    await vi.runAllTimersAsync();
    expect(out[0]).toMatchObject({ type: 'engine-status', status: 'fallback' });
    const res = out.at(-1);
    expect(res?.type).toBe('bestmove');
    expect(legalMoves(afterSpec)).toContain(res?.type === 'bestmove' ? res.move : '');
  });

  it('読み込みに失敗したらかんたんモードを知らせる', async () => {
    const out: AiResponse[] = [];
    const handle = createAiHandler((r) => out.push(r), {
      createBackend: () => Promise.reject(new Error('読み込めません')),
      unsupportedReason: () => undefined,
    });
    handle({ type: 'warmup', engineUrl: 'engine/engine-host.js' });
    await vi.advanceTimersByTimeAsync(0);
    expect(out).toEqual([
      { type: 'engine-status', status: 'loading' },
      { type: 'engine-status', status: 'fallback', reason: '読み込めません' },
    ]);
  });

  it('クロスオリジン分離でない端末では読み込まずにかんたんモード', async () => {
    const out: AiResponse[] = [];
    const createBackend = vi.fn(() => Promise.resolve(fakeEngine()));
    const handle = createAiHandler((r) => out.push(r), {
      createBackend,
      unsupportedReason: () => 'SharedArrayBuffer が使えません',
    });
    handle({ type: 'warmup', engineUrl: 'engine/engine-host.js' });
    await vi.advanceTimersByTimeAsync(0);
    expect(createBackend).not.toHaveBeenCalled();
    expect(out).toEqual([
      { type: 'engine-status', status: 'fallback', reason: 'SharedArrayBuffer が使えません' },
    ]);
  });

  it('考え中に stop したらエンジンにも stop を送り、返事は出さない', async () => {
    const engine = fakeEngine((_pos, go) =>
      go.startsWith('go btime')
        ? { onStop: ['info depth 5 score cp 0 pv 2g2f', 'bestmove 2g2f'] }
        : BENCH_REPLY,
    );
    const { out, handle } = await engineHandler(engine);
    handle({ type: 'choose', id: 1, level: 10, ...spec });
    await vi.advanceTimersByTimeAsync(0);
    handle({ type: 'stop', id: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.sent.at(-1)).toBe('stop');
    expect(out.filter((r) => r.type === 'bestmove')).toEqual([]);
    // 次の要求はふつうに答える
    handle({ type: 'choose', id: 2, level: 1, ...spec });
    await vi.advanceTimersByTimeAsync(0);
    expect(idOf(out.at(-1))).toBe(2);
  });

  it('エンジンが返事をしなくなったら、かんたんモードに切り替えて指す', async () => {
    const engine = fakeEngine((_pos, go) => (go === 'go nodes 300000' ? null : BENCH_REPLY));
    const { out, handle } = await engineHandler(engine, 1000);
    handle({ type: 'choose', id: 1, level: 9, ...spec });
    await vi.advanceTimersByTimeAsync(1500);
    expect(engine.disposed).toBe(true);
    expect(out).toContainEqual({
      type: 'engine-status',
      status: 'fallback',
      reason: 'エンジンから返事がありません',
    });
    expect(out.at(-1)?.type).toBe('bestmove');
  });

  it('L10 は遅い端末では読む局面数に上限をつけて早めに打ち切る', async () => {
    const engine = fakeEngine((_pos, go) =>
      go.startsWith('go btime')
        ? ['info depth 5 score cp 0 pv 2g2f', 'bestmove 2g2f']
        : ['info depth 1 score cp 0 nps 400000 pv 7g7f', 'bestmove 7g7f'],
    );
    const { handle } = await engineHandler(engine);
    handle({ type: 'choose', id: 1, level: 10, ...spec });
    await vi.advanceTimersByTimeAsync(0);
    // 40 万 nps × 1.5 秒
    expect(engine.sent).toContain('go btime 0 wtime 0 byoyomi 3000 nodes 600000');
  });

  it('L10 は速い端末では 3 秒そのまま', async () => {
    const engine = fakeEngine((_pos, go) =>
      go.startsWith('go btime')
        ? ['info depth 5 score cp 0 pv 2g2f', 'bestmove 2g2f']
        : BENCH_REPLY,
    );
    const { handle } = await engineHandler(engine);
    handle({ type: 'choose', id: 1, level: 10, ...spec });
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.sent).toContain('go btime 0 wtime 0 byoyomi 3000');
  });
});

/** AiClient と handler を、Worker の代わりにそのままつなぐ */
function loopbackWorker(): WorkerLike & { sent: AiRequest[] } {
  const sent: AiRequest[] = [];
  const handle = createAiHandler((res) =>
    worker.onmessage?.({ data: res } as MessageEvent<AiResponse>),
  );
  const worker: WorkerLike & { sent: AiRequest[] } = {
    sent,
    onmessage: null,
    onerror: null,
    postMessage: (req) => {
      sent.push(req);
      handle(req);
    },
    terminate: () => undefined,
  };
  return worker;
}

describe('AiClient', () => {
  it('返事の手を受け取る', async () => {
    const client = new AiClient(loopbackWorker);
    const promise = client.choose(1, spec, 9);
    vi.runAllTimers();
    const move = await promise;
    expect(legalMoves(afterSpec)).toContain(move?.move);
  });

  it('stop すると待っていた要求が AiCancelledError で終わる', async () => {
    const worker = loopbackWorker();
    const client = new AiClient(() => worker);
    const promise = client.choose(1, spec);
    const caught = promise.catch((e: unknown) => e);
    client.stop();
    vi.runAllTimers();
    expect(await caught).toBeInstanceOf(AiCancelledError);
    expect(worker.sent.map((r) => r.type)).toEqual(['choose', 'stop']);
  });

  it('Worker がエラーになったら待っていた要求は失敗し、次の要求でつくり直す', async () => {
    let created = 0;
    const client = new AiClient(() => {
      created++;
      return {
        onmessage: null,
        onerror: null,
        postMessage: () => undefined,
        terminate: () => undefined,
      };
    });
    const promise = client.choose(1, spec);
    const caught = promise.catch((e: unknown) => e);
    // 最初に作られた Worker のエラーを起こす
    (client as unknown as { worker: WorkerLike }).worker.onerror?.({} as ErrorEvent);
    expect(await caught).toBeInstanceOf(Error);
    void client.choose(1, spec).catch(() => undefined);
    expect(created).toBe(2);
  });

  it('engine-status を onEngineStatus に渡し、つくり直した Worker でも warmup する', () => {
    const workers: Array<WorkerLike & { sent: AiRequest[] }> = [];
    const client = new AiClient(() => {
      const w: WorkerLike & { sent: AiRequest[] } = {
        sent: [],
        onmessage: null,
        onerror: null,
        postMessage: (req) => w.sent.push(req),
        terminate: () => undefined,
      };
      workers.push(w);
      return w;
    });
    const statuses: string[] = [];
    client.onEngineStatus = (s, reason) => statuses.push(`${s} ${reason ?? ''}`.trim());
    client.warmup('engine/engine-host.js');
    workers[0]?.onmessage?.({
      data: { type: 'engine-status', status: 'fallback', reason: 'だめ' },
    } as MessageEvent<AiResponse>);
    expect(statuses).toEqual(['fallback だめ']);
    workers[0]?.onerror?.({} as ErrorEvent);
    void client.choose(1, spec).catch(() => undefined);
    expect(workers[1]?.sent.map((r) => r.type)).toEqual(['warmup', 'choose']);
  });
});
