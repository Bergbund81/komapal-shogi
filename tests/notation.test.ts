// 日本語表記（notation.ts）と KIF（kif.ts）
import { describe, expect, it } from 'vitest';
import {
  INITIAL_SFEN,
  movesToJapanese,
  parseKif,
  parseSfen,
  playMove,
  toJapanese,
  toKif,
} from '../src/rules';

describe('日本語表記', () => {
  it('▲/△、同、成、不成', () => {
    expect(movesToJapanese(INITIAL_SFEN, ['7g7f', '3c3d', '8h2b+', '3a2b'])).toEqual([
      '▲7六歩',
      '△3四歩',
      '▲2二角成',
      '△同銀',
    ]);
    expect(movesToJapanese(INITIAL_SFEN, ['7g7f', '3c3d', '8h2b'])[2]).toBe('▲2二角不成');
  });

  it('打は盤上の駒も行けるときだけ付ける', () => {
    expect(movesToJapanese(INITIAL_SFEN, ['7g7f', '3c3d', '8h2b+', '3a2b', 'B*4e'])[4]).toBe(
      '▲4五角',
    );
    const pos = parseSfen('4k4/9/9/9/9/9/9/9/5G2K b G 1');
    expect(toJapanese(pos, 'G*4h')).toBe('▲4八金打');
  });

  it('右・左', () => {
    const pos = parseSfen(INITIAL_SFEN);
    expect(toJapanese(pos, '6i5h')).toBe('▲5八金左');
    expect(toJapanese(pos, '4i5h')).toBe('▲5八金右');
  });

  it('直', () => {
    const pos = parseSfen('4k4/9/9/9/9/9/9/9/3GG3K b - 1');
    expect(toJapanese(pos, '5i5h')).toBe('▲5八金直');
    expect(toJapanese(pos, '6i5h')).toBe('▲5八金左');
  });

  it('寄・上・引', () => {
    const yoru = parseSfen('4k4/9/9/9/9/9/9/3G5/5G2K b - 1');
    expect(toJapanese(yoru, '6h5h')).toBe('▲5八金寄');
    expect(toJapanese(yoru, '4i5h')).toBe('▲5八金上');

    const hiku = parseSfen('4k4/9/9/9/9/9/4G4/9/5G2K b - 1');
    expect(toJapanese(hiku, '5g5h')).toBe('▲5八金引');
    expect(toJapanese(hiku, '4i5h')).toBe('▲5八金上');
  });

  it('後手の右・左は後手から見た向き', () => {
    // 後手の金 4a・6a が 5b へ。後手から見て右にあるのは 6a
    const pos = parseSfen(INITIAL_SFEN.replace(' b ', ' w '));
    expect(toJapanese(pos, '6a5b')).toBe('△5二金右');
    expect(toJapanese(pos, '4a5b')).toBe('△5二金左');
  });

  it('lastTo で「同」を指定・無効にできる', () => {
    const pos = playMove(playMove(parseSfen(INITIAL_SFEN), '7g7f'), '3c3d');
    expect(toJapanese(pos, '8h2b+', { lastTo: '2b' })).toBe('▲同角成');
    expect(toJapanese(pos, '8h2b+', { lastTo: null, mark: false })).toBe('2二角成');
  });
});

describe('KIF', () => {
  const moves = [
    '7g7f',
    '3c3d',
    '8h2b',
    '3a2b',
    'B*4e',
    '2b3c',
    '4e3d',
    '8c8d',
    '3d4c+',
    '4a4b',
    '4c4b',
    '5a4b',
    'G*5b',
    '6a5b',
  ];

  it('出力して読み込むと同じ手順に戻る（成・不成・打・同）', () => {
    const kif = toKif({
      startSfen: INITIAL_SFEN,
      moves,
      sente: 'じぶん',
      gote: 'ねこ Lv3',
      startedAt: '2026/10/25 10:00:00',
      ending: '投了',
    });
    expect(kif).toContain('手合割：平手');
    expect(kif).toContain('   3 ２二角不成(88)');
    expect(kif).toContain('   4 同　銀(31)');
    expect(kif).toContain('   5 ４五角打');
    expect(kif).toContain('  15 投了');

    const game = parseKif(kif);
    expect(game).toEqual({
      startSfen: INITIAL_SFEN,
      moves,
      sente: 'じぶん',
      gote: 'ねこ Lv3',
      startedAt: '2026/10/25 10:00:00',
      ending: '投了',
    });
  });

  it('途中局面から始まる棋譜も読み書きできる', () => {
    const start = 'RBGGSS3/4K4/+P+P+P+P5/9/9/9/9/9/8k b RB 1';
    const kif = toKif({ startSfen: start, moves: ['5b4c', '1i1h'] });
    expect(kif).toContain('先手の持駒：飛 角');
    const game = parseKif(kif);
    expect(game.startSfen).toBe(start);
    expect(game.moves).toEqual(['5b4c', '1i1h']);
  });

  it('ほかのソフトの KIF（消費時間つき）を読める', () => {
    const kif = [
      '# ----  Kifu for Windows V7 棋譜ファイル  ----',
      '開始日時：2026/10/01',
      '手合割：平手',
      '先手：太郎',
      '後手：花子',
      '手数----指手---------消費時間--',
      '   1 ７六歩(77)   ( 0:01/00:00:01)',
      '   2 ３四歩(33)   ( 0:02/00:00:02)',
      '   3 ２二角成(88) ( 0:03/00:00:04)',
      '   4 同　銀(31)   ( 0:01/00:00:03)',
      '   5 中断',
      'まで4手で中断',
    ].join('\r\n');
    const game = parseKif(kif);
    expect(game.moves).toEqual(['7g7f', '3c3d', '8h2b+', '3a2b']);
    expect(game.sente).toBe('太郎');
    expect(game.ending).toBe('中断');
  });

  it('指せない手がある KIF はエラー', () => {
    const kif = ['手合割：平手', '   1 ７五歩(77)'].join('\n');
    expect(() => parseKif(kif)).toThrow(/指せない手/);
  });
});
