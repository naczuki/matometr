import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Cloudflare Workers + Static Assets。出力は .svelte-kit/cloudflare/（_worker.js＋assets）。
    // SSR は使わず（src/routes/+layout.ts の ssr=false）、OGP の動的注入だけ
    // src/hooks.server.ts の handle で行う。base パスは廃止（ルート配信）。
    adapter: adapter(),
    prerender: {
      handleUnseenRoutes: 'ignore'
    }
  }
};

export default config;
