# まとめたー（matometr）仕様書

Nostrのキュレーションサイト。投稿を集めて、コメント・見出しを添えて公開できる。

---

## サービス概要

- **サイト名**：まとめたー（matometr）
- **コンセプト**：Nostr投稿のキュレーションを、初心者にも親しみやすいUIで
- **対象ユーザー**：閲覧者はNostr未経験者OK、作成者はNostrユーザー
- **デプロイ**：GitHub Pages（SvelteKit + adapter-static）

## 機能スコープ

### 実装済み

- まとめ一覧（新着順、matometr製とnosli製をマージ表示）
- まとめ詳細閲覧（レイアウト復元・リアクション数表示）
- まとめ作成・編集（要ログイン、ブロックエディタ＋D&D並べ替え）
  - 投稿の追加ソース：ID貼り付け／フォロー中ユーザーの投稿／自分のお気に入り（リアクション）／キーワード検索
  - 公開・更新後にNostrへお知らせ（kind:1）投稿
- リアクション（ふぁぼ＝kind:7 `+`）の送信・集計表示
- まとめ削除（NIP-09）
- ユーザーページ（作成したまとめ／リアクションしたまとめの2タブ）
- nosli互換まとめの読み込み（編集はnosliに飛ばす）
- ログイン（nostr-login経由、日本語ラッパーモーダル）
- シェア機能（Nos／X／URLコピー／naddrコピー／JSON表示）
- 編集中の離脱確認（beforeunload）

### 未実装・将来検討

- 一覧の「話題」「フォロー中」タブ（型・UIの枠はあるが「準備中」表示）
- 設定ページ・使い方ガイド（プレースホルダーのみ）
- 通知
- まとめ自体のタグ・キーワード検索（投稿ピッカー内の検索は実装済み）
- 下書き保存（localStorage／NIP-37）
- メタデータリレー対応
- ダークモードのトグル切替（現状はOS設定追従のみ）

## 公開ポリシー

- **閲覧**：ログイン不要、誰でも見られる
- **シェア**：ログイン不要
- **作成・編集・削除・リアクション・お知らせ投稿**：ログイン必須

---

## デザイン

### カラー

| 用途                 | ライト    | ダーク    |
| -------------------- | --------- | --------- |
| アクセント           | `#f97316` | `#fb923c` |
| アクセント濃         | `#ea580c` | `#f97316` |
| 背景                 | `#fff8f4` | `#1c1917` |
| サーフェス（カード） | `#ffffff` | `#292524` |
| 文字                 | `#1c1917` | `#fafaf9` |
| 文字（薄）           | `#57534e` | `#d6d3d1` |
| 文字（一番薄）       | `#a8a29e` | `#78716c` |
| ボーダー             | `#f0e8e0` | `#44403c` |

### フォント

- **見出し・UI** : `M PLUS Rounded 1c` (weight: 400/500/700/800/900)
- **本文** : `Noto Sans JP` (weight: 400/500/700)
- **Nosボタン** : `Mochiy Pop One`
- **ロゴサブ（"matometr"）** : `Josefin Sans` (weight: 600)

### ダークモード

- MVPは `prefers-color-scheme` で自動切替
- 将来的にヘッダーにトグル追加可

### コンポーネント

- カードの角丸：`16px`
- ボタンの角丸：`9999px`（pill型）
- カードの枠線：`1.5px solid var(--border)`

---

## URL設計

| ページ               | パス                                            |
| -------------------- | ----------------------------------------------- |
| トップ（まとめ一覧） | `/`                                             |
| まとめ詳細           | `/matome/?id={naddr1}`                          |
| ユーザーページ       | `/user/?id={npub}`                              |
| 新規作成             | `/new`（既存まとめ複製は `/new?from={naddr1}`） |
| まとめ編集           | `/edit/{naddr1}`                                |
| 設定                 | `/settings`（実装予定）                         |
| 使い方ガイド         | `/guide`（実装予定）                            |

### 静的ホスティングでのルーティング

GitHub Pages（`adapter-static`）向けに、まとめ詳細・ユーザーページは **クエリ文字列方式**（`/matome/?id=` / `/user/?id=`）を採用。`trailingSlash='always'` で `matome/index.html` / `user/index.html` をプリレンダリングし、クローラに OGP を確実に届ける。

旧URL（`/matome/{naddr1}` / `/user/{npub}`）はパスパラメータ用ルートとして残しており、GitHub Pages では 404 になるが `fallback: 404.html` により SPA が起動して描画される（リダイレクトはしない）。シェア用URLは常に新URL（`?id=`）形式で生成する。

ログインは専用ページではなくヘッダーのモーダルで行う。

---

## Nostr仕様

### イベント形式（NIP-23準拠）

```json
{
  "kind": 30023,
  "tags": [
    ["d", "matometr-01HZX8KVKQX9G7M2NRY4B8DQTZ"],
    ["title", "Nostr日本語リレー事情まとめ 2025年版"],
    ["summary", "「リレーって何を選べばいいの？」..."],
    ["published_at", "1716109200"],
    ["t", "matometr"],
    [
      "client",
      "matometr",
      "31990:82b30d30444170e6a8c819e8406e362a3695454a4617894ce2706f3840c6c003:matometr",
      "wss://yabu.me"
    ],
    ["q", "<eventId1>", "<relayHint>", "<authorPubkey1>"],
    ["q", "<eventId2>", "<relayHint>", "<authorPubkey2>"],
    ["p", "<authorPubkey1>", "<relayHint>"],
    ["p", "<authorPubkey2>", "<relayHint>"],
    ["matome_layout", "1", "[[1],[2]]"]
  ],
  "content": "## 見出し\n\nnostr:nevent1abc...\n\nまとめ主のコメント\n\nnostr:nevent1def...\n\nコメント1段落目\n\nコメント2段落目"
}
```

### 仕様詳細

| 項目              | 仕様                                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| kind              | `30023`（NIP-23 Long-form Content）                                                                                                                  |
| 必須タグ          | `d`, `title`, `summary`, `published_at`, `t: matometr`                                                                                               |
| qタグ             | `["q", eventId, relayHint, authorPubkey]`（引用投稿ごとに1件・重複除去）                                                                             |
| pタグ             | `["p", pubkey, relayHint]`（引用先著者ごとに1件・重複除去、NIP-27）                                                                                  |
| t:nosliタグ       | **なし**（nosliの取得フィルタが `#t:nosli` のため、付けなければ干渉しない）                                                                          |
| 投稿引用          | content内に `nostr:nevent1...`（naddr/npub/nprofileも可）単独行で記述                                                                                |
| 見出し            | content内に `## ` で始まる行                                                                                                                         |
| コメント          | 見出し・投稿引用以外の段落（空行区切り）。**`> ` の引用記法は使わず**プレーンな段落として保存                                                        |
| matome_layoutタグ | `["matome_layout", "1", JSON]`。投稿引用の間に連続するテキストブロックの段落数を `number[][]`（run単位）で保持し、編集画面のブロック区切りを復元する |
| d-tag             | `matometr-{ULID}`                                                                                                                                    |
| clientタグ        | `["client", "matometr", "31990:<pubkey>:matometr", "wss://yabu.me"]`（NIP-89）                                                                       |
| 削除              | NIP-09（kind:5、`["e", id], ["k", "30023"]`）                                                                                                        |

### リアクション（NIP-25）

まとめへの「ふぁぼ」は kind:7、content `+` で送信する。

```json
{
  "kind": 7,
  "tags": [
    ["e", "<matomeEventId>"],
    ["p", "<matomeAuthorPubkey>"],
    ["a", "30023:<matomeAuthorPubkey>:<dTag>"],
    ["k", "30023"]
  ],
  "content": "+"
}
```

集計は `#a` フィルタで kind:7 を取得して件数を数える。ユーザーページの「リアクション」タブでは、自分が出した kind:7（`#k: 30023`）から元のまとめを引いて一覧表示する。

### お知らせ投稿（kind:1）

まとめの公開・更新後、任意でNostrへお知らせ（通常ノート）を投稿できる。content中の `#ハッシュタグ` は `t` タグへ展開し、clientタグを付与する。

### コンテンツ記法

content は空行区切りの「チャンク」に分解してパースする。

```markdown
## 見出し

通常のコメント段落。

nostr:nevent1abc...

引用投稿へのコメント。改行も自由。

nostr:nevent1def...

次の投稿へのコメント
```

- `## ` 単独行 → 見出しブロック
- `nostr:nevent1…`／`note1…`／`naddr1…`／`npub1…`／`nprofile1…` 単独行 → 投稿引用ブロック（naddrはまとめカード、npub/nprofileはメンションとして描画）
- それ以外の段落 → コメント／本文ブロック

連続するコメント段落のブロック境界は `matome_layout` タグで復元する。`matome_layout` が無い旧データは、`> ` 引用記法や `#[n]` タグ参照を含むレガシー形式としてパースする。

### nosliとの関係

- **書き込み**：t:nosliタグはつけない → nosliの取得フィルタ（`#t:['nosli']`）に引っかからない → コメント保護
- **引用は q タグ**：matometr の引用投稿は `q`/`p` タグで表現し、`e` タグは付けない（旧形式・nosli 製の `e` タグはパース時のフォールバックとして読む）
- **読み込み**：nosliのまとめ（t:nosliあり、eタグあり）も読める → 投稿リストとして表示、編集はnosliに飛ばす

---

## リレー

### 日本向けデフォルト

- `wss://yabu.me/`
- `wss://r.kojira.io/`
- `wss://nrelay-jp.c-stellar.net/`

### グローバルデフォルト

- `wss://nos.lol/`
- `wss://relay.damus.io/`

### 検索用リレー（NIP-50）

投稿ピッカーのキーワード検索で使用：

- `wss://search.nos.today/`
- `wss://nostr.wine/`
- `wss://cagliostr.compile-error.net/`

### ログイン後

NIP-65（kind:10002）を読み込み、ユーザーのread/writeリレーを使用。未設定の場合はデフォルトにフォールバック。お気に入り（リアクション）一覧などはユーザーのreadリレーを参照する。

---

## ログイン

### nostr-login（[`@konemono/nostr-login`](https://www.npmjs.com/package/@konemono/nostr-login)）

npmパッケージとして導入し、`+layout.svelte` の `onMount` で `init()` を一度だけ呼ぶ。

```js
await init({
  noBanner: true,
  perms: 'sign_event:30023,sign_event:5,sign_event:1,sign_event:7',
  bunkers: 'nsec.app',
  theme: 'default',
  title: 'まとめたーにログイン',
  description: '無料・メールアドレス不要でアカウントを作れます',
  darkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
  onAuth: (npub, options) => {
    /* login/signup/logout を処理 */
  }
});
```

要求パーミッションは matometr が署名する kind（30023 まとめ / 5 削除 / 1 お知らせ / 7 リアクション）に対応。

### ラッパーモーダル

nostr-loginのモーダルは英語UI。初心者向けに、自前の日本語ラッパーモーダル（`LoginModal`）を経由する：

1. ヘッダーの「ログイン」ボタン → 日本語ラッパーモーダル表示
2. 「Nostrってなに？」の説明 + 「既存ユーザー」「新規登録」の選択肢
3. 選択後、`launch(screen)` を呼んでnostr-loginを起動

---

## シェア機能

詳細画面の統計欄に4つのボタンを配置：

| ボタン        | アイコン               | 機能                                         |
| ------------- | ---------------------- | -------------------------------------------- |
| Nos           | "Nos" (Mochiy Pop One) | nostr-share-componentでNostrクライアント選択 |
| X             | Xロゴ                  | X（旧Twitter）の投稿画面を開く               |
| コピー        | コピーアイコン         | タイトル＋URLをクリップボードへ              |
| 縦3点メニュー | ⋮                      | サブメニュー展開                             |

全部 **オレンジ背景＋白アイコン** で統一。Xロゴは白塗りで規約クリア。

### 共有テキストのハッシュタグ

- **Nos**（Nostr向け）：タイトル末尾に `#まとめたー` を付与（`#nostr` は付けない）
- **X / コピー**（Nostr外向け）：タイトル末尾に `#まとめたー #nostr` を付与

### 縦3点メニューの中身

- naddr1をコピー
- Raw EventのJSONを表示

### nostr-share-component

```html
<script src="https://cdn.jsdelivr.net/npm/@konemono/nostr-share-component@latest/dist/nostr-share-component.min.js"></script>
<nostr-share
  data-text="まとめタイトル #まとめたー
nostr:naddr1..."
>
  <span style="font-family:'Mochiy Pop One';color:white;">Nos</span>
</nostr-share>
```

---

## 下書き・離脱防止

下書きの永続保存（localStorage / NIP-37）は**未実装**。

現状は、作成・編集画面で未保存の変更があるときに `beforeunload` で離脱確認ダイアログを出すのみ。既存まとめの複製は `/new?from={naddr}` で元イベントを読み込んで編集を開始する。

将来的にlocalStorage下書き、さらにNIP-37（kind:31234、NIP-44暗号化）対応を検討。

---

## ホスティング

- **デプロイ**：GitHub Pages（`main` への push で GitHub Actions が自動デプロイ）
- **フレームワーク**：SvelteKit 2 + Svelte 4 + TypeScript、`adapter-static`（`fallback: 404.html`）
- **スタイル**：Tailwind CSS
- **Nostr**：`nostr-tools` / `rx-nostr` / `@konemono/nostr-login` / `@konemono/nostr-share-component`
- **ベースパス**：ビルド時に `BASE_PATH=/matometr` を設定
- **URL**：https://naczuki.github.io/matometr/（独自ドメインは未定）

---

## ライセンス

未定（参考：nosliはApache-2.0）

---

## 参考リポジトリ

- **nosli**：https://github.com/akiomik/nosli
- **nosli魔改造版**：https://github.com/koteitan/nosli
- **nostr-login**：https://github.com/nostrband/nostr-login（導入は fork の `@konemono/nostr-login`）
- **nostr-share-component**：https://github.com/TsukemonoGit/nostr-share-component（`@konemono/nostr-share-component`）
- **nostr-tools**：https://github.com/nbd-wtf/nostr-tools
- **rx-nostr**：https://github.com/penpenpng/rx-nostr
