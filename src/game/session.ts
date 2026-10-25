// 対局の進行: 履歴スタック、待った（無制限）、進む、終局判定。
// 合法手の判定はすべて src/rules に任せる。
import {
  canDeclareImpasse,
  detectRepetition,
  hasNoLegalMoves,
  INITIAL_SFEN,
  isCheckmate,
  normalizeUsi,
  opposite,
  parseSfen,
  playMove,
  positionKey,
  toSfen,
  type Color,
  type PlyRecord,
  type Position,
} from '../rules';

export type GameResult =
  | { type: 'checkmate'; winner: Color }
  /** 王手されていないのに指す手が無い（行き詰まり）。指せない側の負け */
  | { type: 'noMoves'; winner: Color }
  | { type: 'repetition' }
  | { type: 'perpetualCheck'; winner: Color }
  | { type: 'resign'; winner: Color }
  | { type: 'impasse'; winner: Color };

export type GameStatus = { type: 'playing'; repetitionCount: number } | GameResult;

function plyRecord(pos: Position): PlyRecord {
  return { key: positionKey(pos), turn: pos.turn, inCheck: pos.isCheck() };
}

export class GameSession {
  readonly startSfen: string;
  /** positions[0] は開始局面、positions[i] は i 手目の後 */
  private positions: Position[];
  private plies: PlyRecord[];
  private moves: string[] = [];
  /** 待ったで戻した手（末尾が次に進む手） */
  private redoStack: string[] = [];
  /** 投了・入玉宣言など、盤面からは決まらない終局 */
  private declared: GameResult | undefined;
  /** 「まった」を使った回数（undo を呼んだ回数） */
  undoCount = 0;

  constructor(startSfen: string = INITIAL_SFEN) {
    const start = parseSfen(startSfen);
    this.startSfen = toSfen(start);
    this.positions = [start];
    this.plies = [plyRecord(start)];
  }

  get position(): Position {
    const pos = this.positions[this.positions.length - 1];
    if (!pos) throw new Error('局面がありません');
    return pos;
  }

  get sfen(): string {
    return toSfen(this.position);
  }

  get turn(): Color {
    return this.position.turn;
  }

  /** 現在までの手順（USI） */
  get history(): readonly string[] {
    return this.moves;
  }

  /** 現在の手数 */
  get ply(): number {
    return this.moves.length;
  }

  /** i 手目の後の局面（0 = 開始局面） */
  positionAt(ply: number): Position | undefined {
    return this.positions[ply];
  }

  get canUndo(): boolean {
    return this.moves.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  status(): GameStatus {
    if (this.declared) return this.declared;
    const pos = this.position;
    if (isCheckmate(pos)) return { type: 'checkmate', winner: opposite(pos.turn) };
    if (hasNoLegalMoves(pos)) return { type: 'noMoves', winner: opposite(pos.turn) };
    const rep = detectRepetition(this.plies);
    if (rep.type === 'draw') return { type: 'repetition' };
    if (rep.type === 'perpetualCheck') {
      return { type: 'perpetualCheck', winner: opposite(rep.loser) };
    }
    return { type: 'playing', repetitionCount: rep.count };
  }

  get isOver(): boolean {
    return this.status().type !== 'playing';
  }

  /**
   * 手を指す。指せない手なら IllegalMoveError（理由つき）。
   * 待ったの後に「進む」と同じ手を指したときは進む先を残し、別の手なら進む先は消える。
   */
  play(usi: string): Position {
    if (this.isOver) throw new Error('対局は終わっています');
    const next = playMove(this.position, usi);
    const norm = normalizeUsi(usi) ?? usi;
    if (this.redoStack[this.redoStack.length - 1] === norm) this.redoStack.pop();
    else this.redoStack = [];
    this.push(norm, next);
    return next;
  }

  private push(usi: string, pos: Position): void {
    this.moves.push(usi);
    this.positions.push(pos);
    this.plies.push(plyRecord(pos));
  }

  private popOne(): string | undefined {
    const usi = this.moves.pop();
    if (usi === undefined) return undefined;
    this.positions.pop();
    this.plies.pop();
    this.redoStack.push(usi);
    return usi;
  }

  /** 待った: plies 手戻す（無制限）。戻せた手数を返す */
  undo(plies = 1): number {
    let n = 0;
    while (n < plies && this.popOne() !== undefined) n++;
    if (n > 0) {
      this.undoCount++;
      this.declared = undefined;
    }
    return n;
  }

  /**
   * 待った（CPU 対戦向け）: color の直前の手を指す前まで戻す。
   * 例: 人が先手なら、CPU の応手と人の手をまとめて戻し、また人の番にする。
   */
  undoToTurn(color: Color): number {
    let n = 0;
    while (this.moves.length > 0) {
      // 戻す手を指したのは、その手の直前の局面の手番側
      const mover = this.positions[this.positions.length - 2]?.turn;
      this.popOne();
      n++;
      if (mover === color) break; // color の手を戻せば color の番になる
    }
    if (n > 0) {
      this.undoCount++;
      this.declared = undefined;
    }
    return n;
  }

  /** 進む: 待ったで戻した手を plies 手やり直す。進めた手数を返す */
  redo(plies = 1): number {
    let n = 0;
    while (n < plies) {
      const usi = this.redoStack.pop();
      if (usi === undefined) break;
      this.push(usi, playMove(this.position, usi));
      n++;
    }
    return n;
  }

  /** color が投了する */
  resign(color: Color): void {
    this.declared = { type: 'resign', winner: opposite(color) };
  }

  /** 手番側が入玉宣言する。条件を満たしていれば勝ちで true、満たさなければ何もせず false */
  declareImpasse(): boolean {
    if (this.isOver || !canDeclareImpasse(this.position)) return false;
    this.declared = { type: 'impasse', winner: this.turn };
    return true;
  }
}
