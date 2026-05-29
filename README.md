# まとめたー（matometr）

Nostr 投稿のキュレーションサイト。投稿を集めて、コメント・見出しを添えて公開できる。

## 概要

- 閲覧はログイン不要、作成・編集・削除はログイン必須
- ログイン：[nostr-login](https://github.com/nostrband/nostr-login) 経由
- デプロイ：GitHub Pages（SvelteKit + adapter-static）

## 技術スタック

| 項目 | 内容 |
|---|---|
| フレームワーク | SvelteKit |
| スタイル | Tailwind CSS |
| Nostr | nostr-tools, rx-nostr |
| ホスティング | GitHub Pages |

## 開発

```bash
npm install
npm run dev       # 開発サーバー起動
npm run build     # ビルド
npm run preview   # ビルド結果を確認
npm run check     # 型チェック
npm run format    # フォーマット
```

## Nostr 仕様

- **kind**: `30023`（NIP-23 Long-form Content）
- **d-tag**: `matometr-{ULID}`
- **必須タグ**: `d`, `title`, `summary`, `published_at`, `t:matometr`, `client:matometr`
- **削除**: NIP-09（kind:5）
- **下書き**: localStorage（将来 NIP-37 検討）

## ページ構成

| ページ | パス |
|---|---|
| トップ（まとめ一覧） | `/` |
| まとめ詳細 | `/matome/{naddr1}` |
| ユーザーページ | `/user/{npub}` |
| 新規作成 | `/new` |
| まとめ編集 | `/edit/{naddr1}` |

## 参考

- [nosli](https://github.com/akiomik/nosli) — 元ネタ
- [nostr-login](https://github.com/nostrband/nostr-login)
- [nostr-share-component](https://github.com/TsukemonoGit/nostr-share-component)
- 詳細仕様 → [doc/matometr-spec.md](doc/matometr-spec.md)
