// Worker の中身。DOM にも Worker にも依存しないので、Vitest からそのまま試せる。
import { parseSfen, playMove, type Position } from '../rules';
import { chooseKidsMove } from './kids-ai';
import { getLevel } from './levels';
import type { AiRequest, AiResponse, PositionSpec } from './protocol';
import { createRng, randomSeed } from './rng';

function buildPosition(spec: PositionSpec): Position {
  let pos = parseSfen(spec.startSfen);
  for (const usi of spec.moves) pos = playMove(pos, usi);
  return pos;
}

/** メッセージを 1 件ずつ受け取る関数を作る。返事は post に渡す */
export function createAiHandler(post: (response: AiResponse) => void): (req: AiRequest) => void {
  /** stop が来た要求の id。計算の前後で見て、返事を出さない */
  const stopped = new Set<number>();

  function choose(req: Extract<AiRequest, { type: 'choose' }>): void {
    const level = getLevel(req.level);
    if (!level?.available || !level.kids) {
      post({ type: 'error', id: req.id, message: `レベル${req.level}はまだ使えません` });
      return;
    }
    const pos = buildPosition(req);
    const rng = createRng(req.seed ?? randomSeed());
    const move = chooseKidsMove(pos, level.kids, rng);
    if (stopped.has(req.id)) return;
    post(move ? { type: 'bestmove', id: req.id, move } : { type: 'nomove', id: req.id });
  }

  return (req) => {
    if (req.type === 'stop') {
      stopped.add(req.id);
      return;
    }
    if (req.type === 'analyze') {
      post({ type: 'unsupported', id: req.id });
      return;
    }
    // 一度メッセージ処理に制御を返す。直後に stop が届いていれば計算せずに捨てる
    setTimeout(() => {
      if (stopped.has(req.id)) return;
      try {
        choose(req);
      } catch (err) {
        post({
          type: 'error',
          id: req.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }, 0);
  };
}
