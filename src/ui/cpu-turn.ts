// CPU の番の進め方。DOM を使わないので単体テストできる。
// 人の手を先に画面へ出したあとで呼ぶと、AI に手を聞き、最低 MIN_THINK_MS たってから指す。
// L3 以上は、負けがはっきりした（評価値 RESIGN_SCORE 以下が RESIGN_STREAK 手続いた）ら投了する。
import { AiCancelledError, type AiClient } from '../ai/client';
import { RESIGN_SCORE, RESIGN_STREAK } from '../ai/levels';
import type { GameSession } from '../game/session';
import type { Color } from '../rules';

/** 考える時間の最低ライン。瞬間指しは子どもが手を追えない */
export const MIN_THINK_MS = 600;

export interface CpuTurnOptions {
  session: GameSession;
  client: Pick<AiClient, 'choose' | 'stop'>;
  cpuColor: Color;
  level: number;
  /** このレベルは投了するか（L3 以上） */
  resigns: boolean;
  /** CPU が指した直後に呼ばれる（画面の更新・アニメーション） */
  onMove: (usi: string) => void;
  /** CPU が投了した直後に呼ばれる */
  onResign: () => void;
  /** 考え始め/考え終わりで呼ばれる（「かんがえちゅう…」の表示） */
  onThinking: (thinking: boolean) => void;
  /** AI が失敗したとき */
  onError: (err: Error) => void;
  /** テストで差し替える */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class CpuTurn {
  private generation = 0;
  private thinking = false;
  /** 評価値が RESIGN_SCORE 以下だった手が何手続いているか */
  private losingStreak = 0;

  constructor(private readonly opts: CpuTurnOptions) {}

  get isThinking(): boolean {
    return this.thinking;
  }

  private setThinking(value: boolean): void {
    if (this.thinking === value) return;
    this.thinking = value;
    this.opts.onThinking(value);
  }

  /** CPU の番なら考え始める。CPU の番でなければ何もしない */
  async maybeStart(): Promise<void> {
    const { session, client, cpuColor, level } = this.opts;
    if (session.isOver || session.turn !== cpuColor || this.thinking) return;
    const gen = ++this.generation;
    this.setThinking(true);
    const sleep = this.opts.sleep ?? realSleep;
    try {
      const spec = { startSfen: session.startSfen, moves: [...session.history] };
      const [chosen] = await Promise.all([client.choose(level, spec), sleep(MIN_THINK_MS)]);
      if (gen !== this.generation) return;
      if (chosen === undefined) return;
      const losing = chosen.score !== undefined && chosen.score <= RESIGN_SCORE;
      this.losingStreak = this.opts.resigns && losing ? this.losingStreak + 1 : 0;
      if (this.losingStreak >= RESIGN_STREAK) {
        session.resign(cpuColor);
        this.setThinking(false);
        this.opts.onResign();
        return;
      }
      session.play(chosen.move);
      this.setThinking(false);
      this.opts.onMove(chosen.move);
    } catch (err) {
      if (gen !== this.generation || err instanceof AiCancelledError) return;
      this.setThinking(false);
      this.opts.onError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (gen === this.generation) this.setThinking(false);
    }
  }

  /** 考えるのをやめる。待った・こうさん・あたらしく・盤面の入れ替えの前に呼ぶ */
  cancel(): void {
    this.generation++;
    this.losingStreak = 0; // 待ったで局面が変わるので数えなおす
    this.opts.client.stop();
    this.setThinking(false);
  }
}
