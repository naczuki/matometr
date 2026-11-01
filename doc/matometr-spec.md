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
- 投稿・ユーザーを開く外部クライアントの選択設定（現状は nostter 固定。設定メニューの配置は未定）

## 公開ポリシー

- **閲覧**：ログイン不要、誰でも見られる
- **シェア**：ログイン不要
- **作成・編集・削除**：ログイン必須

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

| ページ               | パス               |
| -------------------- | ------------------ |
| トップ（まとめ一覧） | `/`                |
| まとめ詳細           | `/matome/{naddr1}` |
| ユーザーページ       | `/user/{npub}`     |
| 新規作成             | `/new`             |
| まとめ編集           | `/edit/{naddr1}`   |
| ログイン             | `/login`           |
| 設定                 | `/settings`        |
| 使い方ガイド         | `/guide`           |

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
    ["q", "<eventId1>", "<relayHint>", "<authorPubkey1>"],
    ["q", "<eventId2>", "<relayHint>", "<authorPubkey2>"],
    ["p", "<authorPubkey1>", "<relayHint>"],
    ["p", "<authorPubkey2>", "<relayHint>"]
  ],
  "content": "# タイトル\n\n説明文\n\n## 見出し\n\nnostr:nevent1abc...\n\n> まとめ主のコメント\n\nnostr:nevent1def...\n\n> もうひとつのコメント"
}
```

### 仕様詳細

| 項目        | 仕様                                                                        |
| ----------- | --------------------------------------------------------------------------- |
| kind        | `30023`（NIP-23 Long-form Content）                                         |
| 必須タグ    | `d`, `title`, `summary`, `published_at`, `t: matometr`                      |
| qタグ       | `["q", eventId, relayHint, authorPubkey]`（引用投稿ごとに1件・重複除去）    |
| pタグ       | `["p", pubkey, relayHint]`（引用先著者ごとに1件・重複除去、NIP-27）         |
| t:nosliタグ | **なし**（nosliの取得フィルタが `#t:nosli` のため、付けなければ干渉しない） |
| 投稿引用    | content内に `nostr:nevent1...` 単独行で記述                                 |
| コメント    | content内に `> ` で始まる引用ブロック                                       |
| 見出し      | content内に `## `                                                           |
| d-tag       | `matometr-{ULID}`                                                           |
| clientタグ  | `["client", "matometr"]`（NIP-89）                                          |
| 削除        | NIP-09（kind:5、`["e", id], ["a", "30023:{pubkey}:{d}"], ["k", "30023"]`）  |

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

### グローバルデフォルト

- `wss://nos.lol/`
- `wss://relay.primal.net/`

### ログイン後

NIP-65（kind:10002）を読み込み、ユーザーのread/writeリレーを使用。未設定の場合はデフォルトにフォールバック。

- **候補の取得**：フォロー中・お気に入りタブはユーザーの read リレーから取得する
- **ID 貼り付け**：デフォルト＋nevent のリレーヒントに無ければ、投稿の作者の write リレー（nevent に作者がある場合）→ ユーザーの read リレー の順に探す
- **保存・編集・削除・ふぁぼ・告知投稿**：デフォルトに加えて、ユーザーの write リレーにも送る

### リレーヒント

- **まとめに書き込む nevent**：投稿を実際に受け取ったリレーをヒントにする。全文検索用リレーだけで見つかった投稿はヒントなし（id 指定の取得に応じない検索リレーがあるため）
- **表示時**：まずデフォルトで探し、見つからなければ nevent のリレーヒントに問い合わせる（まとめ詳細・編集画面のプレビューとも）

---

## ログイン

### nostr-login（[nostrband/nostr-login](https://github.com/nostrband/nostr-login)）

```html
<script
  src="https://www.unpkg.com/nostr-login@latest/dist/unpkg.js"
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
document.dispatchEvent(
  new CustomEvent('nlLaunch', {
    detail: 'welcome-login' // または 'welcome-signup'
  })
);
```

---

## シェア機能

詳細画面の統計欄に4つのボタンを配置：

| ボタン        | アイコン               | 機能                                        |
| ------------- | ---------------------- | ------------------------------------------- |
| Nos           | "Nos" (Mochiy Pop One) | シェア先のNostrクライアントを選ぶダイアログ |
| X             | Xロゴ                  | X（旧Twitter）の投稿画面を開く              |
| コピー        | コピーアイコン         | タイトル＋URLをクリップボードへ             |
| 縦3点メニュー | ⋮                      | サブメニュー展開                            |

全部 **オレンジ背景＋白アイコン** で統一。Xロゴは白塗りで規約クリア。

### 共有テキストのハッシュタグ

- **Nos**（Nostr向け）：タイトル末尾に `#まとめたー` を付与（`#nostr` は付けない）
- **X / コピー**（Nostr外向け）：タイトル末尾に `#まとめたー #nostr` を付与

### 縦3点メニューの中身

- nevent1をコピー
- naddr1をコピー
- JSONを表示

### Nos ボタンのシェア先

以前は nostr-share-component を使っていたが、シェア先を設定で編集できるよう独自のダイアログ（`ShareDialog.svelte`）に置き換えた。
既定のシェア先は nostr-share-component の一覧（eHagaki / nokakoi / Nos Haiku / nostter / Lumilumi）と同じ。

## 設定（/settings）

ヘッダーのユーザーメニュー「設定」から開く。一番上が同期のトグル、その下に各項目、一番下に「保存」ボタン。項目の編集は下書きに入れ、「保存」を押したときに localStorage（キー `matometr:client-links`）へ反映する。保存していない変更があるままページを離れようとすると確認する。

| 項目                       | URL のプレースホルダ                                                     |
| -------------------------- | ------------------------------------------------------------------------ |
| シェア先（Nos ボタン）     | `{text}`：シェアする文章（URL エンコード済み）                           |
| 投稿メニューの「○○で開く」 | `{nevent}`（nevent1…）/ `{note}`（note1…）/ `{id}`（16 進のイベント ID） |

- クライアント名・URL の追加・編集・削除、メニューへの表示・非表示（チェックボックス）ができる
- 「デフォルトに戻す」で項目ごとに既定値へ戻す（保存していた設定を消す）
- 一度も変更していない項目は保存せず、既定値を使う（既定値の更新がそのまま反映される）
- URL は `https://` / `http://` で始まり、プレースホルダを含むものだけメニューに出す
- 「○○で開く」だけは `nostr:` で始まる URL（NIP-21、例：`nostr:{nevent}`）も使える。端末の Nostr アプリで開く（新しいタブは開かない）。既定に「アプリ」（`nostr:{nevent}`、表示オフ）を入れてある
- シェア先のアイコン：既定のアイコン（クライアントと同じサイトのときだけ）→ `/api/favicon?url=<ページ URL>` の順に試し、だめなら頭文字を出す
  - `/api/favicon`（Cloudflare Workers）はページを読んで `<link rel="icon">`（無ければ apple-touch-icon）を探し、見つかったアイコンへリダイレクトする。ページ → サイトのトップ → `/favicon.ico` の順に試し、画像でない（HTML を返す）ものは使わない。画像は中継しない
  - 結果はブラウザと Cloudflare の Cache API にキャッシュ（見つかった：7 日、見つからない：1 日）

### 他の端末との同期

設定画面の一番上のトグル「他の端末と同期する」（ログイン中のみ・アカウントごと・端末ごと）で切り替える。切り替えた時点で効く（保存ボタンは関係ない）。注釈は「追加の確認ダイアログが出ることがあります」（署名・暗号化の確認）。

同期オンの端末は、NIP-78 の kind:30078 に設定の JSON を NIP-44 で自分宛てに暗号化して保存する。

```json
{ "kind": 30078, "tags": [["d", "matometr/settings"]], "content": "<NIP-44 で暗号化した JSON>" }
```

- 暗号化する JSON：`{"v":1,"share":[…],"open":[…]}`（変更していない種類は書かない＝既定値）
- 送信先・取得先：既定リレー＋ユーザーの write リレー（NIP-65）
- トグルをオンにしたとき
  - 他の端末の設定が無い → この端末の設定を送る
  - この端末が初期状態、または前回そろえた後に変えていない → 他の端末の設定を読み込む
  - この端末にも他の端末にも相手に無い変更がある（どちらの設定を使うか決める必要がある）→
    ダイアログ「他の設定データがあります。どちらを使いますか？」
    - ［この端末の設定（日時 に保存）］：この端末の設定を送り、同期オン（他の端末の設定は上書き）。日時はこの端末で最後に保存した時刻
    - ［他の端末の設定（日時 に保存）］：他の端末の設定を読み込み、同期オン。日時は kind:30078 の created_at
    - ダイアログを閉じた場合は同期オフのまま
- 同期オンのとき（新しい方を使い、確認は出さない）
  - まとめたーを開いたとき（ログインしたとき）：他の端末の設定の方が新しければ黙って読み込む（復号もそのときだけ）
  - 設定画面の「保存」：他の端末にも送る（あとから保存した方が残る）
  - 設定画面を開いたとき・タブに戻ってきたとき：他の端末で保存されていれば、編集中でなければ黙って読み込み、
    編集中なら同期ブロックに「他の端末で保存した設定があります（日時 に保存）」と［読み込む］を出す
  - 送れなかった変更（署名の拒否など）は、開いたときには送り直さず、次の「保存」で送る（保存ボタンを押せるようにしておく）
- 同期オフで初期状態の端末でログインし、他の端末で保存した設定があるとき：ダイアログ「他の端末で保存した設定があります。同期しますか？」
  - ［同期する］：読み込んで同期オン
  - ［同期しない］：次からは聞かない
  - ダイアログを閉じた場合は、次に開いたときにまた聞く
- ダイアログは設定画面に限らず、どのページでも出る
- localStorage に持つもの：同期の記録（どの kind:30078 とそろえたか、キー `matometr:client-links-sync`）と、アカウントごとの同期オン・オフ（キー `matometr:client-links-sync-prefs`）
- nostr-login に求める許可に `sign_event:30078,nip44_encrypt,nip44_decrypt` を追加した

---

## 下書き

MVPはlocalStorage：

```js
const draftKey = 'matometr-draft-{ULID}';
localStorage.setItem(
  draftKey,
  JSON.stringify({
    title,
    summary,
    blocks,
    updated_at
  })
);
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
