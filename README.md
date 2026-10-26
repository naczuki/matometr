# matometr

Nostrのまとめ作成(kind:30023)and閲覧webクライアント

#matometr or #nosli タグの付いたものをまとめ記事として表示します

## 技術スタック

- [SvelteKit](https://kit.svelte.dev/) 2 + Svelte 4 + TypeScript
- [`@sveltejs/adapter-static`](https://kit.svelte.dev/docs/adapter-static)（静的書き出し、GitHub Pages へデプロイ）
- [Tailwind CSS](https://tailwindcss.com/)
- Nostr 関連：[`nostr-tools`](https://github.com/nbd-wtf/nostr-tools) / [`rx-nostr`](https://github.com/penpenpng/rx-nostr) / [`@konemono/nostr-login`](https://www.npmjs.com/package/@konemono/nostr-login) / [`@konemono/nostr-share-component`](https://www.npmjs.com/package/@konemono/nostr-share-component)
- その他：`marked`（Markdown）/ `dompurify`（サニタイズ）/ `ulid`（d-tag 生成）/ `sortablejs`・`svelte-dnd-action`（並べ替え）

## `matome_layout` タグ

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
