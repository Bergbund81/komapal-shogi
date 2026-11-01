// CPU レベルの設定。強さの調整はここだけで行う（遊びながら数字を変えられるように）。

export type LevelId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

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
  /** true なら全合法手を 1 手読みして駒得で選ぶ（L2・L3）。false なら合法手からほぼランダム（L1） */
  lookahead: boolean;
  /**
   * lookahead のとき評価に足すゆらぎの大きさ（点。歩 = 100）。大きいほどうっかりが増える。
   * 0 なら同点の最善手から乱数で選ぶ
   */
  noise: number;
}

/** 自作αβのパラメータ（L4〜7、とかんたんモードの L8〜10） */
export interface SearchParams {
  /** 読む深さの上限（手）。時間が足りなければ浅いところで止まる */
  depth: number;
  /** 1 手に使う時間の上限（ミリ秒） */
  timeMs: number;
  /** 末端の評価に足すゆらぎ（点） */
  noise: number;
  /** 深さの先で、取り合いだけをあと何手読むか（静止探索）。省略時 2。0 なら読まない（うっかりが増える） */
  quiescence?: number;
}

/** やねうら王のパラメータ（L8〜10） */
export interface EngineParams {
  /** 読む局面数の上限 */
  nodes?: number;
  /** 1 手に使う時間（ミリ秒） */
  byoyomiMs?: number;
  /**
   * 遅い端末では短く打ち切る（L10）。起動時に測った nps が npsBelow 未満なら、
   * thinkMs ぶんの局面数（測った nps × thinkMs）で止める
   */
  slowDevice?: { npsBelow: number; thinkMs: number };
  /** 候補手の数。2 以上なら候補の中からゆらぎつきで選ぶ */
  multipv: number;
  /** 候補の評価値に足すゆらぎの大きさ（点）。大きいほど最善手以外も選ぶ */
  noise: number;
  /** エンジンが使えないとき（かんたんモード）の自作αβ。L7 より強く、レベルの順番は保つ */
  fallback: SearchParams;
}

/** CPU 投了: 手番側から見た評価値がこれ以下の手が RESIGN_STREAK 回続いたら投了（resigns のレベルだけ） */
export const RESIGN_SCORE = -3000;
export const RESIGN_STREAK = 2;

/** エンジンの設定（全レベル共通） */
export const ENGINE_HASH_MB = 64;
export const ENGINE_MAX_THREADS = 4;
/** 起動時の速さ測定で読む局面数 */
export const BENCH_NODES = 200_000;

export interface LevelConfig {
  id: LevelId;
  name: string;
  /** 端末標準の絵文字（外部の画像・フォントは読み込まない） */
  icon: string;
  description: string;
  /** 'kids' = こども AI、'search' = 自作αβ、'engine' = やねうら王 */
  kind: 'kids' | 'search' | 'engine';
  /** false の間は新規対局で選べない */
  available: boolean;
  /** 負けがはっきりしたら CPU が投了するか */
  resigns: boolean;
  kids?: KidsParams;
  search?: SearchParams;
  engine?: EngineParams;
}

export const LEVELS: readonly LevelConfig[] = [
  // ---- はじめて（こども AI） ----
  {
    id: 1,
    name: 'ひよこ',
    icon: '🐥',
    description: 'ルールをおぼえたばかりの子でも勝てるよ',
    kind: 'kids',
    available: true,
    resigns: false,
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
    // 「モルモット」の絵文字は無いので、にているハムスター
    name: 'モルモット',
    icon: '🐹',
    description: '勝ったり負けたり。駒をとるのがじょうず',
    kind: 'kids',
    available: true,
    resigns: false,
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
    name: 'うさぎ',
    icon: '🐰',
    description: '駒をタダでとられないように気をつけるよ',
    kind: 'kids',
    available: true,
    resigns: false,
    kids: {
      mateInOneProb: 1,
      freePieceTakeProb: 1,
      avoidHangProb: 1,
      avoidBigHangProb: 1,
      avoidKingAdvanceProb: 0,
      lookahead: true,
      noise: 0,
    },
  },
  // ---- れんしゅう（自作αβ） ----
  {
    id: 4,
    name: 'ねこ',
    icon: '🐱',
    description: 'とったりとられたりを、よくみてさすよ',
    kind: 'search',
    available: true,
    resigns: false,
    search: { depth: 1, timeMs: 1000, noise: 30, quiescence: 2 },
  },
  {
    id: 5,
    // 「カピバラ」の絵文字は無いので、にているビーバー
    name: 'カピバラ',
    icon: '🦫',
    description: 'すこし先までよむけど、ときどきのんびり',
    kind: 'search',
    available: true,
    resigns: false,
    search: { depth: 2, timeMs: 1000, noise: 150, quiescence: 1 },
  },
  {
    id: 6,
    name: 'きつね',
    icon: '🦊',
    description: 'すこし先までよんでさすよ',
    kind: 'search',
    available: true,
    resigns: false,
    search: { depth: 2, timeMs: 1000, noise: 0, quiescence: 2 },
  },
  {
    id: 7,
    name: 'オオカミ',
    icon: '🐺',
    description: 'もうすこし先までよむよ。れんしゅうのしあげ',
    kind: 'search',
    available: true,
    resigns: false,
    // 深さ 3 は局面によって 1 秒では読み切れない（深さ 2 で止まり L6 と同じ強さになる）ので 3 秒まで待つ
    search: { depth: 3, timeMs: 3000, noise: 80 },
  },
  // ---- ちょうせん（やねうら王） ----
  {
    id: 8,
    name: 'ツキノワグマ',
    icon: '🐻',
    description: 'なれてきた人むけ。大人のはじめての人にも',
    kind: 'engine',
    available: true,
    resigns: true,
    engine: {
      nodes: 3000,
      multipv: 4,
      noise: 200,
      // L7（深さ 3・3 秒）より強くするため、取り合いを 3 手まで読み、時間も長めにとる
      fallback: { depth: 3, timeMs: 4000, noise: 0, quiescence: 3 },
    },
  },
  {
    id: 9,
    name: 'ライオン',
    icon: '🦁',
    description: '将棋がとくいな大人でもくせん',
    kind: 'engine',
    available: true,
    resigns: true,
    engine: {
      nodes: 300_000,
      multipv: 1,
      noise: 0,
      // 深さ 4 は数秒では読み切れないことが多いので、L8 との差は取り合いの読み（4 手）でつける
      fallback: { depth: 3, timeMs: 5000, noise: 0, quiescence: 4 },
    },
  },
  {
    id: 10,
    name: 'ドラゴン',
    icon: '🐲',
    description: 'とてもつよい。さいごのボス',
    kind: 'engine',
    available: true,
    resigns: true,
    engine: {
      byoyomiMs: 3000,
      slowDevice: { npsBelow: 1_000_000, thinkMs: 1500 },
      multipv: 1,
      noise: 0,
      // L9 よりもう 1 手深く読もうとする（時間内に深さ 4 を読み切れたときだけ L9 より強い）
      fallback: { depth: 4, timeMs: 6000, noise: 0, quiescence: 4 },
    },
  },
];

export function getLevel(id: number): LevelConfig | undefined {
  return LEVELS.find((lv) => lv.id === id);
}

/** 初めて起動したときのレベル */
export const DEFAULT_LEVEL: LevelId = 1;
