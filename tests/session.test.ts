// 対局の進行（待った・進む・終局）
import { describe, expect, it } from 'vitest';
import { GameSession } from '../src/game/session';
import { IllegalMoveError, INITIAL_SFEN, legalMoves, toSfen } from '../src/rules';

/** 再現できる乱数（mulberry32） */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function playRandom(session: GameSession, plies: number, seed: number): void {
  const rand = rng(seed);
  for (let i = 0; i < plies && !session.isOver; i++) {
    const moves = legalMoves(session.position);
    session.play(moves[Math.floor(rand() * moves.length)] ?? '');
  }
}

describe('待った・進む', () => {
  it.each([1, 2, 3, 4, 5])(
    'ランダムに指して全部待った→全部進むで局面が一致する (seed %i)',
    (seed) => {
      const s = new GameSession();
      playRandom(s, 80, seed);
      const n = s.ply;
      const sfens = Array.from({ length: n + 1 }, (_, i) => {
        const pos = s.positionAt(i);
        return pos ? toSfen(pos) : '';
      });
      const finalStatus = s.status();
      const moves = [...s.history];

      for (let i = n; i > 0; i--) {
        expect(s.sfen).toBe(sfens[i]);
        expect(s.undo()).toBe(1);
      }
      expect(s.sfen).toBe(INITIAL_SFEN);
      expect(s.canUndo).toBe(false);
      expect(s.undo()).toBe(0);
      expect(s.undoCount).toBe(n);

      for (let i = 1; i <= n; i++) {
        expect(s.redo()).toBe(1);
        expect(s.sfen).toBe(sfens[i]);
      }
      expect(s.canRedo).toBe(false);
      expect(s.history).toEqual(moves);
      expect(s.status()).toEqual(finalStatus);
    },
  );

  it('別の手を指すと進む先は消える。同じ手なら残る', () => {
    const s = new GameSession();
    for (const m of ['7g7f', '3c3d', '2g2f', '8c8d']) s.play(m);
    s.undo(3);
    expect(s.ply).toBe(1);

    s.play('3c3d'); // 進む先の1手目と同じ
    expect(s.canRedo).toBe(true);
    expect(s.redo(10)).toBe(2);
    expect(s.history).toEqual(['7g7f', '3c3d', '2g2f', '8c8d']);

    s.undo(2);
    s.play('6g6f'); // 違う手
    expect(s.canRedo).toBe(false);
    expect(s.history).toEqual(['7g7f', '3c3d', '6g6f']);
  });

  it('CPU 対戦向けの待ったは、自分の直前の手まで戻す', () => {
    const s = new GameSession();
    for (const m of ['7g7f', '3c3d', '2g2f', '8c8d']) s.play(m);
    expect(s.undoToTurn('sente')).toBe(2);
    expect(s.history).toEqual(['7g7f', '3c3d']);
    expect(s.turn).toBe('sente');
    expect(s.undoCount).toBe(1);

    // 自分が後手で、自分の手の後（先手の手番）
    s.play('2g2f');
    s.play('8c8d');
    s.play('2f2e');
    expect(s.undoToTurn('gote')).toBe(2);
    expect(s.history).toEqual(['7g7f', '3c3d', '2g2f']);
    expect(s.turn).toBe('gote');
  });
});

describe('指し手と終局', () => {
  it('指せない手は理由つきのエラー', () => {
    const s = new GameSession('k8/9/9/9/9/9/4P4/9/4K4 b P 1');
    let error: unknown;
    try {
      s.play('P*5e');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(IllegalMoveError);
    expect((error as IllegalMoveError).reason).toBe('nifu');
    expect(s.ply).toBe(0);
  });

  it('詰みで終局し、それ以上は指せない', () => {
    const s = new GameSession('4k4/9/4P4/9/9/9/9/9/4K4 b G 1');
    s.play('G*5b');
    expect(s.status()).toEqual({ type: 'checkmate', winner: 'sente' });
    expect(() => s.play('5a4a')).toThrow();
    s.undo();
    expect(s.status().type).toBe('playing');
  });

  it('千日手（4回目）で引き分け', () => {
    const s = new GameSession();
    const shuffle = ['2h3h', '8b7b', '3h2h', '7b8b'];
    for (let i = 0; i < 11; i++) s.play(shuffle[i % 4] ?? '');
    // 11手目の後の局面は3手目・7手目の後と同じ（3回目）
    expect(s.status()).toEqual({ type: 'playing', repetitionCount: 3 });
    s.play('7b8b');
    expect(s.status()).toEqual({ type: 'repetition' });
  });

  it('連続王手の千日手は王手側の負け', () => {
    const s = new GameSession('8k/9/9/9/7R1/9/9/9/K8 b - 1');
    const checks = ['2e1e', '1a2a', '1e2e', '2a1a'];
    for (let i = 0; i < 12; i++) s.play(checks[i % 4] ?? '');
    expect(s.status()).toEqual({ type: 'perpetualCheck', winner: 'gote' });
  });

  it('投了と入玉宣言', () => {
    const s = new GameSession();
    s.resign('sente');
    expect(s.status()).toEqual({ type: 'resign', winner: 'gote' });
    expect(() => s.play('7g7f')).toThrow(); // 投了後は指せない

    const ok = new GameSession('RBGGSS3/4K4/+P+P+P+P5/9/9/9/9/9/8k b RB 1');
    expect(ok.declareImpasse()).toBe(true);
    expect(ok.status()).toEqual({ type: 'impasse', winner: 'sente' });

    const ng = new GameSession('RBGGSS3/4K4/+P+P+P+P5/9/9/9/9/9/8k b R 1');
    expect(ng.declareImpasse()).toBe(false);
    expect(ng.status().type).toBe('playing');
  });
});
