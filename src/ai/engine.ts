// やねうら王（USI エンジン）とのやり取り。AI の Worker の中で使う。
// エンジン本体は EngineBackend として差し替えられる（ブラウザ = 入れ子の Worker、Node = 直接読み込み、テスト = 偽物）。
import type { PositionSpec } from './protocol';

/** エンジンの入出力。send で USI コマンドを送り、出力は 1 行ずつ onLine に届く */
export interface EngineBackend {
  send(command: string): void;
  onLine(listener: (line: string) => void): void;
  dispose(): void;
}

/** 詰みの評価値（cp に直したとき）。n 手で詰ますなら MATE_SCORE - n */
export const MATE_SCORE = 30000;

export interface UsiInfo {
  multipv: number;
  depth: number;
  /** 手番側から見た点（詰みは ±(MATE_SCORE - 手数)） */
  score: number;
  /** 詰みまでの手数。正 = 手番側が詰ます、負 = 詰まされる */
  mate?: number;
  nodes?: number;
  nps?: number;
  pv: string[];
}

const USI_MOVE = /^([1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])$/;

/** "info ..." の 1 行を読む。評価値が無い行は undefined */
export function parseInfo(line: string): UsiInfo | undefined {
  const t = line.trim().split(/\s+/);
  if (t[0] !== 'info') return undefined;
  const info: UsiInfo = { multipv: 1, depth: 0, score: 0, pv: [] };
  let hasScore = false;
  // 知らない項目（seldepth・time・hashfull・lowerbound など）は読み飛ばす
  for (let i = 1; i < t.length; i++) {
    const key = t[i];
    const value = t[i + 1] ?? '';
    if (key === 'pv') {
      info.pv = t.slice(i + 1).filter((m) => USI_MOVE.test(m));
      break;
    }
    if (key === 'multipv') info.multipv = Number(value);
    else if (key === 'depth') info.depth = Number(value);
    else if (key === 'nodes') info.nodes = Number(value);
    else if (key === 'nps') info.nps = Number(value);
    else if (key === 'score' && value === 'cp') {
      info.score = Number(t[i + 2]);
      hasScore = true;
    } else if (key === 'score' && value === 'mate') {
      // "mate -0" や "mate -" は「詰まされる」、"mate +" は「詰ます」（手数不明）
      const raw = t[i + 2] ?? '';
      const negative = raw.startsWith('-');
      const n = Math.abs(Number(raw.replace(/^[+-]/, '')) || 0);
      info.mate = negative ? -n : n;
      info.score = negative ? -(MATE_SCORE - n) : MATE_SCORE - n;
      hasScore = true;
    }
  }
  return hasScore ? info : undefined;
}

export interface Candidate {
  move: string;
  score: number;
  mate?: number;
  pv: string[];
}

export interface SearchResult {
  /** エンジンの bestmove（"resign" / "win" のこともある） */
  bestmove: string;
  /** MultiPV の候補（multipv 順）。info が出なかったときは空 */
  candidates: Candidate[];
  nps?: number;
}

export interface GoOptions {
  nodes?: number;
  byoyomiMs?: number;
  multipv: number;
}

export interface EngineOptions {
  threads: number;
  hashMb: number;
}

/** USI の position コマンド */
export function positionCommand(spec: PositionSpec): string {
  const moves = spec.moves.length > 0 ? ` moves ${spec.moves.join(' ')}` : '';
  return `position sfen ${spec.startSfen}${moves}`;
}

/** やねうら王を USI で動かす。go は 1 つずつ順番に実行する */
export class UsiEngine {
  private waiters: Array<{ match: (line: string) => boolean; resolve: () => void }> = [];
  private infos = new Map<number, UsiInfo>();
  private bestmove: ((result: SearchResult) => void) | undefined;
  private chain: Promise<unknown> = Promise.resolve();
  private multipv = 1;
  private lastNps: number | undefined;

  constructor(private readonly backend: EngineBackend) {
    backend.onLine((line) => this.receive(line));
  }

  private receive(line: string): void {
    for (const w of [...this.waiters]) {
      if (w.match(line)) {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        w.resolve();
      }
    }
    if (line.startsWith('info')) {
      const info = parseInfo(line);
      if (info) {
        this.infos.set(info.multipv, info);
        if (info.nps !== undefined) this.lastNps = info.nps;
      }
      return;
    }
    if (line.startsWith('bestmove') && this.bestmove) {
      const done = this.bestmove;
      this.bestmove = undefined;
      const candidates: Candidate[] = [...this.infos.entries()]
        .sort(([a], [b]) => a - b)
        .flatMap(([, info]) => {
          const move = info.pv[0];
          if (!move) return [];
          const c: Candidate = { move, score: info.score, pv: info.pv };
          if (info.mate !== undefined) c.mate = info.mate;
          return [c];
        });
      const result: SearchResult = { bestmove: line.split(/\s+/)[1] ?? '', candidates };
      if (this.lastNps !== undefined) result.nps = this.lastNps;
      done(result);
    }
  }

  private waitFor(token: string): Promise<void> {
    return new Promise((resolve) =>
      this.waiters.push({ match: (l) => l.trim() === token, resolve }),
    );
  }

  /** usi → setoption → isready。readyok まで待つ */
  async init(options: EngineOptions): Promise<void> {
    const usiok = this.waitFor('usiok');
    this.backend.send('usi');
    await usiok;
    for (const [name, value] of [
      ['Threads', options.threads],
      ['USI_Hash', options.hashMb],
      ['MultiPV', 1],
      // 定跡ファイルは同梱しない。入玉宣言は CPU からはしない（宣言は人のメニューだけ）
      ['USI_OwnBook', 'false'],
      ['EnteringKingRule', 'NoEnteringKing'],
      ['NetworkDelay', 0],
      ['NetworkDelay2', 0],
      ['MinimumThinkingTime', 1000],
      ['PvInterval', 0],
      ['ConsiderationMode', 'true'],
      ['MaxMovesToDraw', 0],
    ] as const) {
      this.backend.send(`setoption name ${name} value ${value}`);
    }
    const ready = this.waitFor('readyok');
    this.backend.send('isready');
    await ready;
    this.backend.send('usinewgame');
  }

  /** 局面を読んで結果を返す。前の go が終わるまで待ってから始める */
  go(spec: PositionSpec, opts: GoOptions): Promise<SearchResult> {
    const run = (): Promise<SearchResult> =>
      new Promise((resolve) => {
        this.infos.clear();
        this.bestmove = resolve;
        if (opts.multipv !== this.multipv) {
          this.multipv = opts.multipv;
          this.backend.send(`setoption name MultiPV value ${opts.multipv}`);
        }
        this.backend.send(positionCommand(spec));
        const limits: string[] = [];
        if (opts.byoyomiMs !== undefined) limits.push(`btime 0 wtime 0 byoyomi ${opts.byoyomiMs}`);
        if (opts.nodes !== undefined) limits.push(`nodes ${opts.nodes}`);
        this.backend.send(`go ${limits.join(' ')}`.trim());
      });
    const next = this.chain.then(run, run);
    this.chain = next;
    return next;
  }

  /** 考え中なら打ち切らせる（bestmove はすぐ返ってくる） */
  stop(): void {
    if (this.bestmove) this.backend.send('stop');
  }

  dispose(): void {
    this.backend.send('quit');
    this.backend.dispose();
  }
}

/**
 * ブラウザ用: public/engine/engine-host.js を入れ子の Worker として起動する。
 * 読み込みに失敗したら reject（呼び出し側が自作αβに切り替える）
 */
export function createWorkerBackend(url: string, timeoutMs = 30_000): Promise<EngineBackend> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(url);
    const listeners: Array<(line: string) => void> = [];
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('エンジンの読み込みに時間がかかりすぎました'));
    }, timeoutMs);
    const fail = (message: string): void => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(message));
    };
    worker.onerror = (ev) => fail(ev.message || 'エンジンの Worker でエラーがおきました');
    worker.onmessage = (
      ev: MessageEvent<
        { type: 'ready' } | { type: 'line'; line: string } | { type: 'error'; message: string }
      >,
    ) => {
      const msg = ev.data;
      if (msg.type === 'line') for (const l of listeners) l(msg.line);
      else if (msg.type === 'error') fail(msg.message);
      else {
        clearTimeout(timer);
        resolve({
          send: (command) => worker.postMessage(command),
          onLine: (listener) => listeners.push(listener),
          dispose: () => worker.terminate(),
        });
      }
    };
  });
}

/** この環境でスレッド版 wasm が動くか。だめなら理由を返す */
export function engineUnsupportedReason(): string | undefined {
  const g = globalThis as { crossOriginIsolated?: boolean };
  if (typeof WebAssembly !== 'object') return 'WebAssembly が使えません';
  if (typeof SharedArrayBuffer === 'undefined' || g.crossOriginIsolated === false) {
    return 'SharedArrayBuffer が使えません（クロスオリジン分離になっていません）';
  }
  if (typeof Worker === 'undefined') return 'Worker が使えません';
  return undefined;
}
