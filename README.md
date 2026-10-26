# matometr

Nostrのまとめ作成(kind:30023)and閲覧webクライアント

#matometr or #nosli タグの付いたものをまとめ記事として表示します

## 技術スタック

- [SvelteKit](https://kit.svelte.dev/) 2 + Svelte 4 + TypeScript
- [`@sveltejs/adapter-static`](https://kit.svelte.dev/docs/adapter-static)（静的書き出し、GitHub Pages へデプロイ）
- [Tailwind CSS](https://tailwindcss.com/)
- Nostr 関連：[`nostr-tools`](https://github.com/nbd-wtf/nostr-tools) / [`rx-nostr`](https://github.com/penpenpng/rx-nostr) / [`@konemono/nostr-login`](https://www.npmjs.com/package/@konemono/nostr-login) / [`@konemono/nostr-share-component`](https://www.npmjs.com/package/@konemono/nostr-share-component)
- その他：`marked`（Markdown）/ `dompurify`（サニタイズ）/ `ulid`（d-tag 生成）/ `sortablejs`・`svelte-dnd-action`（並べ替え）

## まとめイベント（kind:30023）のタグ

保存・編集時に付けるタグです。`matome_layout` 以外は既存 NIP のタグで、まとめたー固有なのは値の付け方です。

| タグ            | 値                                                                                                                 | 用途                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `d`             | `matometr-{ULID}`                                                                                                  | まとめの識別子。`t:matometr` が外れても、この形式ならまとめたーで編集できる |
| `title`         | タイトル                                                                                                           | NIP-23                                                                      |
| `summary`       | 説明文                                                                                                             | NIP-23                                                                      |
| `published_at`  | 初回公開時刻（UNIX 秒）                                                                                            | 編集しても初回の値を維持                                                    |
| `t`             | `matometr`                                                                                                         | 一覧取得のフィルタ（`#t: ["matometr"]`）。`t:nosli` は付けない              |
| `q`             | `[イベントID, リレーヒント, 作者pubkey]`                                                                           | 引用ポストごとに 1 件（重複除去）。NIP-18                                   |
| `p`             | `[pubkey, リレーヒント]`                                                                                           | 引用ポストの作者ごとに 1 件（重複除去）                                     |
| `client`        | `["matometr", "31990:82b30d30444170e6a8c819e8406e362a3695454a4617894ce2706f3840c6c003:matometr", "wss://yabu.me"]` | NIP-89                                                                      |
| `matome_layout` | 下記                                                                                                               | まとめたー独自。content をブロック単位に復元する                            |

### `matome_layout` タグ

content（ブロックを空行で連結した Markdown）を、エディタ上のブロック単位に復元するためのタグです。

```json
["matome_layout", "2", "[\"h\",\"e\",2,\"e\"]"]
```

3 番目の要素は、ブロック列を先頭から順に並べた JSON 配列（文字列化したもの）です。

| 要素     | ブロック                                                                   | 消費するチャンク数 |
| -------- | -------------------------------------------------------------------------- | ------------------ |
| `"e"`    | 引用（`nostr:nevent1…` / `note1` / `naddr1` / `npub1` / `nprofile1` 単独） | 1                  |
| `"h"`    | 見出し（`## …`）                                                           | 1                  |
| 正の整数 | コメント（値はそのコメントが占めるチャンク数）                             | 値の数             |

- チャンク = content を空行（`/\n\s*\n/`）で区切った非空の段落
- 上の例は「見出し → 引用 → 2 段落のコメント → 引用」
- 配列が消費するチャンク数の合計が content のチャンク数と一致しない場合、このタグは使われず、content の内容から推測して復元します
