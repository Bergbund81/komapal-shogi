// 画面側から AI の Worker を使うための窓口。要求ごとに id をふり、古い返事は捨てる。
import type { AiRequest, AiResponse, PositionSpec } from './protocol';

/** Worker の代わりに差し替えられる最小限の形（テスト用） */
export interface WorkerLike {
  postMessage(message: AiRequest): void;
  terminate(): void;
  onmessage: ((ev: MessageEvent<AiResponse>) => void) | null;
  onerror: ((ev: ErrorEvent) => void) | null;
}

export class AiCancelledError extends Error {
  constructor() {
    super('考えるのをやめました');
    this.name = 'AiCancelledError';
  }
}

interface Pending {
  resolve: (move: string | undefined) => void;
  reject: (err: Error) => void;
}

function defaultWorker(): WorkerLike {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
}

export class AiClient {
  private worker: WorkerLike | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(private readonly createWorker: () => WorkerLike = defaultWorker) {}

  private ensureWorker(): WorkerLike {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    worker.onmessage = (ev) => this.receive(ev.data);
    worker.onerror = () => {
      this.failAll(new Error('AI の Worker でエラーがおきました'));
      this.worker?.terminate();
      this.worker = undefined; // 次の要求でつくり直す
    };
    this.worker = worker;
    return worker;
  }

  private receive(res: AiResponse): void {
    const p = this.pending.get(res.id);
    if (!p) return; // やめた要求の返事
    this.pending.delete(res.id);
    if (res.type === 'bestmove') p.resolve(res.move);
    else if (res.type === 'nomove') p.resolve(undefined);
    else p.reject(new Error(res.type === 'error' ? res.message : '未対応の要求です'));
  }

  private failAll(err: Error): void {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  /** 手を 1 つ選んでもらう。指せる手が無ければ undefined。stop() されたら AiCancelledError */
  choose(level: number, spec: PositionSpec, seed?: number): Promise<string | undefined> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        const req: AiRequest = {
          type: 'choose',
          id,
          level,
          ...spec,
          ...(seed === undefined ? {} : { seed }),
        };
        this.ensureWorker().postMessage(req);
      } catch (err) {
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /** 考え中の要求をすべてやめる */
  stop(): void {
    for (const [id, p] of this.pending) {
      this.worker?.postMessage({ type: 'stop', id });
      p.reject(new AiCancelledError());
    }
    this.pending.clear();
  }

  dispose(): void {
    this.stop();
    this.worker?.terminate();
    this.worker = undefined;
  }
}
