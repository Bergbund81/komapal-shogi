// 漢字にふりがな（<ruby>）を付けるヘルパー。画面の文言はすべてここを通す。
// 辞書にある語を長い順に探して一致させる。innerHTML は使わない（文字は textContent で入れる）。
import { getSettings } from './settings';

export interface Segment {
  text: string;
  /** ふりがな。無ければ読み仮名なしの文字 */
  reading?: string;
}

const DICTIONARY: ReadonlyArray<readonly [string, string]> = [
  ['打ち歩詰め', 'うちふづめ'],
  ['連続王手', 'れんぞくおうて'],
  ['千日手', 'せんにちて'],
  ['持ち駒', 'もちごま'],
  ['入玉', 'にゅうぎょく'],
  ['投了', 'とうりょう'],
  ['将棋', 'しょうぎ'],
  ['王手', 'おうて'],
  ['二歩', 'にふ'],
  ['先手', 'せんて'],
  ['後手', 'ごて'],
  ['棋譜', 'きふ'],
  ['設定', 'せってい'],
  ['詰み', 'つみ'],
  ['勝ち', 'かち'],
  ['王', 'おう'],
  ['玉', 'ぎょく'],
  ['駒', 'こま'],
  ['歩', 'ふ'],
  ['香', 'きょう'],
  ['桂', 'けい'],
  ['銀', 'ぎん'],
  ['金', 'きん'],
  ['角', 'かく'],
  ['飛', 'ひ'],
  ['盤', 'ばん'],
  ['手', 'て'],
  ['回', 'かい'],
  ['形', 'かたち'],
  ['反則', 'はんそく'],
  ['負け', 'まけ'],
  ['勝', 'か'],
];

const BY_LENGTH = [...DICTIONARY].sort((a, b) => b[0].length - a[0].length);

/** 文を「ふりがな付きの語」と「そのままの文字」に分ける（DOM を使わないので単体テストできる） */
export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  let plain = '';
  let i = 0;
  while (i < text.length) {
    const hit = BY_LENGTH.find(([word]) => text.startsWith(word, i));
    if (hit) {
      if (plain) out.push({ text: plain });
      plain = '';
      out.push({ text: hit[0], reading: hit[1] });
      i += hit[0].length;
    } else {
      plain += text[i];
      i++;
    }
  }
  if (plain) out.push({ text: plain });
  return out;
}

/** text をふりがな付きの DOM にする。設定でふりがながOFFならそのままの文字 */
export function ruby(text: string, enabled: boolean = getSettings().furigana): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const seg of segments(text)) {
    if (!enabled || seg.reading === undefined) {
      frag.append(seg.text);
      continue;
    }
    const el = document.createElement('ruby');
    const rt = document.createElement('rt');
    rt.textContent = seg.reading;
    el.append(seg.text, rt);
    frag.append(el);
  }
  return frag;
}

/** 要素の中身を、ふりがな付きの text に置き換える */
export function setRuby(el: Element, text: string): void {
  el.replaceChildren(ruby(text));
}
