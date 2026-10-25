// CPU の番の進め方: 最低 0.6 秒、古い返事を捨てる、人が後手なら CPU が先に指す
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiCancelledError } from '../src/ai/client';
import { resolveGame, sanitizeConfig } from '../src/game/config';
import { GameSession } from '../src/game/session';
import { CpuTurn, MIN_THINK_MS } from '../src/ui/cpu-turn';
import { Interaction } from '../src/ui/interaction';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** 返事を手動で返せる偽の AiClient */
function fakeClient() {
  const waiting: Array<{ resolve: (m: string | undefined) => void; reject: (e: Error) => void }> =
    [];
  return {
    waiting,
    choose: vi.fn(
      () =>
        new Promise<string | undefined>((resolve, reject) => {
          waiting.push({ resolve, reject });
        }),
    ),
    stop: vi.fn(() => {
      for (const w of waiting.splice(0)) w.reject(new AiCancelledError());
    }),
  };
}

function setup(cpuColor: 'sente' | 'gote') {
  const session = new GameSession();
  const client = fakeClient();
  const events: string[] = [];
  const cpu = new CpuTurn({
    session,
    client,
    cpuColor,
    level: 1,
    onThinking: (t) => events.push(t ? 'thinking' : 'done'),
    onMove: (usi) => events.push(`move ${usi}`),
    onError: (e) => events.push(`error ${e.message}`),
  });
  return { session, client, cpu, events };
}

describe('CpuTurn', () => {
  it('CPU の番でなければ何もしない', async () => {
    const { client, cpu, events } = setup('gote');
    await cpu.maybeStart();
    expect(client.choose).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('返事が速くても、最低 0.6 秒たってから指す', async () => {
    const { session, client, cpu, events } = setup('sente');
    const started = cpu.maybeStart();
    expect(cpu.isThinking).toBe(true);
    client.waiting[0]?.resolve('7g7f'); // すぐ返事
    await vi.advanceTimersByTimeAsync(MIN_THINK_MS - 1);
    expect(session.ply).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await started;
    expect(session.history).toEqual(['7g7f']);
    expect(events).toEqual(['thinking', 'done', 'move 7g7f']);
    expect(cpu.isThinking).toBe(false);
  });

  it('局面は「開始局面 + 手順」で AI に渡す', async () => {
    const { session, client, cpu } = setup('gote');
    session.play('7g7f');
    void cpu.maybeStart();
    expect(client.choose).toHaveBeenCalledWith(1, {
      startSfen: session.startSfen,
      moves: ['7g7f'],
    });
  });

  it('考え中に cancel すると、返事が来ても指さない', async () => {
    const { session, cpu, events } = setup('sente');
    const started = cpu.maybeStart();
    cpu.cancel();
    await vi.advanceTimersByTimeAsync(MIN_THINK_MS * 2);
    await started;
    expect(session.ply).toBe(0);
    expect(events).toEqual(['thinking', 'done']);
  });

  it('cancel のあとの新しい要求を、古い返事が邪魔しない', async () => {
    const { session, client, cpu } = setup('sente');
    void cpu.maybeStart();
    const stale = client.waiting[0];
    cpu.cancel();
    const second = cpu.maybeStart();
    client.waiting[0]?.resolve('2g2f');
    stale?.resolve('7g7f'); // 古い返事（すでにやめた要求）
    await vi.advanceTimersByTimeAsync(MIN_THINK_MS);
    await second;
    expect(session.history).toEqual(['2g2f']);
  });

  it('AI が失敗したら onError を呼び、考え中をやめる', async () => {
    const { cpu, client, events } = setup('sente');
    const started = cpu.maybeStart();
    client.waiting[0]?.reject(new Error('だめだった'));
    await vi.advanceTimersByTimeAsync(MIN_THINK_MS);
    await started;
    expect(events).toEqual(['thinking', 'done', 'error だめだった']);
    expect(cpu.isThinking).toBe(false);
  });

  it('考え中に二重に始めない', async () => {
    const { cpu, client } = setup('sente');
    void cpu.maybeStart();
    void cpu.maybeStart();
    expect(client.choose).toHaveBeenCalledTimes(1);
  });
});

describe('CPU 戦で人が動かせる駒', () => {
  it('人が先手なら、CPU（後手）の番は操作できない', () => {
    const session = new GameSession();
    const interaction = new Interaction(session, (c) => c === 'sente');
    interaction.tapSquare('7g');
    expect(interaction.selection.kind).toBe('square');
    interaction.tapSquare('7f');
    expect(session.history).toEqual(['7g7f']);
    interaction.tapSquare('3c'); // CPU の番
    expect(interaction.selection.kind).toBe('none');
    expect(session.ply).toBe(1);
  });
});

describe('対局設定', () => {
  it('ランダムは開始時に先手か後手に決まる', () => {
    const base = { mode: 'cpu', level: 1, side: 'random' } as const;
    expect(resolveGame(base, () => 0.1).humanColor).toBe('sente');
    expect(resolveGame(base, () => 0.9).humanColor).toBe('gote');
    expect(resolveGame({ ...base, side: 'gote' }).humanColor).toBe('gote');
    expect(resolveGame({ ...base, mode: 'two' }).humanColor).toBeUndefined();
  });

  it('壊れた保存データや選べないレベルは既定値に戻す', () => {
    expect(sanitizeConfig(null)).toEqual({ mode: 'cpu', level: 1, side: 'sente' });
    expect(sanitizeConfig({ mode: 'two', level: 5, side: 'gote' })).toEqual({
      mode: 'two',
      level: 1,
      side: 'gote',
    });
    expect(sanitizeConfig({ mode: 'x', level: 'a', side: 3 })).toEqual({
      mode: 'cpu',
      level: 1,
      side: 'sente',
    });
    expect(sanitizeConfig({ mode: 'cpu', level: 2, side: 'random' }).level).toBe(2);
  });
});
