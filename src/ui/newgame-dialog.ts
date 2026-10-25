// 新規対局ダイアログ: モード・レベル（名前・アイコン・説明つき）・先手/後手/ランダム。
import { LEVELS } from '../ai/levels';
import type { GameConfig, GameMode, SideChoice } from '../game/config';
import { button, heading, openDialog, row } from './dialogs';
import { ruby } from './furigana';

const MODE_CHOICES: ReadonlyArray<{ value: GameMode; label: string }> = [
  { value: 'cpu', label: 'CPUとたいせん' },
  { value: 'two', label: 'ふたりでたいせん' },
];

const SIDE_CHOICES: ReadonlyArray<{ value: SideChoice; label: string; hint: string }> = [
  { value: 'sente', label: '先手', hint: 'さいしょに指す' },
  { value: 'gote', label: '後手', hint: 'あとから指す' },
  { value: 'random', label: 'ランダム', hint: 'おまかせ' },
];

function text(tag: 'span' | 'strong' | 'small', content: string): HTMLElement {
  const node = document.createElement(tag);
  node.append(ruby(content));
  return node;
}

function group(title: string, className: string): { box: HTMLFieldSetElement; list: HTMLElement } {
  const box = document.createElement('fieldset');
  box.className = 'setting-group';
  const legend = document.createElement('legend');
  legend.append(ruby(title));
  const list = document.createElement('div');
  list.className = className;
  box.append(legend, list);
  return { box, list };
}

/** ラジオボタンつきの選択肢（大きなタップ領域） */
function choice(
  name: string,
  className: string,
  checked: boolean,
  disabled: boolean,
  onSelect: () => void,
  ...content: HTMLElement[]
): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = className;
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = name;
  input.checked = checked;
  input.disabled = disabled;
  input.addEventListener('change', onSelect);
  label.append(input, ...content);
  return label;
}

/** 新規対局の設定を聞く。「はじめる」なら設定、やめたら undefined（外側タップ・Esc も同じ） */
export function newGameDialog(initial: GameConfig): Promise<GameConfig | undefined> {
  const cfg: GameConfig = { ...initial };
  return openDialog<GameConfig | null>((close) => {
    const modes = group('あそびかた', 'mode-choices');
    const levels = group('CPUのつよさ', 'level-choices');
    const sides = group('どっちでさす？', 'side-choices');

    const refresh = (): void => {
      levels.box.hidden = cfg.mode === 'two';
      sides.box.hidden = cfg.mode === 'two';
    };

    for (const m of MODE_CHOICES) {
      modes.list.append(
        choice(
          'mode',
          'pick-choice',
          cfg.mode === m.value,
          false,
          () => {
            cfg.mode = m.value;
            refresh();
          },
          text('strong', m.label),
        ),
      );
    }

    for (const lv of LEVELS) {
      const title = text('strong', `レベル${lv.id} ${lv.name}`);
      const note = text('small', lv.available ? lv.description : 'じゅんびちゅう');
      const icon = text('span', lv.icon);
      icon.className = 'level-icon';
      icon.setAttribute('aria-hidden', 'true');
      const body = document.createElement('span');
      body.className = 'level-body';
      body.append(title, note);
      levels.list.append(
        choice(
          'level',
          'level-card',
          lv.available && cfg.level === lv.id,
          !lv.available,
          () => (cfg.level = lv.id),
          icon,
          body,
        ),
      );
    }

    for (const s of SIDE_CHOICES) {
      sides.list.append(
        choice(
          'side',
          'pick-choice',
          cfg.side === s.value,
          false,
          () => (cfg.side = s.value),
          text('strong', s.label),
          text('small', s.hint),
        ),
      );
    }

    refresh();
    return [
      heading('あたらしくはじめる'),
      modes.box,
      levels.box,
      sides.box,
      row(
        button('やめる', () => close(null)),
        button('はじめる', () => close({ ...cfg }), 'primary'),
      ),
    ];
  }).then((answer) => answer ?? undefined);
}
