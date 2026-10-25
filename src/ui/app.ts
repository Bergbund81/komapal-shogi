// 画面の組み立てと、操作 → 描画のつなぎ。フェーズ2は「2人で対戦」モードだけ。
import { GameSession } from '../game/session';
import { opposite, type Color } from '../rules';
import { BoardView, kingSquareOf } from './board';
import { askPromotion, confirmDialog, resultDialog, settingsDialog } from './dialogs';
import { ruby, setRuby } from './furigana';
import { renderHand } from './hands';
import { renderHistory } from './history';
import { Interaction } from './interaction';
import { CHECK_MESSAGE, COLOR_NAMES, resultText, turnMessage } from './messages';
import { getSettings, onSettingsChange } from './settings';

interface ControlSpec {
  id: string;
  label: string;
}

const CONTROLS: readonly ControlSpec[] = [
  { id: 'undo', label: 'まった' },
  { id: 'redo', label: 'すすむ' },
  { id: 'resign', label: 'こうさん' },
  { id: 'flip', label: 'はんてん' },
  { id: 'new', label: 'あたらしく' },
  { id: 'settings', label: 'せってい' },
];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent?.append(node);
  return node;
}

export function startApp(root: HTMLElement): void {
  let session = new GameSession();
  let interaction = new Interaction(session);
  let flipped = false;
  let announced = false;

  /** 設定でふりがなを切り替えたとき、書き直す静的な文言 */
  const labels: Array<[Element, string]> = [];
  const label = (node: Element, text: string): void => {
    labels.push([node, text]);
    setRuby(node, text);
  };

  const board = new BoardView((sq) => {
    interaction.tapSquare(sq);
    render();
    void askPendingPromotion();
  });

  // ---- 画面の部品 ----
  const header = el('header', 'topbar', root);
  label(el('h1', 'title', header), 'コマパル 将棋');
  label(el('span', 'mode-badge', header), 'ふたりでたいせん');
  const message = el('p', 'message', root);
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');

  const layout = el('main', 'layout', root);
  const topHand = el('section', 'hand-slot hand-top', layout);
  const boardWrap = el('div', 'board-wrap', layout);
  boardWrap.append(board.el);
  const bottomHand = el('section', 'hand-slot hand-bottom', layout);
  const history = el('section', 'history', layout);
  label(el('h2', 'history-title', history), '棋譜');
  const historyList = el('ol', 'history-list', history);

  const handParts = new Map<HTMLElement, { name: HTMLElement; pieces: HTMLElement }>();
  for (const slot of [topHand, bottomHand]) {
    handParts.set(slot, {
      name: el('h2', 'hand-name', slot),
      pieces: el('div', 'hand-pieces', slot),
    });
  }

  const nav = el('nav', 'controls', root);
  const buttons = new Map<string, HTMLButtonElement>();
  for (const spec of CONTROLS) {
    const b = el('button', `btn control control-${spec.id}`, nav);
    b.type = 'button';
    label(b, spec.label);
    buttons.set(spec.id, b);
  }

  // ---- 描画 ----
  const options = () => ({
    guide: getSettings().guide,
    hiragana: getSettings().hiraganaPieces,
    flipped,
  });

  function renderHands(): void {
    const pos = session.position;
    const sel = interaction.selection;
    const bottom: Color = flipped ? 'gote' : 'sente';
    for (const [slot, color] of [
      [topHand, opposite(bottom)],
      [bottomHand, bottom],
    ] as const) {
      const parts = handParts.get(slot);
      if (!parts) continue;
      setRuby(parts.name, `${COLOR_NAMES[color]}の持ち駒`);
      renderHand(
        parts.pieces,
        {
          position: pos,
          color,
          selected: sel.kind === 'hand' && color === session.turn ? sel.role : undefined,
          active: color === session.turn && !session.isOver,
          options: options(),
        },
        (c, role) => {
          interaction.tapHand(c, role);
          render();
        },
      );
    }
  }

  function currentMessage(): { text: string; tone: string } {
    const status = session.status();
    if (status.type !== 'playing') return { text: resultText(status).title, tone: 'info' };
    if (interaction.notice) return interaction.notice;
    if (session.position.isCheck()) return { text: CHECK_MESSAGE, tone: 'check' };
    return { text: turnMessage(session.turn), tone: 'info' };
  }

  function render(): void {
    const pos = session.position;
    const sel = interaction.selection;
    board.render({
      position: pos,
      selected: sel.kind === 'square' ? sel.from : undefined,
      targets: new Set(sel.kind === 'none' ? [] : sel.targets),
      lastMove: session.history[session.history.length - 1],
      checkSquare: pos.isCheck() ? kingSquareOf(pos, pos.turn) : undefined,
      ...options(),
    });
    renderHands();
    renderHistory(historyList, session.startSfen, session.history);

    const msg = currentMessage();
    message.className = `message ${msg.tone}`;
    message.replaceChildren(ruby(msg.text));

    const over = session.isOver;
    const set = (id: string, disabled: boolean): void => {
      const b = buttons.get(id);
      if (b) b.disabled = disabled;
    };
    set('undo', !session.canUndo);
    set('redo', !session.canRedo);
    set('resign', over);

    if (!over) announced = false;
    else if (!announced) {
      announced = true;
      void announceResult();
    }
  }

  // ---- 操作 ----
  async function askPendingPromotion(): Promise<void> {
    const p = interaction.pendingPromotion;
    if (!p) return;
    const answer = await askPromotion(p.role, options());
    if (answer === undefined) interaction.cancel();
    else interaction.choosePromotion(answer);
    render();
  }

  async function announceResult(): Promise<void> {
    const status = session.status();
    if (status.type === 'playing') return;
    const { title, detail } = resultText(status);
    if (await resultDialog(title, detail)) startNewGame();
  }

  function startNewGame(): void {
    session = new GameSession();
    interaction = new Interaction(session);
    announced = false;
    render();
  }

  const actions: Record<string, () => void | Promise<void>> = {
    undo: () => {
      session.undo(1);
      interaction.cancel();
      render();
    },
    redo: () => {
      session.redo(1);
      interaction.cancel();
      render();
    },
    resign: async () => {
      if (session.isOver) return;
      const who = COLOR_NAMES[session.turn];
      const ok = await confirmDialog(
        'こうさんする？',
        `${who}がこうさんして、おわりにするよ`,
        'こうさんする',
      );
      if (!ok) return;
      session.resign(session.turn);
      interaction.cancel();
      render();
    },
    flip: () => {
      flipped = !flipped;
      render();
    },
    new: async () => {
      const ok = await confirmDialog(
        'あたらしくはじめる？',
        'いまのたいきょくは、きえてしまうよ',
        'あたらしくはじめる',
      );
      if (ok) startNewGame();
    },
    settings: () => settingsDialog(),
  };
  for (const [id, b] of buttons) {
    b.addEventListener('click', () => void actions[id]?.());
  }

  // お手付き取消: 盤の外をタップ、または Esc
  document.addEventListener('click', (ev) => {
    const target = ev.target as Element | null;
    if (target?.closest('[data-sq],.hand-piece,button,dialog,input,label')) return;
    interaction.cancel();
    render();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    interaction.cancel();
    render();
  });

  onSettingsChange(() => {
    for (const [node, text] of labels) setRuby(node, text);
    render();
  });

  render();
}
