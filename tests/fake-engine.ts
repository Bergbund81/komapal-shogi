// テスト用の偽 USI エンジン。usi / isready に答え、go には think() の返す行を返す。
import type { EngineBackend } from '../src/ai/engine';

export interface FakeEngine extends EngineBackend {
  /** 受け取ったコマンド */
  sent: string[];
  disposed: boolean;
}

/**
 * think(position, go) が返す行（info ... と bestmove ...）を、go を受け取ったときに流す。
 * null を返すと返事をしない（止まったエンジンのまね）。{ onStop } を返すと stop を受けたときに流す
 */
export function fakeEngine(
  think: (position: string, go: string) => string[] | null | { onStop: string[] } = () => [
    'info depth 1 score cp 10 nodes 100 nps 2000000 pv 7g7f',
    'bestmove 7g7f',
  ],
): FakeEngine {
  const listeners: Array<(line: string) => void> = [];
  let position = '';
  let held: string[] = [];
  const emit = (line: string): void => {
    for (const l of listeners) l(line);
  };
  const engine: FakeEngine = {
    sent: [],
    disposed: false,
    send(command) {
      engine.sent.push(command);
      if (command === 'usi') queueMicrotask(() => emit('usiok'));
      else if (command === 'isready') queueMicrotask(() => emit('readyok'));
      else if (command.startsWith('position')) position = command;
      else if (command.startsWith('go')) {
        const lines = think(position, command);
        if (Array.isArray(lines)) queueMicrotask(() => lines.forEach(emit));
        else if (lines) held = lines.onStop;
      } else if (command === 'stop') {
        const lines = held.splice(0);
        queueMicrotask(() => lines.forEach(emit));
      }
    },
    onLine(listener) {
      listeners.push(listener);
    },
    dispose() {
      engine.disposed = true;
    },
  };
  return engine;
}
