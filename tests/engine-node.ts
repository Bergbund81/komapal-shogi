// Node 用のエンジン本体: node_modules のやねうら王（wasm）を直接読み込む。自己対局と結合テストで使う。
import { createRequire } from 'node:module';
import type { EngineBackend } from '../src/ai/engine';

interface YaneuraOuModule {
  postMessage(command: string): void;
  addMessageListener(listener: (line: string) => void): void;
  terminate(): void;
}

const require = createRequire(import.meta.url);

export async function createNodeBackend(): Promise<EngineBackend> {
  const factory = require('@mizarjp/yaneuraou.material9') as () => Promise<YaneuraOuModule>;
  const engine = await factory();
  return {
    send: (command) => engine.postMessage(command),
    onLine: (listener) => engine.addMessageListener(listener),
    dispose: () => engine.terminate(),
  };
}
