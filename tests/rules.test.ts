// 設計書3章のルールを、具体的な局面で確かめる。
import { describe, expect, it } from 'vitest';
import {
  detectRepetition,
  dropsOf,
  illegalReason,
  impasseStatus,
  INITIAL_SFEN,
  isCheck,
  isCheckmate,
  isLegalMove,
  legalMoves,
  movesFrom,
  parseSfen,
  playMove,
  positionKey,
  toSfen,
  type PlyRecord,
} from '../src/rules';

const sorted = (xs: string[]) => [...xs].sort();

describe('SFEN', () => {
  it('初期局面を読み書きできる', () => {
    const pos = parseSfen(INITIAL_SFEN);
    expect(toSfen(pos)).toBe(INITIAL_SFEN);
    expect(legalMoves(pos)).toHaveLength(30);
  });

  it('局面キーは手数を含まない', () => {
    const a = parseSfen('4k4/9/9/9/9/9/9/9/4K4 b - 1');
    const b = parseSfen('4k4/9/9/9/9/9/9/9/4K4 b - 31');
    expect(positionKey(a)).toBe(positionKey(b));
  });

  it('おかしな SFEN はエラー', () => {
    expect(() => parseSfen('xyz')).toThrow();
    // 二歩の局面は strict では読めない
    expect(() => parseSfen('4k4/9/9/9/4P4/9/4P4/9/4K4 b - 1')).toThrow();
  });
});

describe('駒の動き・成り', () => {
  it('敵陣に入るときは成・不成を選べる', () => {
    const pos = parseSfen('4k4/9/9/4P4/9/9/9/9/4K4 b - 1');
    expect(sorted(movesFrom(pos, '5d'))).toEqual(['5d5c', '5d5c+']);
  });

  it('敵陣の中で動くとき・敵陣から出るときも成れる', () => {
    const pos = parseSfen('k8/9/4S4/9/9/9/9/9/4K4 b - 1');
    // 5c の銀: 前(5b)・斜め前(4b,6b)・斜め後ろ(4d,6d)。すべて成・不成を選べる
    expect(sorted(movesFrom(pos, '5c'))).toEqual(
      sorted(['5c5b', '5c5b+', '5c4b', '5c4b+', '5c6b', '5c6b+', '5c4d', '5c4d+', '5c6d', '5c6d+']),
    );
  });

  it('行き所のない駒は強制的に成る（歩・香は1段目、桂は1〜2段目）', () => {
    const pawn = parseSfen('k8/4P4/9/9/9/9/9/9/4K4 b - 1');
    expect(movesFrom(pawn, '5b')).toEqual(['5b5a+']);
    expect(illegalReason(pawn, '5b5a')).toBe('mustPromote');

    const knight = parseSfen('k8/9/9/4N4/9/9/9/9/4K4 b - 1');
    expect(sorted(movesFrom(knight, '5d'))).toEqual(['5d4b+', '5d6b+']);
    expect(illegalReason(knight, '5d4b')).toBe('mustPromote');

    const lance = parseSfen('k8/9/8L/9/9/9/9/9/4K4 b - 1');
    expect(sorted(movesFrom(lance, '1c'))).toEqual(['1c1a+', '1c1b', '1c1b+']);
  });

  it('成れない場面で成ろうとすると cannotPromote', () => {
    const pos = parseSfen(INITIAL_SFEN);
    expect(illegalReason(pos, '7g7f+')).toBe('cannotPromote');
  });

  it('駒の動きで行けない升・とびこえ・自分の駒の升', () => {
    const pos = parseSfen(INITIAL_SFEN);
    expect(illegalReason(pos, '7g7e')).toBe('cannotMoveThere');
    expect(illegalReason(pos, '2h2c')).toBe('cannotMoveThere'); // 自分の歩をとびこえられない
    expect(illegalReason(pos, '6i7i')).toBe('ownPieceThere');
    expect(illegalReason(pos, '5e5d')).toBe('noPiece');
    expect(illegalReason(pos, '3c3d')).toBe('notYourPiece');
    expect(illegalReason(pos, 'hello')).toBe('invalidUsi');
  });
});

describe('持ち駒を打つ', () => {
  const hand = parseSfen('k8/9/9/9/9/9/9/9/4K4 b PLN 1');

  it('空き升に打てる。行き所のない升には打てない', () => {
    expect(dropsOf(hand, 'pawn')).not.toContain('P*5a');
    expect(dropsOf(hand, 'pawn')).toContain('P*5b');
    expect(illegalReason(hand, 'P*5a')).toBe('deadPiece');
    expect(illegalReason(hand, 'L*5a')).toBe('deadPiece');
    expect(illegalReason(hand, 'N*5b')).toBe('deadPiece');
    expect(illegalReason(hand, 'N*5c')).toBeNull();
  });

  it('駒のある升には打てない。持っていない駒は打てない', () => {
    expect(illegalReason(hand, 'P*5i')).toBe('occupied');
    expect(illegalReason(hand, 'G*5e')).toBe('noPieceInHand');
  });

  it('二歩は禁止。と金がある筋には打てる', () => {
    const nifu = parseSfen('k8/9/9/9/9/9/4P4/9/4K4 b P 1');
    expect(illegalReason(nifu, 'P*5e')).toBe('nifu');
    expect(dropsOf(nifu, 'pawn').some((m) => m.endsWith('5e'))).toBe(false);

    const tokin = parseSfen('k8/9/9/9/9/9/4+P4/9/4K4 b P 1');
    expect(isLegalMove(tokin, 'P*5e')).toBe(true);
  });

  it('打ち歩詰めは禁止、突き歩詰めは可', () => {
    // 後手玉1一、後手桂2一、先手銀2三。歩を1二に打つと詰む → 打てない
    const drop = parseSfen('7nk/9/7S1/9/9/9/9/9/4K4 b P 1');
    expect(illegalReason(drop, 'P*1b')).toBe('uchifuzume');
    expect(legalMoves(drop)).not.toContain('P*1b');

    // 同じ形で盤上の歩を突いて詰ますのは反則ではない
    const push = parseSfen('7nk/9/7SP/9/9/9/9/9/4K4 b - 1');
    expect(isLegalMove(push, '1c1b')).toBe(true);
    expect(isCheckmate(playMove(push, '1c1b'))).toBe(true);

    // 歩を打って王手しても詰みでなければ打てる（玉が2一へ逃げられる）
    const notMate = parseSfen('8k/9/7S1/9/9/9/9/9/4K4 b P 1');
    expect(illegalReason(notMate, 'P*1b')).toBeNull();
  });
});

describe('王手放置・自殺手', () => {
  it('王手されているのに防がない手は王手放置', () => {
    const pos = parseSfen('k3r4/9/9/9/9/9/P8/9/4K4 b - 1');
    expect(isCheck(pos)).toBe(true);
    expect(illegalReason(pos, '9g9f')).toBe('leavesKingInCheck');
    expect(illegalReason(pos, '5i5h')).toBe('leavesKingInCheck');
    expect(sorted(legalMoves(pos))).toEqual(['5i4h', '5i4i', '5i6h', '5i6i']);
  });

  it('ピンされた駒を動かす・利きに玉を動かすのは自殺手', () => {
    const pinned = parseSfen('k3r4/9/9/9/9/9/9/4G4/4K4 b - 1');
    expect(illegalReason(pinned, '5h4h')).toBe('selfCheck');
    expect(isLegalMove(pinned, '5h5g')).toBe(true);

    const king = parseSfen('k4r3/9/9/9/9/9/9/9/4K4 b - 1');
    expect(illegalReason(king, '5i4h')).toBe('selfCheck');
  });
});

describe('詰み', () => {
  it('詰んだ局面は合法手が無い', () => {
    const pos = parseSfen('4k4/4G4/4P4/9/9/9/9/9/4K4 w - 1');
    expect(isCheckmate(pos)).toBe(true);
    expect(legalMoves(pos)).toEqual([]);
  });

  it('頭金で詰む', () => {
    const pos = parseSfen('4k4/9/4P4/9/9/9/9/9/4K4 b G 1');
    expect(isCheckmate(playMove(pos, 'G*5b'))).toBe(true);
  });

  it('王手でも逃げられれば詰みではない', () => {
    const pos = playMove(parseSfen('4k4/9/9/9/9/9/9/9/4K4 b G 1'), 'G*5b');
    expect(isCheck(pos)).toBe(true);
    expect(isCheckmate(pos)).toBe(false);
  });
});

describe('千日手', () => {
  function records(startSfen: string, moves: string[]): PlyRecord[] {
    let pos = parseSfen(startSfen);
    const out: PlyRecord[] = [{ key: positionKey(pos), turn: pos.turn, inCheck: pos.isCheck() }];
    for (const m of moves) {
      pos = playMove(pos, m);
      out.push({ key: positionKey(pos), turn: pos.turn, inCheck: pos.isCheck() });
    }
    return out;
  }
  const cycle = (moves: string[], n: number) => Array.from({ length: n }, () => moves).flat();

  it('同一局面が4回で引き分け（3回までは続く）', () => {
    const shuffle = ['2h3h', '8b7b', '3h2h', '7b8b'];
    const three = records(INITIAL_SFEN, cycle(shuffle, 2));
    expect(detectRepetition(three)).toEqual({ type: 'none', count: 3 });
    const four = records(INITIAL_SFEN, cycle(shuffle, 3));
    expect(detectRepetition(four)).toEqual({ type: 'draw', count: 4 });
  });

  it('連続王手の千日手は王手をかけ続けた側の負け', () => {
    // 先手の飛車が1筋・2筋で王手を続け、後手玉が1一・2一を往復する
    const start = '8k/9/9/9/7R1/9/9/9/K8 b - 1';
    const checks = ['2e1e', '1a2a', '1e2e', '2a1a'];
    const plies = records(start, cycle(checks, 3));
    expect(detectRepetition(plies)).toEqual({ type: 'perpetualCheck', count: 4, loser: 'sente' });
  });
});

describe('入玉宣言（27点法）', () => {
  it('先手は28点以上・10枚以上で宣言できる', () => {
    const ok = impasseStatus(parseSfen('RBGGSS3/4K4/+P+P+P+P5/9/9/9/9/9/8k b RB 1'));
    expect(ok).toMatchObject({ canDeclare: true, points: 28, piecesInZone: 10, kingInZone: true });

    const short = impasseStatus(parseSfen('RBGGSS3/4K4/+P+P+P+P5/9/9/9/9/9/8k b R4P 1'));
    expect(short).toMatchObject({ canDeclare: false, points: 27, requiredPoints: 28 });

    const few = impasseStatus(parseSfen('RBGGSS3/4K4/+P+P+P6/9/9/9/9/9/8k b RB2P 1'));
    expect(few).toMatchObject({ canDeclare: false, points: 29, piecesInZone: 9 });
  });

  it('後手は27点で宣言できる', () => {
    const ok = impasseStatus(parseSfen('K8/9/9/9/9/9/5+p+p+p+p/4k4/3ssggbr w r4p 1'));
    expect(ok).toMatchObject({ canDeclare: true, points: 27, requiredPoints: 27 });

    const short = impasseStatus(parseSfen('K8/9/9/9/9/9/5+p+p+p+p/4k4/3ssggbr w r3p 1'));
    expect(short).toMatchObject({ canDeclare: false, points: 26 });
  });

  it('玉が敵陣にいない・王手されているときは宣言できない', () => {
    const noKing = impasseStatus(parseSfen('RBGGSS3/9/+P+P+P+P5/4K4/9/9/9/9/8k b RB 1'));
    expect(noKing).toMatchObject({ canDeclare: false, kingInZone: false });

    const check = impasseStatus(parseSfen('K3R4/9/9/9/9/9/5+p+p+p+p/4k4/3ssggbr w rb 1'));
    expect(check).toMatchObject({ canDeclare: false, inCheck: true, points: 28 });
  });
});
