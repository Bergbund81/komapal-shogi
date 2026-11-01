# KomaPal Shogi（コマパル しょうぎ）

> 🚧 **開発中です。** 機能・見た目・CPU の強さは、これからも変わります。

将棋を始めたばかりの子ども向けの、CPU 対戦将棋です。ブラウザだけで動き、サーバーは使いません。
思考も遊ぶ人の端末の中で行い、棋譜や画像が外部へ送られることはありません。

**遊ぶ:** <https://bergbund81.github.io/komapal-shogi/>

`main` ブランチに push すると、GitHub Actions が自動でビルドして上のURLを更新します。

## いまできること

- 10 段階の CPU（はじめて・れんしゅう・ちょうせん）との対戦
- やねうら王（WebAssembly 版）と自作の探索による思考

## 開発方法

Node.js 24 が必要です。

```bash
npm ci
npm run dev      # 開発サーバ
npm test         # テスト（Vitest）
npm run lint     # ESLint
npm run build    # 型チェック + ビルド（dist/）
```

設計は [docs/設計書.md](docs/設計書.md) を参照してください。

## ライセンス

[GPL-3.0](LICENSE)

使用しているもの:

- [shogiops](https://github.com/WandererXII/shogiops)（GPL-3.0）— 将棋のルール
- [やねうら王](https://github.com/yaneurao/YaneuraOu) WebAssembly 版（[@mizarjp/yaneuraou.material9](https://www.npmjs.com/package/@mizarjp/yaneuraou.material9)、GPL-3.0）— 強い CPU
- [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker)（MIT）— GitHub Pages でエンジンを動かすための補助

## TODO（公開前に仕上げる）

- スクリーンショット
- アバターの差し替え方
- Windows Chrome・iPad Safari・Android Chrome での動作確認手順
