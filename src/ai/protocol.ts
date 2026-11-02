// 画面（UI）と AI の Worker がやり取りするメッセージ。
// 局面は「開始局面 + ここまでの手（USI）」で渡す（千日手をエンジンが数えられるように）。

import type { Analysis } from '../analysis/evaluate';

export interface PositionSpec {
  startSfen: string;
  /** 開始局面からの手順（USI） */
  moves: string[];
}

export type AiRequest =
  /**
   * やねうら王を裏で読み込み始める（盤を出した後に 1 回送る）。
   * engineUrl は public/engine/engine-host.js の URL。null ならエンジンを使わない（かんたんモード）
   */
  | { type: 'warmup'; engineUrl: string | null }
  /** 手番側の手を 1 つ選ぶ */
  | ({ type: 'choose'; id: number; level: number; seed?: number } & PositionSpec)
  /**
   * 形勢の解析。CPU の思考とぶつからないよう、choose が動いている間は始めず、choose が来たら中断する。
   * 待たせるのは最新の 1 件だけ（古い要求は返事なしで捨てる）
   */
  | ({ type: 'analyze'; id: number } & PositionSpec)
  /** 考えるのをやめる（返事はもう要らない） */
  | { type: 'stop'; id: number };

/** loading = 読み込み中、ready = やねうら王で動く、fallback = 自作αβで動く（かんたんモード） */
export type EngineStatus = 'loading' | 'ready' | 'fallback';

export type AiResponse =
  /** score は手番側（CPU）から見た評価値。L4 以上のときだけ付く（投了の判断に使う） */
  | { type: 'bestmove'; id: number; move: string; score?: number }
  /** 指せる手が無い */
  | { type: 'nomove'; id: number }
  | { type: 'unsupported'; id: number }
  /** 形勢の解析結果。中断・捨てられた解析には返事が来ない */
  | { type: 'analysis'; id: number; analysis: Analysis }
  | { type: 'error'; id: number; message: string }
  /** エンジンの状態が変わった（要求への返事ではない） */
  | { type: 'engine-status'; status: EngineStatus; reason?: string };
