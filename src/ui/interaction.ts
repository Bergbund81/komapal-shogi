// タップ操作の状態機械。DOM を使わないので単体テストできる。
// 合法手の判定はすべて src/rules に任せ、ここでは「どの升・どの駒を触ったか」だけを扱う。
import { parseSquareName } from 'shogiops/util';
import type { GameSession } from '../game/session';
import { dropsOf, illegalReason, movesFrom, type Color, type Role } from '../rules';
import {
  ILLEGAL_MESSAGES,
  NO_DROP_MESSAGE,
  OTHER_TURN_MESSAGE,
  PICK_PIECE_MESSAGE,
  STUCK_PIECE_MESSAGE,
  turnMessage,
} from './messages';

export type Selection =
  | { kind: 'none' }
  | { kind: 'square'; from: string; targets: string[] }
  | { kind: 'hand'; role: Role; targets: string[] };

export interface PendingPromotion {
  from: string;
  to: string;
  role: Role;
}

export interface Notice {
  text: string;
  tone: 'info' | 'warn';
}

const DROP_LETTER: Partial<Record<Role, string>> = {
  pawn: 'P',
  lance: 'L',
  knight: 'N',
  silver: 'S',
  gold: 'G',
  bishop: 'B',
  rook: 'R',
};

export function dropUsi(role: Role, square: string): string {
  return `${DROP_LETTER[role] ?? '?'}*${square}`;
}

/** USI の行き先の升（"7g7f" → "7f"、"P*5e" → "5e"） */
function destOf(usi: string): string {
  return usi.slice(2, 4);
}

function uniqueDests(usis: string[]): string[] {
  return [...new Set(usis.map(destOf))];
}

export class Interaction {
  selection: Selection = { kind: 'none' };
  /** 成る/ならないの返事待ち（このあいだ盤の操作は止まる） */
  pendingPromotion: PendingPromotion | undefined;
  notice: Notice | undefined;

  /** controls: その色の駒をこの画面で動かしてよいか（2人対戦は常に true） */
  constructor(
    private readonly session: GameSession,
    private readonly controls: (color: Color) => boolean = () => true,
  ) {}

  private get canAct(): boolean {
    return !this.session.isOver && this.controls(this.session.turn) && !this.pendingPromotion;
  }

  private warn(text: string): void {
    this.notice = { text, tone: 'warn' };
  }

  /** つまんでいるのを元に戻す（お手付き取消）。メッセージも消す */
  cancel(): void {
    this.selection = { kind: 'none' };
    this.pendingPromotion = undefined;
    this.notice = undefined;
  }

  /** 盤の升をタップ。指した手があれば USI を返す */
  tapSquare(square: string): string | undefined {
    if (!this.canAct) return undefined;
    const pos = this.session.position;
    const sel = this.selection;
    const sq = parseSquareName(square);
    const piece = sq === undefined ? undefined : pos.board.pieceAt(sq);
    const mine = piece?.color === pos.turn;

    if (sel.kind === 'square' && sel.from === square) {
      this.cancel();
      return undefined;
    }
    if (sel.kind !== 'none' && sel.targets.includes(square)) {
      return sel.kind === 'square'
        ? this.moveTo(sel.from, square)
        : this.play(dropUsi(sel.role, square));
    }
    if (mine) {
      this.selectSquare(square);
      return undefined;
    }
    if (sel.kind === 'square') {
      this.explainMove(sel.from, square);
    } else if (sel.kind === 'hand') {
      this.warn(
        ILLEGAL_MESSAGES[illegalReason(pos, dropUsi(sel.role, square)) ?? 'cannotMoveThere'],
      );
    } else if (piece) {
      this.warn(`${ILLEGAL_MESSAGES.notYourPiece}（${turnMessage(pos.turn)}）`);
    } else {
      this.notice = { text: PICK_PIECE_MESSAGE, tone: 'info' };
    }
    return undefined;
  }

  /** 持ち駒をタップ。color はその持ち駒の持ち主 */
  tapHand(color: Color, role: Role): void {
    if (!this.canAct) return;
    if (color !== this.session.turn) {
      this.warn(OTHER_TURN_MESSAGE);
      return;
    }
    if (this.selection.kind === 'hand' && this.selection.role === role) {
      this.cancel();
      return;
    }
    const targets = uniqueDests(dropsOf(this.session.position, role));
    if (targets.length === 0) {
      this.selection = { kind: 'none' };
      this.warn(NO_DROP_MESSAGE);
      return;
    }
    this.selection = { kind: 'hand', role, targets };
    this.notice = undefined;
  }

  /** 「なる/ならない」の返事。指した手を返す */
  choosePromotion(promote: boolean): string | undefined {
    const p = this.pendingPromotion;
    if (!p) return undefined;
    this.pendingPromotion = undefined;
    return this.play(`${p.from}${p.to}${promote ? '+' : ''}`);
  }

  private selectSquare(square: string): void {
    const targets = uniqueDests(movesFrom(this.session.position, square));
    if (targets.length === 0) {
      this.selection = { kind: 'none' };
      this.warn(STUCK_PIECE_MESSAGE);
      return;
    }
    this.selection = { kind: 'square', from: square, targets };
    this.notice = undefined;
  }

  private moveTo(from: string, to: string): string | undefined {
    const moves = movesFrom(this.session.position, from).filter((m) => m.startsWith(from + to));
    const promotes = moves.some((m) => m.endsWith('+'));
    const stays = moves.some((m) => !m.endsWith('+'));
    if (promotes && stays) {
      const piece = this.session.position.board.pieceAt(parseSquareName(from) ?? -1);
      if (!piece) return undefined;
      this.pendingPromotion = { from, to, role: piece.role };
      return undefined;
    }
    return this.play(moves[0] ?? `${from}${to}`);
  }

  private play(usi: string): string | undefined {
    try {
      this.session.play(usi);
    } catch {
      const reason = illegalReason(this.session.position, usi) ?? 'cannotMoveThere';
      this.selection = { kind: 'none' };
      this.warn(ILLEGAL_MESSAGES[reason]);
      return undefined;
    }
    this.selection = { kind: 'none' };
    this.notice = undefined;
    return usi;
  }

  /** つまんだ駒で、光っていない升をタップしたときの説明 */
  private explainMove(from: string, to: string): void {
    const pos = this.session.position;
    const plain = illegalReason(pos, `${from}${to}`);
    // 成りを選べば行ける場合（成らないと行き所がない）の説明は「なる」を案内する
    const reason = plain ?? illegalReason(pos, `${from}${to}+`) ?? 'cannotMoveThere';
    this.warn(ILLEGAL_MESSAGES[reason]);
  }
}
