// 画面の組み立てと、操作 → 描画のつなぎ。「CPUとたいせん」と「ふたりでたいせん」を扱う。
import { AiClient } from '../ai/client';
import { getLevel } from '../ai/levels';
import {
  loadConfig,
  resolveGame,
  saveConfig,
  type ActiveGame,
  type GameConfig,
} from '../game/config';
import { GameSession } from '../game/session';
import { opposite, type Color } from '../rules';
import { BoardView, kingSquareOf } from './board';
import { CpuTurn } from './cpu-turn';
import { askPromotion, confirmDialog, resultDialog, settingsDialog } from './dialogs';
import { ruby, setRuby } from './furigana';
import { renderHand } from './hands';
import { renderHistory } from './history';
import { Interaction } from './interaction';
import {
  CHECK_MESSAGE,
  COLOR_NAMES,
  CPU_ERROR_MESSAGE,
  THINKING_MESSAGE,
  cpuSideNames,
  resultText,
  turnMessage,
  type SideNames,
} from './messages';
import { newGameDialog } from './newgame-dialog';
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
  const client = new AiClient();
  let game: ActiveGame = resolveGame(loadConfig());
  let session = new GameSession();
  let interaction = new Interaction(session);
  let cpuTurn: CpuTurn | undefined;
  let cpuError = false;
  let flipped = false;
  let announced = false;

  /** この色の駒を、この画面の操作で動かしてよいか（CPU 戦では人の色だけ） */
  const isHuman = (color: Color): boolean => game.mode === 'two' || color === game.humanColor;
  const sideNames = (): SideNames => {
    const cpuName = getLevel(game.level)?.name ?? 'CPU';
    return game.humanColor ? cpuSideNames(game.humanColor, cpuName) : COLOR_NAMES;
  };
  const badgeText = (): string => {
    const lv = getLevel(game.level);
    return game.mode === 'cpu' && lv ? `${lv.icon} ${lv.name}` : 'ふたりでたいせん';
  };

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
    void cpuTurn?.maybeStart();
  });

  // ---- 画面の部品 ----
  const header = el('header', 'topbar', root);
  label(el('h1', 'title', header), 'コマパル 将棋');
  const badge = el('span', 'mode-badge', header);
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
    style: getSettings().pieceStyle,
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
      setRuby(parts.name, `${sideNames()[color]}の持ち駒`);
      renderHand(
        parts.pieces,
        {
          position: pos,
          color,
          selected: sel.kind === 'hand' && color === session.turn ? sel.role : undefined,
          active: color === session.turn && !session.isOver && isHuman(color),
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
    if (status.type !== 'playing') {
      return { text: resultText(status, sideNames()).title, tone: 'info' };
    }
    if (cpuTurn?.isThinking) return { text: THINKING_MESSAGE, tone: 'thinking' };
    if (cpuError) return { text: CPU_ERROR_MESSAGE, tone: 'warn' };
    if (interaction.notice) return interaction.notice;
    if (session.position.isCheck() && isHuman(session.turn)) {
      return { text: CHECK_MESSAGE, tone: 'check' };
    }
    return { text: turnMessage(session.turn, sideNames()), tone: 'info' };
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
    setRuby(badge, badgeText());

    const msg = currentMessage();
    message.className = `message ${msg.tone}`;
    message.replaceChildren(ruby(msg.text));

    const over = session.isOver;
    const set = (id: string, disabled: boolean): void => {
      const b = buttons.get(id);
      if (b) b.disabled = disabled;
    };
    // CPU 戦では人の手が 1 つも無いときは戻せない。考え中の「すすむ」も止める
    const firstHumanPly = game.humanColor === 'gote' ? 2 : 1;
    set('undo', game.mode === 'cpu' ? session.ply < firstHumanPly : !session.canUndo);
    set('redo', !session.canRedo || cpuTurn?.isThinking === true);
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
    void cpuTurn?.maybeStart();
  }

  async function announceResult(): Promise<void> {
    const status = session.status();
    if (status.type === 'playing') return;
    const { title, detail } = resultText(status, sideNames());
    if (await resultDialog(title, detail)) await chooseNewGame();
  }

  /** 新しい対局を始める。start=false なら CPU はまだ考え始めない（開始ダイアログの裏用） */
  function startNewGame(config: GameConfig, start = true): void {
    cpuTurn?.cancel();
    game = resolveGame(config);
    session = new GameSession();
    interaction = new Interaction(session, isHuman);
    flipped = game.humanColor === 'gote';
    announced = false;
    cpuError = false;
    cpuTurn =
      game.mode === 'cpu' && game.humanColor
        ? new CpuTurn({
            session,
            client,
            cpuColor: opposite(game.humanColor),
            level: game.level,
            onThinking: () => render(),
            onMove: (usi) => {
              render();
              board.animateMove(usi, flipped);
            },
            onError: () => {
              cpuError = true;
              render();
            },
          })
        : undefined;
    render();
    if (start) void cpuTurn?.maybeStart();
  }

  /** 設定ダイアログで聞いて、決まったら新しい対局を始める。やめたら false */
  async function chooseNewGame(): Promise<boolean> {
    const picked = await newGameDialog(loadConfig());
    if (!picked) return false;
    saveConfig(picked);
    startNewGame(picked);
    return true;
  }

  const actions: Record<string, () => void | Promise<void>> = {
    undo: () => {
      cpuTurn?.cancel(); // 考え中なら思考をやめる（古い返事は捨てられる）
      cpuError = false;
      if (game.humanColor) session.undoToTurn(game.humanColor);
      else session.undo(1);
      interaction.cancel();
      render();
      void cpuTurn?.maybeStart(); // 人が後手で最初の手まで戻ったときは CPU が指しなおす
    },
    redo: () => {
      cpuError = false;
      // CPU 戦では、人の番になるまで進める
      do session.redo(1);
      while (game.humanColor && session.canRedo && session.turn !== game.humanColor);
      interaction.cancel();
      render();
      void cpuTurn?.maybeStart();
    },
    resign: async () => {
      if (session.isOver) return;
      const loser = game.humanColor ?? session.turn;
      const who = sideNames()[loser];
      const ok = await confirmDialog(
        'こうさんする？',
        `${who}がこうさんして、おわりにするよ`,
        'こうさんする',
      );
      if (!ok || session.isOver) return;
      cpuTurn?.cancel();
      session.resign(loser);
      interaction.cancel();
      render();
    },
    flip: () => {
      flipped = !flipped;
      render();
    },
    new: async () => {
      if (!session.isOver && session.ply > 0) {
        const ok = await confirmDialog(
          'あたらしくはじめる？',
          'いまのたいきょくは、きえてしまうよ',
          'あたらしくはじめる',
        );
        if (!ok) return;
      }
      await chooseNewGame();
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

  // 起動: 前回の設定で盤を用意し、ダイアログで選んでもらう（閉じたら前回の設定のまま始める）
  startNewGame(loadConfig(), false);
  void chooseNewGame().then((started) => {
    if (!started) void cpuTurn?.maybeStart();
  });
}
