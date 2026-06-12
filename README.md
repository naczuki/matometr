# matometr

Nostrのまとめ作成(kind:30023)and閲覧webクライアント

#matometr or #nosli タグの付いたものをまとめ記事として表示します

## 技術スタック

- [SvelteKit](https://kit.svelte.dev/) 2 + Svelte 4 + TypeScript
- [`@sveltejs/adapter-static`](https://kit.svelte.dev/docs/adapter-static)（静的書き出し、GitHub Pages へデプロイ）
- [Tailwind CSS](https://tailwindcss.com/)
- Nostr 関連：[`nostr-tools`](https://github.com/nbd-wtf/nostr-tools) / [`rx-nostr`](https://github.com/penpenpng/rx-nostr) / [`@konemono/nostr-login`](https://www.npmjs.com/package/@konemono/nostr-login) / [`@konemono/nostr-share-component`](https://www.npmjs.com/package/@konemono/nostr-share-component)
- その他：`marked`（Markdown）/ `dompurify`（サニタイズ）/ `ulid`（d-tag 生成）/ `sortablejs`・`svelte-dnd-action`（並べ替え）
