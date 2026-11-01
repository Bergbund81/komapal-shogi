// 新規対局ダイアログ: モード・レベル（名前・アイコン・説明・つよさメーターつき）・先手/後手/ランダム。
import { LEVELS, type LevelConfig } from '../ai/levels';
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

export interface LevelTier {
  /** CSS の色分けに使う名前（tier-<key>） */
  key: 'start' | 'practice' | 'challenge';
  label: string;
  from: number;
  to: number;
}

/** レベルの 3 つのグループ。グループごとに見出しと色を分ける */
export const LEVEL_TIERS: readonly LevelTier[] = [
  { key: 'start', label: 'はじめて', from: 1, to: 3 },
  { key: 'practice', label: 'れんしゅう', from: 4, to: 7 },
  { key: 'challenge', label: 'ちょうせん', from: 8, to: 10 },
];

export function tierOf(level: number): LevelTier | undefined {
  return LEVEL_TIERS.find((t) => t.from <= level && level <= t.to);
}

/** かんたんモード（やねうら王が使えない端末）のとき、L8〜10 のカードに出す一言 */
export const EASY_MODE_NOTE = 'いまはかんたんモードでうごくよ';

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

/** つよさメーター: レベルの数だけ、だんだん高くなる棒が光る */
function strengthMeter(level: LevelConfig): HTMLElement {
  const meter = document.createElement('span');
  meter.className = 'level-meter';
  meter.setAttribute('aria-hidden', 'true');
  LEVELS.forEach((lv, i) => {
    const bar = document.createElement('span');
    if (lv.id <= level.id) bar.className = 'on';
    bar.style.height = `${((i + 1) / LEVELS.length) * 100}%`;
    meter.append(bar);
  });
  return meter;
}

/**
 * 新規対局の設定を聞く。「はじめる」なら設定、やめたら undefined（外側タップ・Esc も同じ）。
 * easyMode ならやねうら王のレベルに「かんたんモード」の一言をそえる
 */
export function newGameDialog(
  initial: GameConfig,
  easyMode = false,
): Promise<GameConfig | undefined> {
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
      const tier = tierOf(lv.id);
      if (tier?.from === lv.id) {
        const label = document.createElement('span');
        label.className = `level-tier tier-${tier.key}`;
        label.append(text('strong', tier.label), text('small', `レベル${tier.from}〜${tier.to}`));
        levels.list.append(label);
      }
      // 「レベル N」と名前は、それぞれ途中で改行しない（せまい画面で「ひよ／こ」にならないように）
      const title = document.createElement('strong');
      title.className = 'level-title';
      for (const part of [`レベル${lv.id}`, lv.name]) title.append(text('span', part));
      const note = text('small', lv.available ? lv.description : 'じゅんびちゅう');
      const icon = text('span', lv.icon);
      icon.className = 'level-icon';
      icon.setAttribute('aria-hidden', 'true');
      const body = document.createElement('span');
      body.className = 'level-body';
      body.append(title, note);
      if (easyMode && lv.kind === 'engine') {
        const easy = text('small', EASY_MODE_NOTE);
        easy.className = 'level-easy';
        body.append(easy);
      }
      levels.list.append(
        choice(
          'level',
          `level-card tier-${tier?.key ?? 'start'}`,
          lv.available && cfg.level === lv.id,
          !lv.available,
          () => (cfg.level = lv.id),
          icon,
          body,
          strengthMeter(lv),
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
