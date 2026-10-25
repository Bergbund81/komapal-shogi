// 棋譜一覧（日本語表記）。いまの手を強調して、見える位置までスクロールする。
import { movesToJapanese } from '../rules';

export function renderHistory(
  container: HTMLElement,
  startSfen: string,
  moves: readonly string[],
): void {
  const texts = movesToJapanese(startSfen, moves);
  const rows = texts.map((text, i) => {
    const li = document.createElement('li');
    li.className = 'history-row';
    if (i === texts.length - 1) li.classList.add('current');
    const no = document.createElement('span');
    no.className = 'history-no';
    no.textContent = String(i + 1);
    const move = document.createElement('span');
    move.className = 'history-move';
    move.textContent = text;
    li.append(no, move);
    return li;
  });
  container.replaceChildren(...rows);
  // ページ全体は動かさず、一覧の中だけを最新の手までスクロールする
  container.scrollTop = container.scrollHeight;
}
