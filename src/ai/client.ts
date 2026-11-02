// 画面側から AI の Worker を使うための窓口。要求ごとに id をふり、古い返事は捨てる。
import type { Analysis } from '../analysis/evaluate';
import type { AiRequest, AiResponse, EngineStatus, PositionSpec } from './protocol';

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

/** CPU が選んだ手。score は CPU から見た評価値（L4 以上のときだけ） */
export interface AiMove {
  move: string;
  score?: number;
}

interface Pending {
  resolve: (move: AiMove | undefined) => void;
  reject: (err: Error) => void;
}

function defaultWorker(): WorkerLike {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
}

export class AiClient {
  private worker: WorkerLike | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  /** 待っている解析（1 件だけ） */
  private analysis:
    | {
        id: number;
        resolve: (analysis: Analysis) => void;
        reject: (err: Error) => void;
      }
    | undefined;
  private engineUrl: string | null | undefined;
  /** エンジンの状態が変わったときに呼ばれる（「かんたんモード」の表示用） */
  onEngineStatus: ((status: EngineStatus, reason?: string) => void) | undefined;

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
    // つくり直した Worker でも、エンジンを読み込みなおす
    if (this.engineUrl !== undefined)
      worker.postMessage({ type: 'warmup', engineUrl: this.engineUrl });
    return worker;
  }

  private receive(res: AiResponse): void {
    if (res.type === 'engine-status') {
      this.onEngineStatus?.(res.status, res.reason);
      return;
    }
    if (this.analysis?.id === res.id) {
      const { resolve, reject } = this.analysis;
      this.analysis = undefined;
      if (res.type === 'analysis') resolve(res.analysis);
      else reject(new Error(res.type === 'error' ? res.message : '未対応の要求です'));
      return;
    }
    const p = this.pending.get(res.id);
    if (!p) return; // やめた要求の返事
    this.pending.delete(res.id);
    if (res.type === 'bestmove') {
      p.resolve(
        res.score === undefined ? { move: res.move } : { move: res.move, score: res.score },
      );
    } else if (res.type === 'nomove') p.resolve(undefined);
    else p.reject(new Error(res.type === 'error' ? res.message : '未対応の要求です'));
  }

  private failAll(err: Error): void {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
    this.analysis?.reject(err);
    this.analysis = undefined;
  }

  /**
   * やねうら王を裏で読み込み始める。盤を表示した後に呼ぶ。
   * engineUrl が null ならエンジンを使わない（かんたんモード）
   */
  warmup(engineUrl: string | null): void {
    if (this.engineUrl !== undefined) return;
    this.engineUrl = engineUrl;
    if (this.worker) this.worker.postMessage({ type: 'warmup', engineUrl });
    else this.ensureWorker();
  }

  /** 手を 1 つ選んでもらう。指せる手が無ければ undefined。stop() されたら AiCancelledError */
  choose(level: number, spec: PositionSpec, seed?: number): Promise<AiMove | undefined> {
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

  /**
   * 局面の形勢を解析してもらう。同時に待てるのは 1 件で、新しい要求を出すと前の要求は AiCancelledError になる。
   * 返事が来るのは Worker が CPU の思考とぶつからないときだけ（CPU が考え始めたら中断される）
   */
  analyze(spec: PositionSpec): Promise<Analysis> {
    this.cancelAnalysis();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.analysis = { id, resolve, reject };
      try {
        this.ensureWorker().postMessage({ type: 'analyze', id, ...spec });
      } catch (err) {
        this.analysis = undefined;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /** 解析をやめる（返事はもう要らない） */
  cancelAnalysis(): void {
    const a = this.analysis;
    if (!a) return;
    this.analysis = undefined;
    this.worker?.postMessage({ type: 'stop', id: a.id });
    a.reject(new AiCancelledError());
  }

  /** 考え中の手選びをすべてやめる（解析は cancelAnalysis で別にやめる） */
  stop(): void {
    for (const [id, p] of this.pending) {
      this.worker?.postMessage({ type: 'stop', id });
      p.reject(new AiCancelledError());
    }
    this.pending.clear();
  }

  dispose(): void {
    this.stop();
    this.cancelAnalysis();
    this.worker?.terminate();
    this.worker = undefined;
  }
}
