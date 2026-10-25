# CLAUDE.md — KomaPal Shogi（子ども向け CPU 対戦将棋）開発ルール

ブラウザだけで動く静的サイト（TypeScript + Vite）。GitHub Pages で公開する。
仕様の正は `docs/設計書.md`。設計書に無いことは実装前に質問すること。

## 絶対ルール
- 将棋のルール判定は `src/rules/` だけで行う。UI や AI で独自に合法手判定をしない。
- CPU は全レベルで必ず `legalMoves()` の中から手を選ぶ。
- 指し手の内部表現は USI 形式（`7g7f`, `P*5e`, `8h2b+`）。日本語表記は `notation.ts` で変換。
- AI・エンジンは必ず Web Worker 内で動かす（画面を固めない）。
- サーバは存在しない前提。外部 API・外部 CDN・外部フォントを使わない（COOP/COEP のため全て自前配信）。
- 利用者の画像・棋譜はブラウザ内（IndexedDB/localStorage）にのみ保存し、外部へ送信しない。
- 評価関数ファイルは、再配布許諾を確認するまでリポジトリに入れない（初版は駒得版エンジン）。
- エンジンが動かない端末でも、自作αβで遊べること。

## 子ども向け UI のルール
- 画面の文言はやさしい日本語。漢字には `<ruby>` でふりがな（`furigana.ts` のヘルパーを使う）。
- タップ領域は 44px 以上。誤操作しやすい操作（投了・新規対局）は確認ダイアログ。
- 反則や失敗は責めない言い方で、理由を説明する。

## コーディング
- TypeScript strict。ESLint + Prettier。フレームワークは使わない（素の DOM + SVG）。
- 1 ファイル 400 行を超えたら分割を検討。

## テスト・コマンド
- 開発サーバ: `npm run dev` / ビルド: `npm run build` / プレビュー: `npm run preview`
- テスト: `npm test`（Vitest）、`npm run e2e`（Playwright）
- 自己対局: `npm run selfplay -- --black 2 --white 1 --games 50`
- ルール照合: `python tools/rules_crosscheck.py`（cshogi と合法手を突き合わせ）
- 変更後は `npm test` を全て合格させてからコミット。ルール修正には必ずテスト追加。

## 進め方
- `docs/指示書.md` のフェーズ順に実装。完了条件を満たしたらコミット「フェーズN: 内容」。
