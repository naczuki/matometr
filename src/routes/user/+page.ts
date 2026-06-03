// 後方互換ルート。正規URLはパス形式 /user/<npub>（[npub]/+page.svelte）。
// 旧 /user/?id=<npub> を直接開かれても描画できるよう残す（OGPは汎用）。
// trailingSlash='always' で user/index.html を生成し /user/?id= を200にする。
export const trailingSlash = 'always';
