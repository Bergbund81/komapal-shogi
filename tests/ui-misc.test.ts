// ふりがな・文言・駒の絵のデータ
import { describe, expect, it } from 'vitest';
import type { GameResult } from '../src/game/session';
import type { IllegalReason } from '../src/rules';
import { segments } from '../src/ui/furigana';
import { ILLEGAL_MESSAGES, resultText } from '../src/ui/messages';
import {
  ALL_ROLES,
  HIRAGANA,
  KANJI,
  READING,
  MOVE_GUIDE,
  isPromotedRole,
  pieceKanji,
  pieceLabel,
  pieceReading,
  promotedRole,
  unpromotedRole,
} from '../src/ui/pieces';

describe('ふりがな', () => {
  it('長い語を優先して一致させる', () => {
    expect(segments('二歩だよ')).toEqual([{ text: '二歩', reading: 'にふ' }, { text: 'だよ' }]);
    expect(segments('打ち歩詰め')).toEqual([{ text: '打ち歩詰め', reading: 'うちふづめ' }]);
    expect(segments('王手')).toEqual([{ text: '王手', reading: 'おうて' }]);
  });

  it('辞書にない文字はそのまま残る', () => {
    expect(segments('ひらがなだけ')).toEqual([{ text: 'ひらがなだけ' }]);
    expect(segments('')).toEqual([]);
  });

  it('HTML っぽい文字もただの文字として扱う（タグにならない）', () => {
    const text = '<img src=x onerror=alert(1)>歩';
    const joined = segments(text)
      .map((s) => s.text)
      .join('');
    expect(joined).toBe(text);
  });
});

describe('文言', () => {
  const reasons: IllegalReason[] = [
    'invalidUsi',
    'noPiece',
    'notYourPiece',
    'noPieceInHand',
    'ownPieceThere',
    'occupied',
    'cannotMoveThere',
    'cannotPromote',
    'mustPromote',
    'deadPiece',
    'nifu',
    'uchifuzume',
    'leavesKingInCheck',
    'selfCheck',
  ];

  it('すべての指せない理由にやさしい説明がある', () => {
    for (const r of reasons) expect(ILLEGAL_MESSAGES[r].length).toBeGreaterThan(5);
    expect(Object.keys(ILLEGAL_MESSAGES).sort()).toEqual([...reasons].sort());
  });

  it('二歩の説明は仕様の文言', () => {
    expect(ILLEGAL_MESSAGES.nifu).toBe('にふ（二歩）だよ。おなじたてのれつに歩は2まいおけないよ');
  });

  it('すべての終局に題と説明がある', () => {
    const results: GameResult[] = [
      { type: 'checkmate', winner: 'sente' },
      { type: 'noMoves', winner: 'gote' },
      { type: 'repetition' },
      { type: 'perpetualCheck', winner: 'sente' },
      { type: 'resign', winner: 'gote' },
      { type: 'impasse', winner: 'sente' },
    ];
    for (const r of results) {
      const t = resultText(r);
      expect(t.title).not.toBe('');
      expect(t.detail).not.toBe('');
    }
    expect(resultText({ type: 'resign', winner: 'gote' }).detail).toContain('先手がこうさん');
  });
});

describe('駒の絵のデータ', () => {
  it('全駒種（成駒・玉を含む）に漢字・ひらがな・動きガイドがある', () => {
    expect(ALL_ROLES).toHaveLength(14);
    for (const role of ALL_ROLES) {
      expect(KANJI[role], role).toBeTruthy();
      expect(HIRAGANA[role], role).toBeTruthy();
      expect(READING[role], role).toBeTruthy();
      expect(MOVE_GUIDE[role]?.length, role).toBeGreaterThan(0);
    }
  });

  it('成り・成る前の対応が行き来できる', () => {
    for (const role of ['pawn', 'lance', 'knight', 'silver', 'bishop', 'rook'] as const) {
      const p = promotedRole(role);
      expect(p).toBeDefined();
      if (p) {
        expect(isPromotedRole(p)).toBe(true);
        expect(unpromotedRole(p)).toBe(role);
      }
    }
    expect(promotedRole('gold')).toBeUndefined();
    expect(promotedRole('king')).toBeUndefined();
  });
});

describe('駒の字とふりがな', () => {
  it('指定どおりの読みになる', () => {
    const expected: Record<string, string> = {
      pawn: 'ふ',
      lance: 'きょう',
      knight: 'けい',
      silver: 'ぎん',
      gold: 'きん',
      bishop: 'かく',
      rook: 'ひ',
      king: 'おう',
      tokin: 'と',
      promotedlance: 'なりきょう',
      promotedknight: 'なりけい',
      promotedsilver: 'なりぎん',
      horse: 'うま',
      dragon: 'りゅう',
    };
    for (const [role, reading] of Object.entries(expected)) {
      expect(pieceReading(role as never, 'sente'), role).toBe(reading);
    }
  });

  it('後手の王は「玉」（読みは ぎょく）、先手は「王」', () => {
    expect(pieceKanji('king', 'sente')).toBe('王');
    expect(pieceKanji('king', 'gote')).toBe('玉');
    expect(pieceReading('king', 'gote')).toBe('ぎょく');
    expect(pieceLabel('king', 'gote', 'hiragana')).toBe('ぎょく');
    expect(pieceLabel('king', 'sente', 'hiragana')).toBe('おう');
    expect(pieceLabel('king', 'gote', 'kanjiRuby')).toBe('玉');
  });

  it('ひらがな表示の成駒は、成る前と同じ字（赤字で区別）', () => {
    expect(pieceLabel('promotedlance', 'sente', 'hiragana')).toBe('きょう');
    expect(pieceLabel('horse', 'sente', 'hiragana')).toBe('うま');
  });
});
