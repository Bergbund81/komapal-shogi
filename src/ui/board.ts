// 9×9 の盤（SVG）。見た目だけを担当し、どの升をタップしたかを通知する。
import { makeSquareName, parseSquareName } from 'shogiops/util';
import type { Color, Position } from '../rules';
import { pieceGroup, svgEl } from './pieces';

const CELL = 100;
const MARGIN_LEFT = 10;
const MARGIN_TOP = 34;
const MARGIN_RIGHT = 34;
const MARGIN_BOTTOM = 10;
const BOARD = CELL * 9;
const RANK_LETTERS = 'abcdefghi';
const RANK_KANJI = '一二三四五六七八九';

export interface BoardState {
  position: Position;
  /** true なら後手が下（盤を 180° 回して見る） */
  flipped: boolean;
  /** つまんでいる駒の升 */
  selected?: string | undefined;
  /** 動ける（打てる）升 */
  targets: ReadonlySet<string>;
  /** 直前の手 */
  lastMove?: string | undefined;
  /** 王手されている王の升 */
  checkSquare?: string | undefined;
  guide: boolean;
  hiragana: boolean;
}

/** 画面の列・行 → USI の升名。"7g" = 7筋・g段（一番上が a 段、左端が 9 筋） */
function squareAt(col: number, row: number, flipped: boolean): string {
  return flipped ? `${col + 1}${RANK_LETTERS[8 - row]}` : `${9 - col}${RANK_LETTERS[row]}`;
}

/** 王手されている手番側の王の升 */
export function kingSquareOf(pos: Position, color: Color): string | undefined {
  for (const sq of pos.board.byPiece(color, 'king')) return makeSquareName(sq);
  return undefined;
}

export class BoardView {
  readonly el: SVGSVGElement;

  constructor(private readonly onSquareTap: (square: string) => void) {
    this.el = svgEl('svg', {
      viewBox: `0 0 ${MARGIN_LEFT + BOARD + MARGIN_RIGHT} ${MARGIN_TOP + BOARD + MARGIN_BOTTOM}`,
      class: 'board',
      role: 'group',
      'aria-label': 'しょうぎばん',
    });
    this.el.addEventListener('click', (ev) => {
      const target = (ev.target as Element).closest<SVGElement>('[data-sq]');
      const sq = target?.dataset['sq'];
      if (sq) this.onSquareTap(sq);
    });
  }

  render(state: BoardState): void {
    const { flipped } = state;
    const layer = (cls: string): SVGGElement => svgEl('g', { class: cls });
    const background = layer('board-bg');
    const marks = layer('board-marks');
    const pieces = layer('board-pieces');
    const taps = layer('board-taps');

    background.append(
      svgEl('rect', {
        x: MARGIN_LEFT,
        y: MARGIN_TOP,
        width: BOARD,
        height: BOARD,
        class: 'board-wood',
      }),
    );
    this.drawGrid(background, flipped);

    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const sq = squareAt(col, row, flipped);
        const x = MARGIN_LEFT + col * CELL;
        const y = MARGIN_TOP + row * CELL;
        this.drawSquareMarks(marks, state, sq, x, y);
        const piece = state.position.board.pieceAt(parseSquareName(sq) ?? -1);
        if (piece) {
          const g = pieceGroup(piece.role, piece.color, state);
          g.setAttribute('transform', `translate(${x + CELL / 2} ${y + CELL / 2}) scale(0.92)`);
          pieces.append(g);
        }
        taps.append(
          svgEl('rect', { x, y, width: CELL, height: CELL, class: 'board-tap', 'data-sq': sq }),
        );
      }
    }
    this.el.replaceChildren(background, marks, pieces, taps);
  }

  private drawGrid(parent: SVGGElement, flipped: boolean): void {
    for (let i = 0; i <= 9; i++) {
      const p = i * CELL;
      parent.append(
        svgEl('line', {
          x1: MARGIN_LEFT,
          y1: MARGIN_TOP + p,
          x2: MARGIN_LEFT + BOARD,
          y2: MARGIN_TOP + p,
          class: 'board-line',
        }),
        svgEl('line', {
          x1: MARGIN_LEFT + p,
          y1: MARGIN_TOP,
          x2: MARGIN_LEFT + p,
          y2: MARGIN_TOP + BOARD,
          class: 'board-line',
        }),
      );
    }
    for (const c of [3, 6]) {
      for (const r of [3, 6]) {
        parent.append(
          svgEl('circle', {
            cx: MARGIN_LEFT + c * CELL,
            cy: MARGIN_TOP + r * CELL,
            r: 6,
            class: 'board-star',
          }),
        );
      }
    }
    // 筋の数字（上）と段の漢数字（右）。はんてん中は並びが逆になる
    for (let i = 0; i < 9; i++) {
      const file = flipped ? i + 1 : 9 - i;
      const rank = flipped ? 8 - i : i;
      const fileLabel = svgEl('text', {
        x: MARGIN_LEFT + i * CELL + CELL / 2,
        y: MARGIN_TOP - 10,
        class: 'board-coord',
        'text-anchor': 'middle',
      });
      fileLabel.textContent = String(file);
      const rankLabel = svgEl('text', {
        x: MARGIN_LEFT + BOARD + 17,
        y: MARGIN_TOP + i * CELL + CELL / 2 + 9,
        class: 'board-coord',
        'text-anchor': 'middle',
      });
      rankLabel.textContent = RANK_KANJI[rank] ?? '';
      parent.append(fileLabel, rankLabel);
    }
  }

  private drawSquareMarks(
    parent: SVGGElement,
    state: BoardState,
    sq: string,
    x: number,
    y: number,
  ): void {
    const rect = (cls: string): SVGRectElement =>
      svgEl('rect', { x: x + 2, y: y + 2, width: CELL - 4, height: CELL - 4, rx: 8, class: cls });
    const last = state.lastMove;
    if (last && (sq === last.slice(2, 4) || (last[1] !== '*' && sq === last.slice(0, 2)))) {
      parent.append(rect('mark-last'));
    }
    if (state.checkSquare === sq) parent.append(rect('mark-check'));
    if (state.selected === sq) parent.append(rect('mark-selected'));
    if (state.targets.has(sq)) {
      const occupied = state.position.board.hasPieceAt(parseSquareName(sq) ?? -1);
      parent.append(rect(occupied ? 'mark-target mark-capture' : 'mark-target'));
    }
  }
}
