// 形勢ゲージの表示。左 = あいて、右 = じぶん の勝率バーと、顔マーク・一言（評価値の数字は小さく）。
import { formatCp, type GaugeView } from '../analysis/evaluate';
import { setRuby } from './furigana';

export const EASY_EVAL_LABEL = 'かんたん評価';
const WAITING_LABEL = 'よみちゅう…';
const NO_DATA_PHRASE = 'しょうぶのようすをみているよ…';

export interface GaugeState {
  /** まだ読めていないときは undefined */
  view: GaugeView | undefined;
  /** 古い局面の値（人が指して CPU が考えている間など）。うすく表示する */
  stale: boolean;
  /** 読んでいる最中 */
  waiting: boolean;
  /** バーの左（あいて）と右（じぶん）の呼び名 */
  opponentName: string;
  myName: string;
}

function span(className: string, parent: HTMLElement): HTMLSpanElement {
  const node = document.createElement('span');
  node.className = className;
  parent.append(node);
  return node;
}

export class Gauge {
  readonly el: HTMLElement;
  private readonly face: HTMLElement;
  private readonly phrase: HTMLElement;
  private readonly cp: HTMLElement;
  private readonly chip: HTMLElement;
  private readonly wait: HTMLElement;
  private readonly left: HTMLElement;
  private readonly right: HTMLElement;
  private readonly fill: HTMLElement;

  constructor() {
    this.el = document.createElement('section');
    this.el.className = 'gauge';
    this.el.setAttribute('role', 'meter');
    this.el.setAttribute('aria-valuemin', '0');
    this.el.setAttribute('aria-valuemax', '100');
    const main = document.createElement('div');
    main.className = 'gauge-main';
    this.face = span('gauge-face', main);
    this.phrase = span('gauge-phrase', main);
    this.chip = span('gauge-chip', main);
    this.wait = span('gauge-wait', main);
    this.cp = span('gauge-cp', main);
    this.face.setAttribute('aria-hidden', 'true');
    setRuby(this.chip, EASY_EVAL_LABEL);
    setRuby(this.wait, WAITING_LABEL);
    const row = document.createElement('div');
    row.className = 'gauge-row';
    this.left = span('gauge-side gauge-left', row);
    const bar = span('gauge-bar', row);
    this.fill = span('gauge-fill', bar);
    this.right = span('gauge-side gauge-right', row);
    this.el.append(main, row);
  }

  /** ふりがな設定が変わったときも、これで書き直す */
  render(state: GaugeState): void {
    const { view } = state;
    const rate = view?.winRate ?? 0.5;
    const pct = Math.round(rate * 100);
    this.face.textContent = view?.face ?? '🤔';
    setRuby(this.phrase, view?.phrase ?? NO_DATA_PHRASE);
    this.cp.textContent = view?.cp === undefined ? '' : formatCp(view.cp);
    this.chip.hidden = view?.source !== 'simple';
    this.wait.hidden = !state.waiting;
    setRuby(this.left, `${state.opponentName} ${100 - pct}%`);
    setRuby(this.right, `${pct}% ${state.myName}`);
    this.fill.style.width = `${pct}%`;
    this.el.dataset['mood'] = view?.mood ?? 'none';
    this.el.classList.toggle('stale', state.stale);
    this.el.setAttribute('aria-valuenow', String(pct));
    this.el.setAttribute(
      'aria-label',
      `${state.myName}の勝率 ${pct}% ${view?.phrase ?? ''}`.trim(),
    );
  }
}
