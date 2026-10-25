// node_modules にある配信用ファイルを public/ へコピーする（外部 CDN を使わず自前配信するため）。
// npm の predev / prebuild / pretest から呼ばれる。コピー先は .gitignore 済み。
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const engineDir = join(root, 'node_modules/@mizarjp/yaneuraou.material9');

/** [コピー元, コピー先]（root からの相対パス） */
const FILES = [
  [join(engineDir, 'lib/yaneuraou.material9.js'), 'public/engine/yaneuraou.material9.js'],
  [join(engineDir, 'lib/yaneuraou.material9.wasm'), 'public/engine/yaneuraou.material9.wasm'],
  [
    join(engineDir, 'lib/yaneuraou.material9.worker.js'),
    'public/engine/yaneuraou.material9.worker.js',
  ],
  [join(engineDir, 'LICENSE.md'), 'public/engine/LICENSE.md'],
  [
    join(root, 'node_modules/coi-serviceworker/coi-serviceworker.min.js'),
    'public/coi-serviceworker.js',
  ],
];

for (const [from, to] of FILES) {
  const dest = join(root, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(from, dest);
}
console.log(`copy-assets: ${FILES.length} 件を public/ にコピーしました`);
