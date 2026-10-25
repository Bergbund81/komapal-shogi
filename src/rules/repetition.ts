// 千日手: 同一局面（盤・手番・持ち駒）が4回現れたら引き分け。
// ただし1回目から4回目までの間、片方の指し手がすべて王手なら、王手をかけ続けた側の反則負け。
import type { Color } from './position';

/** 対局中のある局面の記録。plies[0] が開始局面、plies[i] が i 手目を指した後の局面 */
export interface PlyRecord {
  /** positionKey() の値 */
  key: string;
  /** その局面の手番 */
  turn: Color;
  /** その局面で手番側に王手がかかっているか（＝直前の手が王手だったか） */
  inCheck: boolean;
}

export type RepetitionResult =
  | { type: 'none'; count: number }
  | { type: 'draw'; count: number }
  | { type: 'perpetualCheck'; count: number; loser: Color };

export const REPETITION_LIMIT = 4;

/** 最新の局面について千日手を判定する */
export function detectRepetition(plies: readonly PlyRecord[]): RepetitionResult {
  const last = plies.length - 1;
  const current = plies[last];
  if (!current) return { type: 'none', count: 0 };

  const occurrences: number[] = [];
  plies.forEach((p, i) => {
    if (p.key === current.key) occurrences.push(i);
  });
  const count = occurrences.length;
  if (count < REPETITION_LIMIT) return { type: 'none', count };

  // 直近4回分の1回目から現在までの手を見る
  const first = occurrences[count - REPETITION_LIMIT] ?? 0;
  const allChecks: Record<Color, boolean> = { sente: true, gote: true };
  for (let i = first + 1; i <= last; i++) {
    const before = plies[i - 1];
    const after = plies[i];
    if (!before || !after) continue;
    // i 手目は before.turn の側が指した。王手なら after.inCheck
    if (!after.inCheck) allChecks[before.turn] = false;
  }
  if (allChecks.sente && !allChecks.gote) return { type: 'perpetualCheck', count, loser: 'sente' };
  if (allChecks.gote && !allChecks.sente) return { type: 'perpetualCheck', count, loser: 'gote' };
  return { type: 'draw', count };
}
