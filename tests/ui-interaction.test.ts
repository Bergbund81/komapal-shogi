// タップ操作の状態機械（DOM なし）
import { describe, expect, it } from 'vitest';
import { GameSession } from '../src/game/session';
import { Interaction } from '../src/ui/interaction';
import { ILLEGAL_MESSAGES, OTHER_TURN_MESSAGE, PICK_PIECE_MESSAGE } from '../src/ui/messages';

function setup(sfen?: string): { session: GameSession; ui: Interaction } {
  const session = new GameSession(sfen);
  return { session, ui: new Interaction(session) };
}

describe('駒をつまんで動かす', () => {
  it('つまむと動ける升が出て、行き先をタップすると指せる', () => {
    const { session, ui } = setup();
    expect(ui.tapSquare('7g')).toBeUndefined();
    expect(ui.selection).toEqual({ kind: 'square', from: '7g', targets: ['7f'] });
    expect(ui.tapSquare('7f')).toBe('7g7f');
    expect(session.history).toEqual(['7g7f']);
    expect(ui.selection.kind).toBe('none');
  });

  it('つまんだ駒をもう一度タップ・cancel() で取り消せる（お手付き取消）', () => {
    const { session, ui } = setup();
    ui.tapSquare('7g');
    ui.tapSquare('7g');
    expect(ui.selection.kind).toBe('none');
    ui.tapSquare('7g');
    ui.cancel();
    expect(ui.selection.kind).toBe('none');
    expect(session.ply).toBe(0);
  });

  it('別の自分の駒をタップすると持ち替える', () => {
    const { ui } = setup();
    ui.tapSquare('7g');
    ui.tapSquare('2g');
    expect(ui.selection).toMatchObject({ kind: 'square', from: '2g' });
  });

  it('行けない升をタップすると理由が出て、つまんだままになる', () => {
    const { session, ui } = setup();
    ui.tapSquare('7g');
    expect(ui.tapSquare('7e')).toBeUndefined();
    expect(ui.notice).toEqual({ tone: 'warn', text: ILLEGAL_MESSAGES.cannotMoveThere });
    expect(ui.selection.kind).toBe('square');
    expect(session.ply).toBe(0);
  });

  it('何もつまんでいないとき、あいての駒・空の升ではやさしく案内する', () => {
    const { ui } = setup();
    ui.tapSquare('3c');
    expect(ui.notice?.text).toContain(ILLEGAL_MESSAGES.notYourPiece);
    expect(ui.selection.kind).toBe('none');
    ui.tapSquare('5e');
    expect(ui.notice?.text).toBe(PICK_PIECE_MESSAGE);
  });

  it('動けない駒をつまんでも選択にならず、説明が出る', () => {
    const { ui } = setup();
    ui.tapSquare('8i'); // 桂馬は両どなりの歩がじゃまで動けない
    expect(ui.selection.kind).toBe('none');
    expect(ui.notice?.tone).toBe('warn');
  });
});

describe('成る / ならない', () => {
  const BISHOP = '4k4/9/9/9/5B3/9/9/9/4K4 b - 1';

  it('成れる升では選択待ちになり、返事で成・不成の手になる', () => {
    const { session, ui } = setup(BISHOP);
    ui.tapSquare('4e');
    expect(ui.tapSquare('2c')).toBeUndefined();
    expect(ui.pendingPromotion).toEqual({ from: '4e', to: '2c', role: 'bishop' });
    // 返事待ちの間は盤を触っても何も起きない
    expect(ui.tapSquare('3d')).toBeUndefined();
    expect(ui.choosePromotion(true)).toBe('4e2c+');
    expect(session.history).toEqual(['4e2c+']);
  });

  it('「ならない」を選ぶと成らずに指す', () => {
    const { ui } = setup(BISHOP);
    ui.tapSquare('4e');
    ui.tapSquare('2c');
    expect(ui.choosePromotion(false)).toBe('4e2c');
  });

  it('成れても選択が出ない升（成れない升）はそのまま指す', () => {
    const { ui } = setup(BISHOP);
    ui.tapSquare('4e');
    expect(ui.tapSquare('3d')).toBe('4e3d');
  });

  it('強制成り（行き所のない駒になる手）は自動で成る', () => {
    const { ui } = setup('8k/4P4/9/9/9/9/9/9/K8 b - 1');
    ui.tapSquare('5b');
    expect(ui.tapSquare('5a')).toBe('5b5a+');
    expect(ui.pendingPromotion).toBeUndefined();
  });

  it('返事をせず cancel() すると選択も消える', () => {
    const { session, ui } = setup(BISHOP);
    ui.tapSquare('4e');
    ui.tapSquare('2c');
    ui.cancel();
    expect(ui.pendingPromotion).toBeUndefined();
    expect(ui.selection.kind).toBe('none');
    expect(session.ply).toBe(0);
  });
});

describe('持ち駒を打つ', () => {
  const HAND_PAWN = '4k4/9/9/9/9/9/4P4/9/4K4 b P 1';

  it('持ち駒をタップ → 打てる升をタップで打てる', () => {
    const { session, ui } = setup(HAND_PAWN);
    ui.tapHand('sente', 'pawn');
    expect(ui.selection).toMatchObject({ kind: 'hand', role: 'pawn' });
    expect(ui.tapSquare('6e')).toBe('P*6e');
    expect(session.history).toEqual(['P*6e']);
  });

  it('二歩の升をタップすると理由（にふ）が出る', () => {
    const { ui } = setup(HAND_PAWN);
    ui.tapHand('sente', 'pawn');
    expect(ui.selection).toMatchObject({ kind: 'hand' });
    if (ui.selection.kind === 'hand') expect(ui.selection.targets).not.toContain('5e');
    expect(ui.tapSquare('5e')).toBeUndefined();
    expect(ui.notice?.text).toBe(ILLEGAL_MESSAGES.nifu);
  });

  it('行き所のない段に打とうとすると理由が出る', () => {
    const { ui } = setup(HAND_PAWN);
    ui.tapHand('sente', 'pawn');
    ui.tapSquare('6a');
    expect(ui.notice?.text).toBe(ILLEGAL_MESSAGES.deadPiece);
  });

  it('同じ持ち駒をもう一度タップすると取り消せる', () => {
    const { ui } = setup(HAND_PAWN);
    ui.tapHand('sente', 'pawn');
    ui.tapHand('sente', 'pawn');
    expect(ui.selection.kind).toBe('none');
  });

  it('あいての持ち駒は触れない', () => {
    const { ui } = setup(HAND_PAWN);
    ui.tapHand('gote', 'pawn');
    expect(ui.selection.kind).toBe('none');
    expect(ui.notice?.text).toBe(OTHER_TURN_MESSAGE);
  });
});

describe('反則・王手・終局', () => {
  it('王手を放置する手は理由つきで指せない', () => {
    const { session, ui } = setup('4r3k/9/9/9/9/9/9/3G5/4K4 b - 1');
    expect(session.position.isCheck()).toBe(true);
    ui.tapSquare('6h');
    ui.tapSquare('6g');
    expect(ui.notice?.text).toBe(ILLEGAL_MESSAGES.leavesKingInCheck);
    expect(session.ply).toBe(0);
  });

  it('打ち歩詰めの升は理由が出る', () => {
    // 後手玉 1a。銀(3b)が 2a を、金(2c)が 2b と 1b を押さえているので、1b に歩を打つと詰み
    const { ui } = setup('8k/6S2/7G1/9/9/9/9/9/4K4 b P 1');
    ui.tapHand('sente', 'pawn');
    ui.tapSquare('1b');
    expect(ui.notice?.text).toBe(ILLEGAL_MESSAGES.uchifuzume);
  });

  it('終局後は盤を触っても動かない', () => {
    const { session, ui } = setup();
    session.resign('sente');
    expect(ui.tapSquare('3c')).toBeUndefined();
    ui.tapSquare('7g');
    expect(ui.selection.kind).toBe('none');
  });

  it('操作してよい色の指定（CPU 対戦の準備）', () => {
    const session = new GameSession();
    const ui = new Interaction(session, (c) => c === 'gote');
    ui.tapSquare('7g');
    expect(ui.selection.kind).toBe('none');
  });

  it('待った後も操作できる', () => {
    const { session, ui } = setup();
    ui.tapSquare('7g');
    ui.tapSquare('7f');
    session.undo();
    ui.cancel();
    ui.tapSquare('2g');
    expect(ui.tapSquare('2f')).toBe('2g2f');
    expect(session.history).toEqual(['2g2f']);
  });
});
