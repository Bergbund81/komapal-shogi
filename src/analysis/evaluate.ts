// 形勢の評価。Worker の中で局面を解析して Analysis にし、画面側が「じぶん」から見た表示（gaugeView）にする。
// やねうら王で読む（ふつう）／使えないときは自作αβで代わりに評価する（かんたん評価）。
import { searchAlphaBeta } from '../ai/alphabeta';
import { MATE_SCORE, type Candidate, type UsiEngine } from '../ai/engine';
import type { PositionSpec } from '../ai/protocol';
import type { Color, Position } from '../rules';

/** 勝率 = 1 / (1 + exp(-評価値 / WIN_RATE_SCALE)) */
export const WIN_RATE_SCALE = 600;
/** やねうら王で形勢を読む時間（ミリ秒）。CPU の番には使わず、人が考えている間だけ読む */
export const ANALYSIS_MS = 500;
/** かんたん評価（自作αβ）の上限。同期処理なので短くする */
export const SIMPLE_ANALYSIS = { depth: 2, timeMs: 250, quiescence: 2 } as const;

/** この勝率以上なら「いいかんじ」、以下なら「ピンチ」 */
export const GOOD_RATE = 0.62;
export const BAD_RATE = 0.38;
/** 表示する勝率の範囲（詰みでも 100% / 0% にはしない。まだ終わっていない） */
const MIN_RATE = 0.01;
const MAX_RATE = 0.99;

/** 局面の評価。先手から見た値で持つ（盤をひっくり返しても作り直さない） */
export interface Analysis {
  /** engine = やねうら王、simple = 自作αβ（かんたん評価） */
  source: 'engine' | 'simple';
  /** 先手から見た評価値（歩 = 100）。詰みは ±(MATE_SCORE - 手数) */
  cp: number;
  /** 詰みが見えたときの手数。0 は手数が分からない。勝つ側は cp の正負で分かる */
  mateIn?: number;
}

export function winRate(cp: number): number {
  return 1 / (1 + Math.exp(-cp / WIN_RATE_SCALE));
}

function senteView(turn: Color, score: number): number {
  return turn === 'sente' ? score : -score;
}

/** 手番側から見た点を Analysis にする。mateIn が無くても、詰みの点なら手数を割り出す */
export function makeAnalysis(
  source: Analysis['source'],
  turn: Color,
  score: number,
  mateIn?: number,
): Analysis {
  const cp = senteView(turn, score) + 0; // +0 で -0 を 0 に
  const isMate = mateIn !== undefined || Math.abs(score) >= MATE_SCORE - 1000;
  if (!isMate) return { source, cp };
  return { source, cp, mateIn: mateIn ?? MATE_SCORE - Math.abs(score) };
}

export function analysisFromCandidate(
  cand: Candidate,
  turn: Color,
  source: Analysis['source'] = 'engine',
): Analysis {
  return makeAnalysis(
    source,
    turn,
    cand.score,
    cand.mate === undefined ? undefined : Math.abs(cand.mate),
  );
}

export type Mood = 'good' | 'even' | 'bad';

/** 「じぶん」から見たゲージの表示内容 */
export interface GaugeView {
  /** じぶんの勝率（0.01〜0.99） */
  winRate: number;
  /** じぶんから見た評価値。詰みが見えているときは undefined */
  cp?: number;
  mood: Mood;
  face: string;
  phrase: string;
  source: Analysis['source'];
}

const FACES: Record<Mood, string> = { good: '😊', even: '😐', bad: '😟' };

function moodOf(rate: number): Mood {
  if (rate >= GOOD_RATE) return 'good';
  if (rate <= BAD_RATE) return 'bad';
  return 'even';
}

function mateText(mine: boolean, n: number): string {
  if (mine) return n > 0 ? `あと${n}手でつむ！` : 'つみがみえたよ！';
  return n > 0 ? `ピンチ！あと${n}手でつまされるよ` : 'ピンチ！つまされそう';
}

export function gaugeView(a: Analysis, viewer: Color): GaugeView {
  const cp = viewer === 'sente' ? a.cp : -a.cp;
  const mine = cp > 0;
  const raw = a.mateIn === undefined ? winRate(cp) : mine ? 1 : 0;
  const rate = Math.min(MAX_RATE, Math.max(MIN_RATE, raw));
  const mood = a.mateIn === undefined ? moodOf(rate) : mine ? 'good' : 'bad';
  const phrase =
    a.mateIn === undefined
      ? { good: 'いいかんじ！', even: 'ごかく', bad: 'ピンチ！' }[mood]
      : mateText(mine, a.mateIn);
  const view: GaugeView = { winRate: rate, mood, face: FACES[mood], phrase, source: a.source };
  if (a.mateIn === undefined) view.cp = Math.round(cp);
  return view;
}

/** 勝敗が決まったあとのゲージ。winner が undefined なら引き分け */
export function finishedView(winner: Color | undefined, viewer: Color): GaugeView {
  if (winner === undefined) {
    return { winRate: 0.5, mood: 'even', face: FACES.even, phrase: 'ひきわけ', source: 'engine' };
  }
  const won = winner === viewer;
  return {
    winRate: won ? MAX_RATE : MIN_RATE,
    mood: won ? 'good' : 'bad',
    face: won ? '😆' : '😢',
    phrase: won ? 'かち！' : 'まけちゃった',
    source: 'engine',
  };
}

/** 「+350」のような評価値の文字 */
export function formatCp(cp: number): string {
  return cp > 0 ? `+${cp}` : String(cp);
}

/** やねうら王で形勢を読む。stop されて何も読めなかったときは undefined */
export async function analyzeWithEngine(
  engine: UsiEngine,
  spec: PositionSpec,
  turn: Color,
): Promise<Analysis | undefined> {
  const result = await engine.go(spec, { byoyomiMs: ANALYSIS_MS, multipv: 1 });
  const best = result.candidates[0];
  return best ? analysisFromCandidate(best, turn, 'engine') : undefined;
}

/** 自作αβで形勢を読む（かんたん評価）。指せる手が無い局面は undefined */
export function analyzeWithSearch(pos: Position): Analysis | undefined {
  const r = searchAlphaBeta(pos, {
    maxDepth: SIMPLE_ANALYSIS.depth,
    timeMs: SIMPLE_ANALYSIS.timeMs,
    quiescenceDepth: SIMPLE_ANALYSIS.quiescence,
    noise: 0,
  });
  return r ? makeAnalysis('simple', pos.turn, r.score) : undefined;
}
