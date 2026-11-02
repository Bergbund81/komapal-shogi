// 形勢ゲージのための解析の進め方。DOM を使わないので単体テストできる。
// 解析するのは「人の番になったとき」だけ。人が指して CPU が考え始めたら、すぐやめる
// （CPU の思考と評価がぶつからないように。Worker 側にも同じ守りがある）。
import { AiCancelledError, type AiClient } from '../ai/client';
import type { Analysis } from '../analysis/evaluate';
import type { GameSession } from '../game/session';
import type { Color } from '../rules';

export interface AnalysisTurnOptions {
  session: GameSession;
  client: Pick<AiClient, 'analyze' | 'cancelAnalysis'>;
  /** CPU 戦での人の色。undefined（ふたりでたいせん）なら毎手読む */
  humanColor: Color | undefined;
  /** CPU が考え中か */
  isCpuThinking: () => boolean;
  /** ゲージが出ているか（OFF のときは読まない） */
  enabled: () => boolean;
  /** 結果が届いたとき（画面の更新） */
  onChange: () => void;
}

/** 読んだ局面の目印（開始局面＋手順） */
function keyOf(session: GameSession): string {
  return `${session.startSfen}|${session.history.join(' ')}`;
}

export class AnalysisTurn {
  private generation = 0;
  /** 読みに出した（または読み終えた）局面。同じ局面を何度も出さないため */
  private requestedKey: string | undefined;
  private latestKey: string | undefined;
  private latestAnalysis: Analysis | undefined;
  private waiting = false;
  /** 待った・すすむで同じ局面に戻ったとき、読みなおさない */
  private readonly cache = new Map<string, Analysis>();

  constructor(private readonly opts: AnalysisTurnOptions) {}

  /** いちばん新しい解析結果。今の局面のものとは限らない（isFresh で確かめる） */
  get latest(): Analysis | undefined {
    return this.latestAnalysis;
  }

  /** latest が、いま盤にある局面の結果か */
  get isFresh(): boolean {
    return this.latestKey === keyOf(this.opts.session);
  }

  /** 読んでいる最中か */
  get isWaiting(): boolean {
    return this.waiting;
  }

  /** 局面や状態が変わったら呼ぶ（何度呼んでもよい）。読むべき局面なら読みに出し、そうでなければやめる */
  sync(): void {
    const { session, humanColor } = this.opts;
    const mine = humanColor === undefined || session.turn === humanColor;
    if (!this.opts.enabled() || session.isOver || !mine || this.opts.isCpuThinking()) {
      this.cancel();
      return;
    }
    const key = keyOf(session);
    if (key === this.requestedKey) return;
    this.requestedKey = key;
    const cached = this.cache.get(key);
    if (cached) {
      this.setLatest(key, cached);
      return;
    }
    const gen = ++this.generation;
    this.waiting = true;
    this.opts.client
      .analyze({ startSfen: session.startSfen, moves: [...session.history] })
      .then((analysis) => {
        if (gen !== this.generation) return;
        this.cache.set(key, analysis);
        this.waiting = false;
        this.setLatest(key, analysis);
      })
      .catch((err: unknown) => {
        if (gen !== this.generation || err instanceof AiCancelledError) return;
        this.waiting = false; // 読めなかった。この局面では読みなおさない
        this.opts.onChange();
      });
  }

  private setLatest(key: string, analysis: Analysis): void {
    this.latestKey = key;
    this.latestAnalysis = analysis;
    this.opts.onChange();
  }

  /** 読むのをやめる。新しい対局・CPU が考え始めたときなど */
  cancel(): void {
    if (!this.waiting && this.requestedKey === undefined) return;
    this.generation++;
    this.requestedKey = undefined;
    this.waiting = false;
    this.opts.client.cancelAnalysis();
  }
}
