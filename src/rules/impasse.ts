// 入玉宣言（27点法、日本将棋連盟の規定）。宣言できる条件:
// 1. 宣言側の手番 2. 玉が敵陣（相手側3段）にいる 3. 敵陣にある駒（玉以外）と持ち駒の点数が
//    先手28点以上・後手27点以上（大駒=飛・角・龍・馬が5点、ほかは1点）
// 4. 敵陣にある玉以外の駒が10枚以上 5. 王手がかかっていない
// （持ち時間の条件はこのアプリでは扱わない）
import type { Role, Square } from 'shogiops/types';
import { squareRank } from 'shogiops/util';
import type { Color, Position } from './position';

const BIG_ROLES: readonly Role[] = ['rook', 'bishop', 'dragon', 'horse'];

export const IMPASSE_REQUIRED_POINTS: Record<Color, number> = { sente: 28, gote: 27 };
export const IMPASSE_REQUIRED_PIECES = 10;

export interface ImpasseStatus {
  canDeclare: boolean;
  kingInZone: boolean;
  /** 敵陣にある玉以外の駒の枚数 */
  piecesInZone: number;
  /** 敵陣の駒（玉以外）＋持ち駒の点数 */
  points: number;
  requiredPoints: number;
  inCheck: boolean;
}

export function inEnemyZone(color: Color, sq: Square): boolean {
  const rank = squareRank(sq); // 0 = 一段目
  return color === 'sente' ? rank <= 2 : rank >= 6;
}

function rolePoints(role: Role): number {
  return BIG_ROLES.includes(role) ? 5 : 1;
}

/** 手番側が入玉宣言できるかと、その内訳 */
export function impasseStatus(pos: Position): ImpasseStatus {
  const color = pos.turn;
  let kingInZone = false;
  let piecesInZone = 0;
  let points = 0;
  for (const sq of pos.board.byColor(color)) {
    const role = pos.board.roleAt(sq);
    if (!role || !inEnemyZone(color, sq)) continue;
    if (role === 'king') {
      kingInZone = true;
    } else {
      piecesInZone++;
      points += rolePoints(role);
    }
  }
  for (const [role, n] of pos.hands.color(color)) points += rolePoints(role) * n;

  const requiredPoints = IMPASSE_REQUIRED_POINTS[color];
  const inCheck = pos.isCheck();
  return {
    canDeclare:
      kingInZone && piecesInZone >= IMPASSE_REQUIRED_PIECES && points >= requiredPoints && !inCheck,
    kingInZone,
    piecesInZone,
    points,
    requiredPoints,
    inCheck,
  };
}

export function canDeclareImpasse(pos: Position): boolean {
  return impasseStatus(pos).canDeclare;
}
