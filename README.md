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

## 実装状況

### ページ

| ページ | パス | 状況 |
|---|---|---|
| トップ（まとめ一覧） | `/` | ✓ |
| まとめ詳細 | `/matome/?id={naddr}` | ✓ |
| ユーザーページ | `/user/?id={npub}` | ✓ |
| 新規作成 | `/new` | ✓ |
| まとめ編集 | `/edit/{naddr}` | ✓ |
| 設定 | `/settings` | プレースホルダのみ |
| 使い方ガイド | `/guide` | プレースホルダのみ |

### 機能

| 機能 | 状況 |
|---|---|
| まとめ一覧（新着） | ✓ |
| まとめ一覧（話題順） | 未実装 |
| まとめ一覧（フォロータブ） | コンポーネントはあるが未統合 |
| まとめ詳細閲覧 | ✓ |
| まとめ作成・編集 | ✓ |
| まとめ削除（NIP-09） | ✓ |
| ユーザーページ | ✓ |
| nosli互換まとめの読み込み | ✓ |
| ログイン（nostr-login） | ✓ |
| 下書き保存（localStorage） | 未実装（離脱前の警告のみ） |
| シェア（Nos / X / コピー） | ✓ |
| シェアメニュー（naddr・JSONコピー） | ✓ |

## Nostr 仕様

| kind | 用途 |
|---|---|
| 30023 | まとめ本体（NIP-23） |
| 5 | 削除（NIP-09） |
| 7 | ふぁぼ（リアクション） |
| 1 | お知らせ投稿 |
| 10002 | ユーザーリレー設定（NIP-65） |

- **d-tag**: `matometr-{ULID}`
- **必須タグ**: `d`, `title`, `summary`, `published_at`, `t:matometr`, `client:matometr`

## デフォルトリレー

**日本向け**
- `wss://relay-jp.nostr.wirednet.jp/`
- `wss://yabu.me/`
- `wss://r.kojira.io/`
- `wss://nrelay-jp.c-stellar.net/`

**グローバル**
- `wss://nos.lol/`
- `wss://relay.damus.io/`

## 参考

- [nosli](https://github.com/akiomik/nosli) — 元ネタ
- [nostr-login](https://github.com/nostrband/nostr-login)
- [nostr-share-component](https://github.com/TsukemonoGit/nostr-share-component)
- 詳細仕様 → [doc/matometr-spec.md](doc/matometr-spec.md)
