// 後方互換ルート。正規URLはパス形式 /matome/<naddr>（[naddr]/+page.svelte）。
// 旧 /matome/?id=<naddr> を直接開かれても描画できるよう残す（OGPは汎用）。
// trailingSlash='always' で matome/index.html を生成し /matome/?id= を200にする。
export const trailingSlash = 'always';
