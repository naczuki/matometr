import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Cloudflare Workers (Static Assets) で配信する。base パスは廃止（ルート配信）。
    // 未prerenderの動的ルート（/matome/[naddr] など）は SPA フォールバックで描画する。
    // Cloudflare 側は not_found_handling='single-page-application' で index.html を200返し、
    // ssr=false ゆえ全ページが同一シェル＝URL駆動で正しくルーティングされる。
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: '404.html',
      precompress: false,
      strict: false
    }),
    prerender: {
      handleUnseenRoutes: 'ignore'
    }
  }
};

export default config;
