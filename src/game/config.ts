// 新規対局の設定（モード・レベル・先手後手）。前回の選択はブラウザ内の localStorage にだけ保存する。
import { DEFAULT_LEVEL, getLevel, type LevelId } from '../ai/levels';
import type { Color } from '../rules';

export type GameMode = 'cpu' | 'two';
export type SideChoice = 'sente' | 'gote' | 'random';

export interface GameConfig {
  mode: GameMode;
  level: LevelId;
  /** 人が持つ側（CPU 戦のみ） */
  side: SideChoice;
}

/** いま進んでいる対局。ランダムは開始時に決まっている */
export interface ActiveGame {
  mode: GameMode;
  level: LevelId;
  /** CPU 戦での人の色。ふたり対戦なら undefined */
  humanColor: Color | undefined;
}

export const DEFAULT_CONFIG: Readonly<GameConfig> = {
  mode: 'cpu',
  level: DEFAULT_LEVEL,
  side: 'sente',
};

const STORAGE_KEY = 'komapal.newgame';
const SIDES: readonly SideChoice[] = ['sente', 'gote', 'random'];

/** 保存されていた値を検査する。壊れていたり、いま選べないレベルなら既定値に戻す */
export function sanitizeConfig(data: unknown): GameConfig {
  const obj = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  const mode: GameMode = obj['mode'] === 'two' ? 'two' : 'cpu';
  const level = typeof obj['level'] === 'number' ? getLevel(obj['level']) : undefined;
  const side = SIDES.find((s) => s === obj['side']);
  return {
    mode,
    level: level?.available ? level.id : DEFAULT_CONFIG.level,
    side: side ?? DEFAULT_CONFIG.side,
  };
}

export function loadConfig(): GameConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeConfig(JSON.parse(raw)) : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: GameConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // 保存できなくても、この対局はそのまま遊べる
  }
}

/** 設定から対局を決める。random は rng で先手・後手のどちらかに決める */
export function resolveGame(config: GameConfig, rng: () => number = Math.random): ActiveGame {
  if (config.mode === 'two') return { mode: 'two', level: config.level, humanColor: undefined };
  const humanColor: Color =
    config.side === 'random' ? (rng() < 0.5 ? 'sente' : 'gote') : config.side;
  return { mode: 'cpu', level: config.level, humanColor };
}
