# まとめたー（matometr）

Nostr のキュレーションサイト。投稿（ノート）を集めて、見出し・コメントを添えて 1 本の「まとめ」として公開できる。閲覧はログイン不要、作成・編集・リアクションには Nostr アカウントでのログインが必要。

- 本番：https://naczuki.github.io/matometr/
- 詳細仕様：[`doc/matometr-spec.md`](doc/matometr-spec.md)

## 主な機能

- **まとめ一覧**（新着順）：matometr 製（`#t: matometr`）と nosli 製（`#t: nosli`）のまとめをマージして表示
- **まとめ詳細**：見出し・コメント・引用ノートをレイアウト復元して表示。リアクション（ふぁぼ）数を集計表示
- **まとめ作成 / 編集**（要ログイン）：ブロックエディタでノート・見出し・コメントを並べて作成。ドラッグ＆ドロップで並べ替え
  - 投稿の追加は **ID 貼り付け / フォロー中ユーザーの投稿 / 自分のお気に入り（リアクション）/ キーワード検索** の 4 タブから選択
  - 公開・更新後に Nostr へ **お知らせ（kind:1）** を投稿できる
- **リアクション**：まとめに「ふぁぼ」（kind:7 / `+`）を送れる。一覧・詳細・ユーザーページで集計表示
- **まとめ削除**：NIP-09（kind:5）
- **ユーザーページ**：作成したまとめ一覧 ／ リアクションしたまとめ一覧
- **nosli 互換**：nosli 製まとめの読み込み表示（編集は nosli 側へ誘導）
- **シェア**：Nos（Nostr クライアント選択）/ X / URL コピー / naddr コピー / Raw JSON 表示
- **ログイン**：[nostr-login](https://github.com/nostrband/nostr-login)（`@konemono/nostr-login`）経由。初心者向けの日本語ラッパーモーダルを用意

## 技術スタック

- [SvelteKit](https://kit.svelte.dev/) 2 + Svelte 4 + TypeScript
- [`@sveltejs/adapter-static`](https://kit.svelte.dev/docs/adapter-static)（静的書き出し、GitHub Pages へデプロイ）
- [Tailwind CSS](https://tailwindcss.com/)
- Nostr 関連：[`nostr-tools`](https://github.com/nbd-wtf/nostr-tools) / [`rx-nostr`](https://github.com/penpenpng/rx-nostr) / [`@konemono/nostr-login`](https://www.npmjs.com/package/@konemono/nostr-login) / [`@konemono/nostr-share-component`](https://www.npmjs.com/package/@konemono/nostr-share-component)
- その他：`marked`（Markdown）/ `dompurify`（サニタイズ）/ `ulid`（d-tag 生成）/ `sortablejs`・`svelte-dnd-action`（並べ替え）

## 開発

```bash
npm install      # 依存をインストール
npm run dev      # 開発サーバー（Vite）
npm run build    # 静的ビルド（build/ に出力）
npm run preview  # ビルド結果をプレビュー
npm run check    # svelte-check（型チェック）
npm run lint     # eslint + prettier --check
npm run format   # prettier --write
```

Node.js 20 系を想定。

### デバッグ用フラグ

開発時に `localStorage.setItem('debug:dryrun', '1')` を設定すると、リレーへの送信を行わずに送信予定イベントをコンソール出力する（dry-run）。

## デプロイ

`main` への push で [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) が走り、GitHub Pages へ自動デプロイされる。ビルド時に `BASE_PATH=/matometr` を設定。`adapter-static` の `fallback: 404.html` により、SPA ルーティングのフォールバックを行う。

## ディレクトリ構成

```
src/
  routes/                 ページ（SvelteKit ルーティング）
    +page.svelte          トップ（まとめ一覧）
    matome/               まとめ詳細（/matome/?id=<naddr> ＋ 旧 /matome/<naddr> フォールバック）
    user/                 ユーザーページ（/user/?id=<npub> ＋ 旧 /user/<npub> フォールバック）
    new/ edit/            まとめ作成・編集
    guide/ settings/      使い方ガイド・設定（実装予定）
  lib/
    components/           UI コンポーネント
    services/             Nostr 送受信（nostrCore / nostrFetch / nostrPublish / NostrClient）
    stores/               Svelte ストア（auth / relays / profiles / favs ほか）
    entities/Matome.ts    まとめイベントのパース・モデル
    utils/                ユーティリティ（markdown / nostr / time ほか）
doc/matometr-spec.md      仕様書
docs/mockups/             デザインモックアップ（HTML）
```

## ライセンス

未定（参考：nosli は Apache-2.0）
