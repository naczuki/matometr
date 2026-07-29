import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    // *.test.ts を探して実行する。ブラウザは使わず Node 上で動かす。
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
});
