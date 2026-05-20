# まとめたー（matometr）仕様書

Nostrのキュレーションサイト。投稿を集めて、コメント・見出しを添えて公開できる。

---

## サービス概要

- **サイト名**：まとめたー（matometr）
- **コンセプト**：Nostr投稿のキュレーションを、初心者にも親しみやすいUIで
- **対象ユーザー**：閲覧者はNostr未経験者OK、作成者はNostrユーザー
- **デプロイ**：GitHub Pages（SvelteKit + adapter-static）

## 機能スコープ

### MVPに含む

- まとめ一覧（新着・話題・フォロー中タブ）
- まとめ詳細閲覧
- まとめ作成・編集（要ログイン）
- まとめ削除（NIP-09）
- ユーザーページ（作成したまとめ一覧）
- nosli互換まとめの読み込み（編集はnosliに飛ばす）
- ログイン（nostr-login経由）
- 下書き保存（localStorage）
- シェア機能（Nos／X／コピー／メニュー）

### MVPに含まない（将来検討）

- いいね機能
- 通知
- 検索（タグ・キーワード）
- フォロー機能
- 下書きのNostr上保存（NIP-37）
- メタデータリレー対応
- ダークモードのトグル切替（MVPはOS設定追従のみ）

## 公開ポリシー

- **閲覧**：ログイン不要、誰でも見られる
- **シェア**：ログイン不要
- **作成・編集・削除**：ログイン必須

---

## デザイン

### カラー

| 用途 | ライト | ダーク |
|---|---|---|
| アクセント | `#f97316` | `#fb923c` |
| アクセント濃 | `#ea580c` | `#f97316` |
| 背景 | `#fff8f4` | `#1c1917` |
| サーフェス（カード） | `#ffffff` | `#292524` |
| 文字 | `#1c1917` | `#fafaf9` |
| 文字（薄） | `#57534e` | `#d6d3d1` |
| 文字（一番薄） | `#a8a29e` | `#78716c` |
| ボーダー | `#f0e8e0` | `#44403c` |

### フォント

- **見出し・UI** : `M PLUS Rounded 1c` (weight: 500/700/800)
- **本文** : `Noto Sans JP` (weight: 400/500/700)
- **Nosボタン** : `Mochiy Pop One`

### ダークモード

- MVPは `prefers-color-scheme` で自動切替
- 将来的にヘッダーにトグル追加可

### コンポーネント

- カードの角丸：`16px`
- ボタンの角丸：`9999px`（pill型）
- カードの枠線：`1.5px solid var(--border)`

---

## URL設計

| ページ | パス |
|---|---|
| トップ（まとめ一覧） | `/` |
| まとめ詳細 | `/matome/{naddr1}` |
| ユーザーページ | `/user/{npub}` |
| 新規作成 | `/new` |
| まとめ編集 | `/edit/{naddr1}` |
| ログイン | `/login` |
| 設定 | `/settings` |
| 使い方ガイド | `/guide` |

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
    ["client", "matometr"],
    ["e", "<eventId1>", "<relayHint>", "mention"],
    ["e", "<eventId2>", "<relayHint>", "mention"]
  ],
  "content": "# タイトル\n\n説明文\n\n## 見出し\n\nnostr:nevent1abc...\n\n> まとめ主のコメント\n\nnostr:nevent1def...\n\n> もうひとつのコメント"
}
```

### 仕様詳細

| 項目 | 仕様 |
|---|---|
| kind | `30023`（NIP-23 Long-form Content） |
| 必須タグ | `d`, `title`, `summary`, `published_at`, `t: matometr` |
| eタグ | `["e", eventId, relayHint, "mention"]`（引用投稿ごとに1件、NIP準拠） |
| t:nosliタグ | **なし**（nosliの取得フィルタが `#t:nosli` のため、付けなければ干渉しない） |
| 投稿引用 | content内に `nostr:nevent1...` 単独行で記述 |
| コメント | content内に `> ` で始まる引用ブロック |
| 見出し | content内に `## ` |
| d-tag | `matometr-{ULID}` |
| clientタグ | `["client", "matometr"]`（NIP-89） |
| 削除 | NIP-09（kind:5、`["e", id], ["k", "30023"]`） |

### コンテンツ記法（マークダウン）

```markdown
## 見出し

通常の段落テキスト。

nostr:nevent1abc...

> まとめ主のひとこと
> 改行も自由

nostr:nevent1def...

> 次の投稿へのコメント
```

### nosliとの関係

- **書き込み**：t:nosliタグはつけない → nosliの取得フィルタ（`#t:['nosli']`）に引っかからない → コメント保護
- **eタグは付ける**：nosliの編集可否は pubkey 一致のみで判定しており、eタグの有無は無関係（調査済み）
- **読み込み**：nosliのまとめ（t:nosliあり、eタグあり）も読める → 投稿リストとして表示、編集はnosliに飛ばす

---

## リレー

### 日本向けデフォルト

- `wss://relay-jp.nostr.wirednet.jp/`
- `wss://yabu.me/`
- `wss://r.kojira.io/`
- `wss://nrelay-jp.c-stellar.net/`

### グローバルデフォルト

- `wss://nos.lol/`
- `wss://relay.damus.io/`

### ログイン後

NIP-65（kind:10002）を読み込み、ユーザーのread/writeリレーを使用。未設定の場合はデフォルトにフォールバック。

---

## ログイン

### nostr-login（[nostrband/nostr-login](https://github.com/nostrband/nostr-login)）

```html
<script src="https://www.unpkg.com/nostr-login@latest/dist/unpkg.js"
  data-no-banner="true"
  data-theme="default"
></script>
```

`data-dark-mode` はサイトのモードに応じて動的に切り替え。

### ラッパーモーダル

nostr-loginのモーダルは英語UI。初心者向けに、自前の日本語ラッパーモーダルを経由する：

1. ヘッダーの「ログイン」ボタン → 日本語ラッパーモーダル表示
2. 「Nostrってなに？」の説明 + 「既存ユーザー」「新規登録」の選択肢
3. 選択後、`nlLaunch` イベントを発火してnostr-loginを起動

```js
document.dispatchEvent(new CustomEvent('nlLaunch', { 
  detail: 'welcome-login'  // または 'welcome-signup'
}));
```

---

## シェア機能

詳細画面の統計欄に4つのボタンを配置：

| ボタン | アイコン | 機能 |
|---|---|---|
| Nos | "Nos" (Mochiy Pop One) | nostr-share-componentでNostrクライアント選択 |
| X | Xロゴ | X（旧Twitter）の投稿画面を開く |
| コピー | コピーアイコン | タイトル＋URLをクリップボードへ |
| 縦3点メニュー | ⋮ | サブメニュー展開 |

全部 **オレンジ背景＋白アイコン** で統一。Xロゴは白塗りで規約クリア。

### 縦3点メニューの中身

- nevent1をコピー
- naddr1をコピー
- JSONを表示

### nostr-share-component

```html
<script src="https://cdn.jsdelivr.net/npm/@konemono/nostr-share-component@latest/dist/nostr-share-component.min.js"></script>
<nostr-share data-text="まとめタイトル https://matometr/matome/...">
  <span style="font-family:'Mochiy Pop One';color:white;">Nos</span>
</nostr-share>
```

---

## 下書き

MVPはlocalStorage：

```js
const draftKey = 'matometr-draft-{ULID}';
localStorage.setItem(draftKey, JSON.stringify({
  title, summary, blocks, updated_at
}));
```

将来的にNIP-37（kind:31234、NIP-44暗号化）対応を検討。

---

## ホスティング

- **デプロイ**：GitHub Pages
- **フレームワーク**：SvelteKit + `adapter-static`
- **ドメイン**：未定（GitHub Pagesデフォルトでスタート）

---

## ライセンス

未定（参考：nosliはApache-2.0）

---

## 参考リポジトリ

- **nosli**：https://github.com/akiomik/nosli
- **nosli魔改造版**：https://github.com/koteitan/nosli
- **nostr-login**：https://github.com/nostrband/nostr-login
- **nostr-share-component**：https://github.com/TsukemonoGit/nostr-share-component
- **nostr-tools**：https://github.com/nbd-wtf/nostr-tools
