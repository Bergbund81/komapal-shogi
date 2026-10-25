// 持ち駒の表示。種類別に並べ、枚数を付ける。タップした駒の種類を通知する。
import { HAND_ROLES, type Color, type Position, type Role } from '../rules';
import { pieceSvg, type PieceOptions } from './pieces';

export interface HandState {
  position: Position;
  color: Color;
  /** 打つ駒としてつまんでいる種類 */
  selected?: Role | undefined;
  /** 持ち主の番か（番でないときは薄く見せる） */
  active: boolean;
  options: PieceOptions;
}

const ROLE_NAMES: Record<string, string> = {
  rook: 'ひしゃ',
  bishop: 'かく',
  gold: 'きん',
  silver: 'ぎん',
  knight: 'けいま',
  lance: 'きょうしゃ',
  pawn: 'ふ',
};

/** container の中身を持ち駒に置き換える */
export function renderHand(
  container: HTMLElement,
  state: HandState,
  onTap: (color: Color, role: Role) => void,
): void {
  const hand = state.position.hands.color(state.color);
  const buttons: HTMLElement[] = [];
  for (const role of HAND_ROLES) {
    const count = hand.get(role);
    if (count <= 0) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hand-piece';
    if (state.selected === role) btn.classList.add('selected');
    btn.dataset['hand'] = role;
    btn.setAttribute('aria-label', `${ROLE_NAMES[role] ?? role} ${count}まい`);
    btn.setAttribute('aria-pressed', String(state.selected === role));
    btn.append(pieceSvg(role, state.color, state.options));
    if (count > 1) {
      const badge = document.createElement('span');
      badge.className = 'hand-count';
      badge.textContent = String(count);
      btn.append(badge);
    }
    btn.addEventListener('click', () => onTap(state.color, role));
    buttons.push(btn);
  }
  container.classList.toggle('active', state.active);
  container.classList.toggle('empty', buttons.length === 0);
  container.replaceChildren(...buttons);
}
