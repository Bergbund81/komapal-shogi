// 設定（動きガイド・ふりがな・ひらがな駒）。ブラウザ内の localStorage にだけ保存する。
export interface Settings {
  /** 駒の面に「動ける方向の点」を出す */
  guide: boolean;
  /** 漢字にふりがな（ルビ）を付ける */
  furigana: boolean;
  /** 駒の字をひらがなにする */
  hiraganaPieces: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  guide: true,
  furigana: true,
  hiraganaPieces: false,
};

const STORAGE_KEY = 'komapal.settings';

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const data: unknown = JSON.parse(raw);
    const obj = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
    const pick = (key: keyof Settings): boolean =>
      typeof obj[key] === 'boolean' ? obj[key] : DEFAULT_SETTINGS[key];
    return {
      guide: pick('guide'),
      furigana: pick('furigana'),
      hiraganaPieces: pick('hiraganaPieces'),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let current: Settings = load();
const listeners = new Set<(s: Settings) => void>();

export function getSettings(): Readonly<Settings> {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // 保存できなくても、この画面の間は設定を使える
  }
  for (const fn of listeners) fn(current);
}

/** 設定が変わったときに呼ばれる関数を登録する。解除用の関数を返す */
export function onSettingsChange(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
