// CPU の番の進め方。DOM を使わないので単体テストできる。
// 人の手を先に画面へ出したあとで呼ぶと、AI に手を聞き、最低 MIN_THINK_MS たってから指す。
import { AiCancelledError, type AiClient } from '../ai/client';
import type { GameSession } from '../game/session';
import type { Color } from '../rules';

/** 考える時間の最低ライン。瞬間指しは子どもが手を追えない */
export const MIN_THINK_MS = 600;

export interface CpuTurnOptions {
  session: GameSession;
  client: Pick<AiClient, 'choose' | 'stop'>;
  cpuColor: Color;
  level: number;
  /** CPU が指した直後に呼ばれる（画面の更新・アニメーション） */
  onMove: (usi: string) => void;
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
      const [move] = await Promise.all([client.choose(level, spec), sleep(MIN_THINK_MS)]);
      if (gen !== this.generation) return;
      if (move === undefined) return;
      session.play(move);
      this.setThinking(false);
      this.opts.onMove(move);
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
    this.opts.client.stop();
    this.setThinking(false);
  }
}
