/**
 * Cloudflare Worker エントリ。
 *
 * 役割は OGP の動的注入のみ。アプリ本体（SvelteKit SPA）は build/ の静的アセットとして
 * 配信され、クライアントでレンダリングされる（SSR は導入しない）。
 *
 * - GET /matome/<naddr>  : リレーから kind:30023 を取得し og:title / og:description を注入
 * - GET /user/<npub>     : リレーから kind:0 を取得し og:title / og:description を注入
 * - それ以外             : env.ASSETS.fetch() で静的配信（SPA フォールバック込み）
 *
 * クローラー（JS非実行）は注入済みの <head> を読み、通常のブラウザは従来どおり
 * SPA が起動して URL に応じて描画する。
 */
import { handleMatomeOg, handleUserOg } from './og';

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

const MATOME_PATH = /^\/matome\/(naddr1[0-9a-z]+)\/?$/;
const USER_PATH = /^\/user\/(npub1[0-9a-z]+)\/?$/;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET') {
      const matome = url.pathname.match(MATOME_PATH);
      if (matome) return handleMatomeOg(request, env, ctx, matome[1]);

      const user = url.pathname.match(USER_PATH);
      if (user) return handleUserOg(request, env, ctx, user[1]);
    }

    // OGP 注入対象外は静的アセット／SPA フォールバックへ。
    return env.ASSETS.fetch(request);
  }
};
