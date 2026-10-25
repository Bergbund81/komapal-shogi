// 画面（UI）と AI の Worker がやり取りするメッセージ。
// 局面は「開始局面 + ここまでの手（USI）」で渡す（千日手をエンジンが数えられるように）。

export interface PositionSpec {
  startSfen: string;
  /** 開始局面からの手順（USI） */
  moves: string[];
}

export type AiRequest =
  /** 手番側の手を 1 つ選ぶ */
  | ({ type: 'choose'; id: number; level: number; seed?: number } & PositionSpec)
  /** 形勢・候補手の解析（フェーズ5で対応。いまは unsupported を返す） */
  | ({ type: 'analyze'; id: number } & PositionSpec)
  /** 考えるのをやめる（返事はもう要らない） */
  | { type: 'stop'; id: number };

export type AiResponse =
  | { type: 'bestmove'; id: number; move: string }
  /** 指せる手が無い */
  | { type: 'nomove'; id: number }
  | { type: 'unsupported'; id: number }
  | { type: 'error'; id: number; message: string };
