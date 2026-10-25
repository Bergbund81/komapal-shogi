// 駒の絵（SVG）。五角形＋文字、成駒は赤字、後手の駒は180°回転。
// 「動きガイド」の点は見た目だけのデータ。指せるかどうかの判定は src/rules が行う。
import type { Color, Role } from '../rules';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 駒の絵に使う役。玉・王・成駒を含む */
export const ALL_ROLES: readonly Role[] = [
  'pawn',
  'lance',
  'knight',
  'silver',
  'gold',
  'bishop',
  'rook',
  'king',
  'tokin',
  'promotedlance',
  'promotedknight',
  'promotedsilver',
  'horse',
  'dragon',
];

export const KANJI: Record<string, string> = {
  pawn: '歩',
  lance: '香',
  knight: '桂',
  silver: '銀',
  gold: '金',
  bishop: '角',
  rook: '飛',
  king: '王',
  tokin: 'と',
  promotedlance: '杏',
  promotedknight: '圭',
  promotedsilver: '全',
  horse: '馬',
  dragon: '龍',
};

export const HIRAGANA: Record<string, string> = {
  pawn: 'ふ',
  lance: 'きょう',
  knight: 'けい',
  silver: 'ぎん',
  gold: 'きん',
  bishop: 'かく',
  rook: 'ひ',
  king: 'おう',
  tokin: 'と',
  promotedlance: 'きょう',
  promotedknight: 'けい',
  promotedsilver: 'ぎん',
  horse: 'うま',
  dragon: 'りゅう',
};

const PROMOTED = new Set<string>([
  'tokin',
  'promotedlance',
  'promotedknight',
  'promotedsilver',
  'horse',
  'dragon',
]);

export function isPromotedRole(role: Role): boolean {
  return PROMOTED.has(role);
}

/** 成る前の駒（成れない駒はそのまま） */
export function unpromotedRole(role: Role): Role {
  const map: Partial<Record<Role, Role>> = {
    tokin: 'pawn',
    promotedlance: 'lance',
    promotedknight: 'knight',
    promotedsilver: 'silver',
    horse: 'bishop',
    dragon: 'rook',
  };
  return map[role] ?? role;
}

/** 成った駒（成れない駒は undefined） */
export function promotedRole(role: Role): Role | undefined {
  const map: Partial<Record<Role, Role>> = {
    pawn: 'tokin',
    lance: 'promotedlance',
    knight: 'promotedknight',
    silver: 'promotedsilver',
    bishop: 'horse',
    rook: 'dragon',
  };
  return map[role];
}

export function pieceLabel(role: Role, hiragana: boolean): string {
  return (hiragana ? HIRAGANA : KANJI)[role] ?? '?';
}

/** 動きガイドの点。dx,dy は先手から見た向き（dy=-1 が前）。step=1マス, slide=どこまでも, jump=とびこえ */
export interface GuideMark {
  kind: 'step' | 'slide' | 'jump';
  dx: number;
  dy: number;
}

const step = (dx: number, dy: number): GuideMark => ({ kind: 'step', dx, dy });
const slide = (dx: number, dy: number): GuideMark => ({ kind: 'slide', dx, dy });

const GOLD_MOVES: GuideMark[] = [
  step(-1, -1),
  step(0, -1),
  step(1, -1),
  step(-1, 0),
  step(1, 0),
  step(0, 1),
];
const DIAGONAL_SLIDES: GuideMark[] = [slide(-1, -1), slide(1, -1), slide(-1, 1), slide(1, 1)];
const ORTHO_SLIDES: GuideMark[] = [slide(0, -1), slide(0, 1), slide(-1, 0), slide(1, 0)];

export const MOVE_GUIDE: Record<string, GuideMark[]> = {
  pawn: [step(0, -1)],
  lance: [slide(0, -1)],
  knight: [
    { kind: 'jump', dx: -1, dy: -2 },
    { kind: 'jump', dx: 1, dy: -2 },
  ],
  silver: [step(-1, -1), step(0, -1), step(1, -1), step(-1, 1), step(1, 1)],
  gold: GOLD_MOVES,
  tokin: GOLD_MOVES,
  promotedlance: GOLD_MOVES,
  promotedknight: GOLD_MOVES,
  promotedsilver: GOLD_MOVES,
  bishop: DIAGONAL_SLIDES,
  rook: ORTHO_SLIDES,
  horse: [...DIAGONAL_SLIDES, step(0, -1), step(0, 1), step(-1, 0), step(1, 0)],
  dragon: [...ORTHO_SLIDES, step(-1, -1), step(1, -1), step(-1, 1), step(1, 1)],
  king: [
    step(-1, -1),
    step(0, -1),
    step(1, -1),
    step(-1, 0),
    step(1, 0),
    step(-1, 1),
    step(0, 1),
    step(1, 1),
  ],
};

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export interface PieceOptions {
  guide: boolean;
  hiragana: boolean;
  /** 盤を反対側から見ているとき true（先手の駒が上下さかさまに見える） */
  flipped?: boolean;
}

// 駒の形（中心が原点、幅およそ 80、高さおよそ 90）
const SHAPE = '0,-46 32,-30 40,42 -40,42 -32,-30';

function drawGuide(g: SVGGElement, role: Role): void {
  for (const m of MOVE_GUIDE[role] ?? []) {
    const x = m.dx * (m.kind === 'jump' ? 15 : 27);
    const y = m.dy * (m.kind === 'jump' ? 13 : 29) + 3;
    if (m.kind === 'slide') {
      // どこまでも進める向きは、その向きの小さな三角
      const a = Math.atan2(m.dy, m.dx);
      const tip = [x + Math.cos(a) * 7, y + Math.sin(a) * 7];
      const l = [x + Math.cos(a + 2.4) * 6, y + Math.sin(a + 2.4) * 6];
      const r = [x + Math.cos(a - 2.4) * 6, y + Math.sin(a - 2.4) * 6];
      g.append(
        svgEl('polygon', {
          points: `${tip.join(',')} ${l.join(',')} ${r.join(',')}`,
          class: 'guide guide-slide',
        }),
      );
    } else {
      g.append(svgEl('circle', { cx: x, cy: y, r: 4.5, class: `guide guide-${m.kind}` }));
    }
  }
}

function drawLabel(g: SVGGElement, role: Role, hiragana: boolean): void {
  const label = pieceLabel(role, hiragana);
  const chars = [...label];
  const cls = isPromotedRole(role) ? 'piece-text promoted' : 'piece-text';
  const size = chars.length === 1 ? 42 : chars.length === 2 ? 30 : 24;
  const lineHeight = size * 0.98;
  const top = 4 - ((chars.length - 1) * lineHeight) / 2;
  chars.forEach((ch, i) => {
    const t = svgEl('text', {
      x: 0,
      y: top + i * lineHeight,
      'font-size': size,
      class: cls,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
    t.textContent = ch;
    g.append(t);
  });
}

/** 駒 1 枚の絵（原点が中心）。画面の下側の人から見て、あいての駒は 180° 回転 */
export function pieceGroup(role: Role, color: Color, opts: PieceOptions): SVGGElement {
  const g = svgEl('g', { class: `piece piece-${color}` });
  const upsideDown = (color === 'gote') !== (opts.flipped === true);
  const body = svgEl('g', upsideDown ? { transform: 'rotate(180)' } : {});
  body.append(svgEl('polygon', { points: SHAPE, class: 'piece-body' }));
  if (opts.guide) drawGuide(body, role);
  drawLabel(body, role, opts.hiragana);
  g.append(body);
  return g;
}

/** 持ち駒やダイアログ用の、単独の駒の SVG */
export function pieceSvg(role: Role, color: Color, opts: PieceOptions): SVGSVGElement {
  const svg = svgEl('svg', {
    viewBox: '-46 -52 92 104',
    class: 'piece-svg',
    'aria-hidden': 'true',
  });
  svg.append(pieceGroup(role, color, opts));
  return svg;
}
