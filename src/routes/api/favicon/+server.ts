import type { RequestHandler } from './$types';
import { isHttpUrl, resolveFavicon } from '$lib/server/favicon';

// GET /api/favicon?url=<クライアントのページ URL>
// アイコンが見つかればその URL へリダイレクトする（<img src> にそのまま使える）。
// 見つからなければ 404。結果はブラウザとサーバー（Cloudflare の Cache API）でキャッシュする。

export const prerender = false;

const FOUND_MAX_AGE = 7 * 24 * 60 * 60;
const NOT_FOUND_MAX_AGE = 24 * 60 * 60;

type EdgeCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

function edgeCache(): EdgeCache | null {
  const c = (globalThis as { caches?: { default?: EdgeCache } }).caches;
  return c?.default ?? null;
}

export const GET: RequestHandler = async ({ url, request }) => {
  const target = url.searchParams.get('url') ?? '';
  if (!isHttpUrl(target) || target.length > 2048) {
    return new Response('bad request', { status: 400 });
  }

  const cache = edgeCache();
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    } catch {
      /* キャッシュが使えなくても続ける */
    }
  }

  const icon = await resolveFavicon(target);
  const response = icon
    ? new Response(null, {
        status: 302,
        headers: { location: icon, 'cache-control': `public, max-age=${FOUND_MAX_AGE}` }
      })
    : new Response('not found', {
        status: 404,
        headers: { 'cache-control': `public, max-age=${NOT_FOUND_MAX_AGE}` }
      });

  if (cache && request.method === 'GET') {
    try {
      await cache.put(cacheKey, response.clone());
    } catch {
      /* キャッシュに入れられなくても結果は返す */
    }
  }
  return response;
};
