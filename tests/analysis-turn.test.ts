// 形勢ゲージの解析の進め方: 人の番だけ読む、CPU が考え始めたらやめる、古い返事は捨てる
import { describe, expect, it, vi } from 'vitest';
import { AiCancelledError } from '../src/ai/client';
import type { Analysis } from '../src/analysis/evaluate';
import { GameSession } from '../src/game/session';
import { AnalysisTurn } from '../src/ui/analysis-turn';
import type { Color } from '../src/rules';

const result: Analysis = { source: 'engine', cp: 120 };

/** 返事を手動で返せる偽の AiClient */
function fakeClient() {
  const waiting: Array<{ resolve: (a: Analysis) => void; reject: (e: Error) => void }> = [];
  return {
    waiting,
    analyze: vi.fn(
      () =>
        new Promise<Analysis>((resolve, reject) => {
          waiting.push({ resolve, reject });
        }),
    ),
    cancelAnalysis: vi.fn(),
  };
}

function setup(two = false) {
  const humanColor: Color | undefined = two ? undefined : 'sente';
  const session = new GameSession();
  const client = fakeClient();
  const state = { thinking: false, enabled: true, changes: 0 };
  const turn = new AnalysisTurn({
    session,
    client,
    humanColor,
    isCpuThinking: () => state.thinking,
    enabled: () => state.enabled,
    onChange: () => state.changes++,
  });
  return { session, client, state, turn };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('AnalysisTurn', () => {
  it('人の番になったら読み、結果を onChange で知らせる', async () => {
    const { client, state, turn } = setup();
    turn.sync();
    expect(client.analyze).toHaveBeenCalledOnce();
    expect(turn.isWaiting).toBe(true);
    client.waiting[0]?.resolve(result);
    await flush();
    expect(turn.latest).toEqual(result);
    expect(turn.isFresh).toBe(true);
    expect(turn.isWaiting).toBe(false);
    expect(state.changes).toBe(1);
  });

  it('同じ局面を何度 sync しても、読みは 1 回', () => {
    const { client, turn } = setup();
    turn.sync();
    turn.sync();
    turn.sync();
    expect(client.analyze).toHaveBeenCalledOnce();
  });

  it('CPU の番や CPU が考え中のときは読まず、読んでいたらやめる', () => {
    const { session, client, state, turn } = setup();
    turn.sync();
    session.play('7g7f'); // 人が指した → CPU の番
    turn.sync();
    expect(client.cancelAnalysis).toHaveBeenCalled();
    expect(client.analyze).toHaveBeenCalledOnce();
    session.play('3c3d'); // CPU が指した → 人の番。ただし考え中の表示が残っている間は読まない
    state.thinking = true;
    turn.sync();
    expect(client.analyze).toHaveBeenCalledOnce();
    state.thinking = false;
    turn.sync();
    expect(client.analyze).toHaveBeenCalledTimes(2);
  });

  it('やめた解析の古い返事は捨てる', async () => {
    const { session, client, state, turn } = setup();
    turn.sync();
    session.play('7g7f');
    turn.sync(); // cancel
    client.waiting[0]?.resolve(result); // 遅れて届いた古い返事
    await flush();
    expect(turn.latest).toBeUndefined();
    expect(state.changes).toBe(0);
  });

  it('前の局面の値は残り、isFresh が false になる', async () => {
    const { session, client, turn } = setup();
    turn.sync();
    client.waiting[0]?.resolve(result);
    await flush();
    session.play('7g7f');
    expect(turn.latest).toEqual(result);
    expect(turn.isFresh).toBe(false);
  });

  it('待ったなどで同じ局面に戻ったら、読みなおさずキャッシュを使う', async () => {
    const { session, client, turn } = setup();
    turn.sync();
    client.waiting[0]?.resolve(result);
    await flush();
    session.play('7g7f');
    session.play('3c3d');
    turn.sync();
    client.waiting[1]?.resolve({ source: 'engine', cp: -50 });
    await flush();
    session.undo(2);
    turn.sync();
    expect(client.analyze).toHaveBeenCalledTimes(2);
    expect(turn.latest).toEqual(result);
    expect(turn.isFresh).toBe(true);
  });

  it('ゲージが OFF のとき・終局後は読まない', () => {
    const { session, client, state, turn } = setup();
    state.enabled = false;
    turn.sync();
    expect(client.analyze).not.toHaveBeenCalled();
    state.enabled = true;
    session.resign('sente');
    turn.sync();
    expect(client.analyze).not.toHaveBeenCalled();
  });

  it('ふたりでたいせんは毎手読む', () => {
    const { session, client, turn } = setup(true);
    turn.sync();
    session.play('7g7f');
    turn.sync();
    expect(client.analyze).toHaveBeenCalledTimes(2);
  });

  it('読めなかった（AiCancelledError 以外）ときは読みなおさず、待ち表示を消す', async () => {
    const { client, turn } = setup();
    turn.sync();
    client.waiting[0]?.reject(new Error('だめ'));
    await flush();
    expect(turn.isWaiting).toBe(false);
    turn.sync();
    expect(client.analyze).toHaveBeenCalledOnce();
    client.waiting[0]?.reject(new AiCancelledError()); // 二重に来ても平気
  });
});
