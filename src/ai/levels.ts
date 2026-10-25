// CPU レベルの設定。強さの調整はここだけで行う（遊びながら数字を変えられるように）。

export type LevelId = 1 | 2 | 3 | 4 | 5;

/** 自作「こども AI」のパラメータ */
export interface KidsParams {
  /** 1 手詰めに気づく確率（気づかなかったときは通常の選び方に進む） */
  mateInOneProb: number;
  /** タダで取れる駒があるとき、実際に取りにいく確率（L1 だけが使う） */
  freePieceTakeProb: number;
  /**
   * L1: 指した駒がタダで取られる手を避ける確率（小駒・金銀など）。0 なら気にせず指す
   * （避けようとするだけで、ほかに手があるときだけ。毎回ではないので「うっかり」が残る）
   */
  avoidHangProb: number;
  /** L1: 飛車・角（龍・馬もふくむ）がタダで取られる手を避ける確率。小さいほど大駒をうっかりおく */
  avoidBigHangProb: number;
  /** L1: 王手されていないのに、王を前（あいての陣のほう）へ出す手を避ける確率 */
  avoidKingAdvanceProb: number;
  /** true なら全合法手を 1 手読みして駒得で選ぶ（L2）。false なら合法手からほぼランダム（L1） */
  lookahead: boolean;
  /** lookahead のとき評価に足すゆらぎの大きさ（点。歩 = 100）。大きいほどうっかりが増える */
  noise: number;
}

export interface LevelConfig {
  id: LevelId;
  name: string;
  /** 端末標準の絵文字（外部の画像・フォントは読み込まない） */
  icon: string;
  description: string;
  /** 'kids' = 自作 AI、'engine' = やねうら王（フェーズ4で有効化） */
  kind: 'kids' | 'engine';
  /** false の間は新規対局で選べない */
  available: boolean;
  kids?: KidsParams;
}

export const LEVELS: readonly LevelConfig[] = [
  {
    id: 1,
    name: 'ひよこ',
    icon: '🐥',
    description: 'ルールをおぼえたばかりの子でも勝てるよ',
    kind: 'kids',
    available: true,
    kids: {
      mateInOneProb: 0.15,
      freePieceTakeProb: 0.35,
      avoidHangProb: 0.3,
      avoidBigHangProb: 0.1,
      avoidKingAdvanceProb: 0.8,
      lookahead: false,
      noise: 0,
    },
  },
  {
    id: 2,
    name: 'こいぬ',
    icon: '🐶',
    description: '勝ったり負けたり。駒をとるのがじょうず',
    kind: 'kids',
    available: true,
    kids: {
      mateInOneProb: 1,
      freePieceTakeProb: 1,
      avoidHangProb: 0,
      avoidBigHangProb: 0,
      avoidKingAdvanceProb: 0,
      lookahead: true,
      noise: 250,
    },
  },
  {
    id: 3,
    name: 'ねこ',
    icon: '🐱',
    description: 'すこしなれた人むけ',
    kind: 'engine',
    available: false,
  },
  {
    id: 4,
    name: 'ペンギン',
    icon: '🐧',
    description: '将棋がとくいな大人でもくせん',
    kind: 'engine',
    available: false,
  },
  {
    id: 5,
    name: 'ドラゴン',
    icon: '🐲',
    description: 'とてもつよい',
    kind: 'engine',
    available: false,
  },
];

export function getLevel(id: number): LevelConfig | undefined {
  return LEVELS.find((lv) => lv.id === id);
}

/** 初めて起動したときのレベル */
export const DEFAULT_LEVEL: LevelId = 1;
