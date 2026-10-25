// AI の Worker の中身（メッセージ処理）と、画面側の窓口
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiCancelledError, AiClient, type WorkerLike } from '../src/ai/client';
import { createAiHandler } from '../src/ai/handler';
import type { AiRequest, AiResponse } from '../src/ai/protocol';
import { INITIAL_SFEN, legalMoves, parseSfen, playMove } from '../src/rules';

const spec = { startSfen: INITIAL_SFEN, moves: ['7g7f', '3c3d'] };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createAiHandler', () => {
  it('choose は局面の合法手を返す', () => {
    const out: AiResponse[] = [];
    const handle = createAiHandler((r) => out.push(r));
    handle({ type: 'choose', id: 1, level: 1, seed: 5, ...spec });
    vi.runAllTimers();
    const pos = spec.moves.reduce(playMove, parseSfen(INITIAL_SFEN));
    expect(out).toHaveLength(1);
    const res = out[0];
    expect(res?.type).toBe('bestmove');
    expect(legalMoves(pos)).toContain(res?.type === 'bestmove' ? res.move : '');
    expect(res?.id).toBe(1);
  });

  it('stop した要求には返事を出さない', () => {
    const out: AiResponse[] = [];
    const handle = createAiHandler((r) => out.push(r));
    handle({ type: 'choose', id: 1, level: 2, ...spec });
    handle({ type: 'stop', id: 1 });
    handle({ type: 'choose', id: 2, level: 2, ...spec });
    vi.runAllTimers();
    expect(out.map((r) => r.id)).toEqual([2]);
  });

  it('analyze はフェーズ5まで unsupported', () => {
    const out: AiResponse[] = [];
    createAiHandler((r) => out.push(r))({ type: 'analyze', id: 3, ...spec });
    expect(out).toEqual([{ type: 'unsupported', id: 3 }]);
  });

  it('まだ使えないレベルや壊れた局面は error になる', () => {
    const out: AiResponse[] = [];
    const handle = createAiHandler((r) => out.push(r));
    handle({ type: 'choose', id: 1, level: 5, ...spec });
    handle({ type: 'choose', id: 2, level: 1, startSfen: 'でたらめ', moves: [] });
    vi.runAllTimers();
    expect(out.map((r) => r.type)).toEqual(['error', 'error']);
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
    const pos = spec.moves.reduce(playMove, parseSfen(INITIAL_SFEN));
    expect(legalMoves(pos)).toContain(move);
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
});
