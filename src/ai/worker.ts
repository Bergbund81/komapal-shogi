// AI 用 Web Worker の入口。画面を固めないよう、考える仕事はすべてここで行う。
import { createAiHandler } from './handler';
import type { AiRequest, AiResponse } from './protocol';

const scope = self as unknown as {
  onmessage: ((ev: MessageEvent<AiRequest>) => void) | null;
  postMessage: (message: AiResponse) => void;
};

const handle = createAiHandler((response) => scope.postMessage(response));
scope.onmessage = (ev) => handle(ev.data);
