// 形勢の評価: 勝率の式、先手/後手の視点、顔と一言、詰みの表示
import { describe, expect, it } from 'vitest';
import {
  finishedView,
  formatCp,
  gaugeView,
  makeAnalysis,
  winRate,
  type Analysis,
} from '../src/analysis/evaluate';
import { MATE_SCORE } from '../src/ai/engine';

const at = (cp: number): Analysis => ({ source: 'engine', cp });

describe('winRate', () => {
  it('評価値 0 は 50%、600 で約 73%', () => {
    expect(winRate(0)).toBe(0.5);
    expect(winRate(600)).toBeCloseTo(0.731, 3);
    expect(winRate(-600)).toBeCloseTo(0.269, 3);
  });
});

describe('makeAnalysis', () => {
  it('後手番の点は先手から見た符号にそろえる', () => {
    expect(makeAnalysis('engine', 'gote', -250).cp).toBe(250);
    expect(makeAnalysis('engine', 'sente', -250).cp).toBe(-250);
    expect(Object.is(makeAnalysis('engine', 'gote', 0).cp, 0)).toBe(true);
  });

  it('詰みの点なら手数を割り出す', () => {
    expect(makeAnalysis('simple', 'sente', MATE_SCORE - 3)).toMatchObject({ mateIn: 3 });
    expect(makeAnalysis('simple', 'gote', MATE_SCORE - 3)).toMatchObject({
      cp: -(MATE_SCORE - 3),
      mateIn: 3,
    });
    expect(makeAnalysis('engine', 'sente', 500).mateIn).toBeUndefined();
  });
});

describe('gaugeView', () => {
  it('じぶんから見た勝率にする（先手 +500 は、後手から見ると逆）', () => {
    const a = at(500);
    expect(gaugeView(a, 'sente').winRate).toBeCloseTo(winRate(500), 5);
    expect(gaugeView(a, 'gote').winRate).toBeCloseTo(winRate(-500), 5);
    expect(gaugeView(a, 'gote').cp).toBe(-500);
  });

  it('顔と一言: いいかんじ / ごかく / ピンチ', () => {
    expect(gaugeView(at(300), 'sente')).toMatchObject({
      mood: 'good',
      face: '😊',
      phrase: 'いいかんじ！',
    });
    expect(gaugeView(at(250), 'sente')).toMatchObject({
      mood: 'even',
      face: '😐',
      phrase: 'ごかく',
    });
    expect(gaugeView(at(-250), 'sente')).toMatchObject({ mood: 'even' });
    expect(gaugeView(at(-300), 'sente')).toMatchObject({
      mood: 'bad',
      face: '😟',
      phrase: 'ピンチ！',
    });
  });

  it('詰みが見えたら「あと5手でつむ」。数字（評価値）は出さない', () => {
    const mate = makeAnalysis('engine', 'sente', MATE_SCORE - 5, 5);
    const mine = gaugeView(mate, 'sente');
    expect(mine).toMatchObject({ mood: 'good', phrase: 'あと5手でつむ！' });
    expect(mine.cp).toBeUndefined();
    expect(gaugeView(mate, 'gote')).toMatchObject({
      mood: 'bad',
      phrase: 'ピンチ！あと5手でつまされるよ',
    });
  });

  it('手数が分からない詰み・勝率は 1%〜99% におさめる', () => {
    const unknown = makeAnalysis('engine', 'sente', MATE_SCORE, 0);
    expect(gaugeView(unknown, 'sente').phrase).toBe('つみがみえたよ！');
    expect(gaugeView(unknown, 'sente').winRate).toBe(0.99);
    expect(gaugeView(unknown, 'gote').winRate).toBe(0.01);
  });

  it('かんたん評価かどうかを引きつぐ', () => {
    expect(gaugeView({ source: 'simple', cp: 0 }, 'sente').source).toBe('simple');
  });
});

describe('finishedView / formatCp', () => {
  it('終局: かち / まけ / ひきわけ', () => {
    expect(finishedView('sente', 'sente')).toMatchObject({ winRate: 0.99, phrase: 'かち！' });
    expect(finishedView('sente', 'gote')).toMatchObject({ winRate: 0.01, phrase: 'まけちゃった' });
    expect(finishedView(undefined, 'gote')).toMatchObject({ winRate: 0.5, phrase: 'ひきわけ' });
  });

  it('評価値の文字は + を付ける', () => {
    expect(formatCp(350)).toBe('+350');
    expect(formatCp(-80)).toBe('-80');
    expect(formatCp(0)).toBe('0');
  });
});
