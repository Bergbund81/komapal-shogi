// やねうら王（wasm）をのせる Worker。src/ai/engine.ts の Worker から new Worker() で起動される。
// ビルドを通さずにそのまま配信する（emscripten の出力が classic Worker の importScripts を前提にしているため）。
// やり取り: 受信 = USI コマンド文字列、送信 = { type: 'ready' } / { type: 'line', line } / { type: 'error', message }
'use strict';

let engine;
const queue = [];

try {
  importScripts('yaneuraou.material9.js');
  // pthread の Worker も同じフォルダから読み込ませる
  YaneuraOu_Material9({ mainScriptUrlOrBlob: new URL('yaneuraou.material9.js', self.location.href).href })
    .then((instance) => {
      engine = instance;
      engine.addMessageListener((line) => self.postMessage({ type: 'line', line }));
      for (const cmd of queue.splice(0)) engine.postMessage(cmd);
      self.postMessage({ type: 'ready' });
    })
    .catch((err) => self.postMessage({ type: 'error', message: String(err) }));
} catch (err) {
  self.postMessage({ type: 'error', message: String(err) });
}

self.onmessage = (ev) => {
  if (engine) engine.postMessage(ev.data);
  else queue.push(ev.data);
};
