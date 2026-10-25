// ダイアログ（なる/ならない、確認、設定、終局）。<dialog> を使うので Esc で閉じられる。
import type { Role } from '../rules';
import { ruby } from './furigana';
import { pieceSvg, promotedRole, type PieceOptions, type PieceStyle } from './pieces';
import { getSettings, updateSettings } from './settings';

/** ダイアログを開いて、閉じるときの値を返す。Esc・外側タップなら undefined */
export function openDialog<T>(
  build: (close: (value: T) => void, dialog: HTMLDialogElement) => HTMLElement[],
): Promise<T | undefined> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'dialog';
    let result: T | undefined;
    let finished = false;
    // 閉じ方は 3 通り（ボタン・Esc・外側タップ）。どれでも 1 度だけ後片づけする
    const finish = (): void => {
      if (finished) return;
      finished = true;
      dialog.remove();
      resolve(result);
    };
    const close = (value: T): void => {
      result = value;
      dialog.close();
      finish();
    };
    dialog.append(...build(close, dialog));
    dialog.addEventListener('click', (ev) => {
      if (ev.target === dialog) dialog.close(); // 外側のタップ
    });
    dialog.addEventListener('close', finish);
    document.body.append(dialog);
    dialog.showModal();
  });
}

export function heading(text: string): HTMLElement {
  const h = document.createElement('h2');
  h.className = 'dialog-title';
  h.append(ruby(text));
  return h;
}

export function paragraph(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'dialog-text';
  p.append(ruby(text));
  return p;
}

export function button(text: string, onClick: () => void, variant = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn ${variant}`.trim();
  b.append(ruby(text));
  b.addEventListener('click', onClick);
  return b;
}

export function row(...children: HTMLElement[]): HTMLElement {
  const div = document.createElement('div');
  div.className = 'dialog-actions';
  div.append(...children);
  return div;
}

/** 「なる / ならない」を駒の絵つきで選ぶ。true=なる、false=ならない、undefined=やめた */
export function askPromotion(role: Role, options: PieceOptions): Promise<boolean | undefined> {
  const promoted = promotedRole(role) ?? role;
  return openDialog<boolean>((close) => {
    const choice = (label: string, r: Role, value: boolean): HTMLButtonElement => {
      const b = button(label, () => close(value), 'choice');
      b.prepend(pieceSvg(r, 'sente', { ...options, guide: false, flipped: false }));
      return b;
    };
    return [
      heading('なる？ ならない？'),
      row(choice('なる', promoted, true), choice('ならない', role, false)),
      paragraph('えらばないときは、そとをタップするともどれるよ'),
    ];
  });
}

/** はい/いいえの確認。誤操作しやすい操作の前に出す */
export async function confirmDialog(
  title: string,
  text: string,
  okLabel: string,
  cancelLabel = 'やめる',
): Promise<boolean> {
  const answer = await openDialog<boolean>((close) => [
    heading(title),
    paragraph(text),
    row(
      button(cancelLabel, () => close(false)),
      button(okLabel, () => close(true), 'primary'),
    ),
  ]);
  return answer === true;
}

/** 終局のお知らせ。「あたらしく」を選んだら true */
export async function resultDialog(title: string, detail: string): Promise<boolean> {
  const answer = await openDialog<boolean>((close) => [
    heading(title),
    paragraph(detail),
    row(
      button('もういちどみる', () => close(false)),
      button('あたらしくさす', () => close(true), 'primary'),
    ),
  ]);
  return answer === true;
}

const SWITCHES: ReadonlyArray<{ key: 'guide' | 'furigana'; label: string; hint: string }> = [
  { key: 'guide', label: '駒のうごきの点', hint: '駒に、うごける方向の点をだすよ' },
  { key: 'furigana', label: 'ふりがな', hint: '漢字によみかたをつけるよ' },
];

const PIECE_STYLE_CHOICES: ReadonlyArray<{ style: PieceStyle; label: string }> = [
  { style: 'kanji', label: 'かんじ' },
  { style: 'kanjiRuby', label: 'かんじ＋ふりがな' },
  { style: 'hiragana', label: 'ひらがな' },
];

function labeled(title: string, hint?: string): HTMLElement {
  const text = document.createElement('span');
  const name = document.createElement('strong');
  name.append(ruby(title));
  text.append(name);
  if (hint) {
    const small = document.createElement('small');
    small.append(ruby(hint));
    text.append(small);
  }
  return text;
}

function switchItem(item: (typeof SWITCHES)[number]): HTMLElement {
  const label = document.createElement('label');
  label.className = 'setting-item';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = getSettings()[item.key];
  input.addEventListener('change', () => updateSettings({ [item.key]: input.checked }));
  label.append(input, labeled(item.label, item.hint));
  return label;
}

/** 駒の表示を 3 つから選ぶ。見本の駒つき */
function pieceStyleGroup(): HTMLElement {
  const group = document.createElement('fieldset');
  group.className = 'setting-group';
  const legend = document.createElement('legend');
  legend.append(ruby('駒のひょうじ'));
  group.append(legend);
  const choices = document.createElement('div');
  choices.className = 'style-choices';
  for (const choice of PIECE_STYLE_CHOICES) {
    const label = document.createElement('label');
    label.className = 'style-choice';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'piece-style';
    input.checked = getSettings().pieceStyle === choice.style;
    input.addEventListener('change', () => updateSettings({ pieceStyle: choice.style }));
    const sample = pieceSvg('silver', 'sente', { guide: false, style: choice.style });
    const name = document.createElement('span');
    name.append(ruby(choice.label));
    label.append(input, sample, name);
    choices.append(label);
  }
  group.append(choices);
  return group;
}

/** せってい。スイッチを触るとすぐ反映される */
export async function settingsDialog(): Promise<void> {
  await openDialog<boolean>((close) => {
    const list = document.createElement('div');
    list.className = 'settings-list';
    list.append(...SWITCHES.map(switchItem), pieceStyleGroup());
    return [heading('せってい'), list, row(button('とじる', () => close(true), 'primary'))];
  });
}
