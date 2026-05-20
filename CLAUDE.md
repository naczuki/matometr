# まとめたー（matometr）

Nostrのキュレーションサイト。投稿を集めて、コメント・見出しを添えて公開できる。

## 詳細仕様

完全な仕様は [`docs/matometr-spec.md`](./docs/matometr-spec.md) を参照。
公開フォーマット・URL設計・カラー・タグ仕様などはすべてこちらに書かれている。
**実装前にこのファイルを必ず読むこと。**

## 技術スタック

- **フレームワーク**：SvelteKit 2.x
- **アダプター**：`@sveltejs/adapter-static`
- **言語**：TypeScript（厳密モード）
- **スタイル**：Tailwind CSS + CSS変数（カラーテーマ用）
- **Nostrライブラリ**：`nostr-tools`（イベント署名・bech32エンコード）、`rx-nostr`（リレー接続）
- **ログイン**：`nostr-login`（[nostrband/nostr-login](https://github.com/nostrband/nostr-login)）
- **シェアコンポーネント**：`@konemono/nostr-share-component`
- **ID生成**：`ulid`
- **デプロイ**：GitHub Pages（`.github/workflows/deploy.yml`で自動）

## ディレクトリ構成

```
matometr/
├─ src/
│  ├─ lib/
│  │  ├─ components/      # 再利用可能なコンポーネント
│  │  ├─ entities/        # ドメインモデル（Matome, Note等）
│  │  ├─ services/        # NostrClient等の外部連携
│  │  ├─ stores/          # Svelteストア（リレー、ユーザー等）
│  │  └─ utils/           # ヘルパー関数
│  ├─ routes/
│  │  ├─ +page.svelte             # トップ（まとめ一覧）
│  │  ├─ matome/[naddr]/+page.svelte    # まとめ詳細
│  │  ├─ user/[npub]/+page.svelte       # ユーザーページ
│  │  ├─ new/+page.svelte               # 新規作成
│  │  ├─ edit/[naddr]/+page.svelte      # 編集
│  │  ├─ guide/+page.svelte             # 使い方ガイド
│  │  └─ settings/+page.svelte          # 設定
│  ├─ app.html
│  └─ app.css            # CSS変数定義（ライト/ダーク）
├─ static/                # 画像・アイコン等
├─ docs/
│  └─ matometr-spec.md   # 完全仕様書
├─ svelte.config.js
├─ vite.config.ts
├─ tsconfig.json
└─ CLAUDE.md             # このファイル
```

## コーディング規約

### TypeScript
- **strict mode必須**（`tsconfig.json`で有効化）
- `any` 禁止。どうしても必要なら `unknown` を使う
- 関数の戻り値型は明示
- インポートは `import type` を適切に使い分け

### Svelte
- コンポーネントは PascalCase（`MatomeCard.svelte`）
- ストアは camelCase（`currentUser.ts`）
- イベントハンドラは `on:click={handleClick}` 形式
- スクリプト内のリアクティブ宣言は `$:` を活用

### 命名
- ファイル名はケバブケース or PascalCase（コンポーネントのみ）
- 関数・変数は camelCase
- 定数は SCREAMING_SNAKE_CASE
- Nostr関連の変数：`pubkey`、`eventId`、`naddr` など nostr-tools の慣例に従う

### フォーマット
- Prettier（`.prettierrc` 設定済み）
- インデント：スペース2つ
- セミコロン：あり
- シングルクォート

### スタイル
- カラーは必ずCSS変数経由（`var(--accent)` など）。直接hex指定禁止
- ダークモード対応：`prefers-color-scheme` で自動切替（MVPはトグルなし）

## Nostrイベント仕様（最重要）

詳しくは [`docs/matometr-spec.md`](./docs/matometr-spec.md) 参照。実装時の要点：

- **kind**: `30023`（NIP-23 Long-form Content）
- **eタグは付けない**（nosli互換性を意図的に切る）
- **`t: nosli` タグも付けない**（nosli側で編集されてコメントが消えるのを防ぐ）
- **`t: matometr` タグは必須**
- **投稿引用は content 内に `nostr:nevent1...` 単独行**で書く
- **コメントは `> ` 引用ブロック**、**見出しは `## `**
- **d-tagは `matometr-{ULID}`**

## Git / コミット規約

- **ブランチ運用**：`main` が常にデプロイ可能な状態。機能追加は `feat/xxx`、修正は `fix/xxx`
- **コミットメッセージ**：[Conventional Commits](https://www.conventionalcommits.org/ja/) 形式
  - `feat:` 新機能
  - `fix:` バグ修正
  - `refactor:` リファクタリング
  - `docs:` ドキュメント
  - `style:` フォーマットのみ
  - `chore:` その他
- コメント本文は日本語

## デプロイ

`main` ブランチへのpushで GitHub Actions が走って自動デプロイ。

手動でビルド確認：
```bash
npm run build         # ビルド
npm run preview       # ローカルプレビュー
```

## やってほしくないこと

- **`any` 型を使わない**
- **`eタグ` を付けてまとめを公開しない**（仕様で禁止）
- **`t: nosli` タグを付けない**
- **秘密鍵（nsec）を直接扱うコードを書かない**（必ずnostr-login経由で `window.nostr.signEvent()` を使う）
- **localStorage以外の場所に下書きを保存しない**（MVPの範囲）
- **メタデータリレーへの接続コードを追加しない**（MVPで不要と判断済）
- **コメントアウトされたコードを残さない**（消すかコミット）
- **コミット前にビルドエラー・型エラーを残さない**

## 開発時の便利情報

### よく使うコマンド
```bash
npm run dev           # 開発サーバー起動（http://localhost:5173）
npm run build         # 本番ビルド
npm run check         # 型チェック
npm run lint          # ESLint + Prettier check
npm run format        # Prettier 実行
```

### 参考リポジトリ
- **nosli**（仕様の元）：https://github.com/akiomik/nosli
- **nosli魔改造版**（拡張機能の参考）：https://github.com/koteitan/nosli
- **nostter**（リレー周りの参考）：https://github.com/SnowCait/nostter

これらのコードは参考にしてOK。ライセンスはApache-2.0 / MIT等。

### Nostr仕様書
- NIP-23（Long-form Content）：https://github.com/nostr-protocol/nips/blob/master/23.md
- NIP-19（bech32 IDs）：https://github.com/nostr-protocol/nips/blob/master/19.md
- NIP-27（メンション）：https://github.com/nostr-protocol/nips/blob/master/27.md
- NIP-65（リレーリスト）：https://github.com/nostr-protocol/nips/blob/master/65.md
- NIP-09（削除）：https://github.com/nostr-protocol/nips/blob/master/09.md

## レビュー時の観点

PRやコード提案を出すとき、Claude自身が確認すべきこと：

- [ ] 仕様書（`docs/matometr-spec.md`）に違反していないか
- [ ] eタグ・`t: nosli`タグを付けていないか
- [ ] 型エラーがないか
- [ ] ライト/ダーク両方で見た目が崩れないか
- [ ] モバイル幅（375px以下）で破綻していないか
- [ ] アクセシビリティ（aria属性、フォーカス管理）に配慮しているか
