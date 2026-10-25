// 子ども向けの文言。責めずに、理由をやさしく説明する。漢字は furigana.ts でルビになる。
import type { GameResult } from '../game/session';
import { opposite, type Color, type IllegalReason } from '../rules';

/** 指せない理由 → 説明。Record なので、理由が増えたら型エラーで気づける */
export const ILLEGAL_MESSAGES: Record<IllegalReason, string> = {
  invalidUsi: 'うまくよみとれなかったよ。もういちどタップしてね',
  noPiece: 'そこには駒がないよ。うごかしたい駒をタップしてね',
  notYourPiece: 'それはあいての駒だよ。じぶんの駒をタップしてね',
  noPieceInHand: 'その駒は、もっていないよ',
  ownPieceThere: 'そこにはじぶんの駒がいるよ。ほかのところをえらんでね',
  occupied: 'そこにはもう駒があるよ。からっぽのところにうってね',
  cannotMoveThere: 'その駒は、そこへはいけないよ。ひかっているところへいけるよ',
  cannotPromote: 'そこでは「なる」ことはできないよ',
  mustPromote: 'そこへいくと、うごけなくなるよ。「なる」をえらんでね',
  deadPiece: 'そこにおくと、あとでうごけなくなっちゃうよ。ほかのところにおいてね',
  nifu: 'にふ（二歩）だよ。おなじたてのれつに歩は2まいおけないよ',
  uchifuzume:
    'うちふづめ（打ち歩詰め）だよ。歩をうって、すぐに王さまをつませるのはルールでダメなんだ',
  leavesKingInCheck: '王さまがねらわれたままだよ。王さまをにがすか、まもってね',
  selfCheck: 'そこにうごかすと、王さまがとられちゃうよ。ほかのところをえらんでね',
};

export const CHECK_MESSAGE = '王さまがねらわれているよ！にげるか、まもろう';
export const PICK_PIECE_MESSAGE = 'うごかしたい駒をタップしてね';
export const STUCK_PIECE_MESSAGE = 'この駒は、いまはうごかせないよ。ほかの駒をえらんでね';
export const NO_DROP_MESSAGE = 'この駒は、いまはうてるところがないよ';
export const OTHER_TURN_MESSAGE = 'いまはあいてのばんだよ';

export const COLOR_NAMES: Record<Color, string> = { sente: '先手', gote: '後手' };

/** 画面に出す呼び名。CPU 戦では「あなた」と CPU の名前にする */
export type SideNames = Readonly<Record<Color, string>>;

export const THINKING_MESSAGE = 'かんがえちゅう…';
export const CPU_ERROR_MESSAGE =
  'CPUがうまくうごかなかったよ。「まった」でやりなおすか、あたらしくはじめてね';

export function turnMessage(color: Color, names: SideNames = COLOR_NAMES): string {
  return `${names[color]}のばんだよ`;
}

/** CPU 戦での呼び名 */
export function cpuSideNames(human: Color, cpuName: string): SideNames {
  return human === 'sente'
    ? { sente: 'あなた', gote: cpuName }
    : { sente: cpuName, gote: 'あなた' };
}

export interface ResultText {
  title: string;
  detail: string;
}

/** 終局のお知らせ */
export function resultText(result: GameResult, names: SideNames = COLOR_NAMES): ResultText {
  switch (result.type) {
    case 'checkmate':
      return {
        title: '詰みだよ！',
        detail: `${names[result.winner]}の勝ち！ 王さまがにげられなくなったよ`,
      };
    case 'noMoves':
      return {
        title: 'うごかせる駒がないよ',
        detail: `${names[result.winner]}の勝ち！`,
      };
    case 'repetition':
      return {
        title: '千日手だよ',
        detail: 'おなじ形が4回になったよ。ひきわけだから、もういちどさしなおそう',
      };
    case 'perpetualCheck':
      return {
        title: '連続王手の千日手だよ',
        detail: `${names[opposite(result.winner)]}は王手をつづけすぎたよ。${names[result.winner]}の勝ち！`,
      };
    case 'resign':
      return {
        title: 'こうさん',
        detail: `${names[opposite(result.winner)]}がこうさんしたよ。${names[result.winner]}の勝ち！`,
      };
    case 'impasse':
      return {
        title: '入玉せんげん',
        detail: `${names[result.winner]}の勝ち！`,
      };
  }
}
