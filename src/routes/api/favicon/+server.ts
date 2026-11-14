import type { RequestHandler } from './$types';
import { isAllowedTarget, resolveFavicon } from '$lib/server/favicon';

// GET /api/favicon?url=<クライアントのページ URL>
// アイコンが見つかればその URL へリダイレクトする（<img src> にそのまま使える）。
// 見つからなければ 404。結果はブラウザとサーバー（Cloudflare の Cache API）でキャッシュする。
// 読みに行ける先は公開サイトのホスト名だけ（IP アドレス・localhost・内部向けドメインは 400）。
//
// リダイレクト先は相手のページが決めるので、リンクとして開かれると「まとめたーの URL から
// 任意のサイトへ飛ばす」のに使えてしまう。画像の読み込み（<img>）として呼ばれたときだけ応じる。

export const prerender = false;

const FOUND_MAX_AGE = 7 * 24 * 60 * 60;
// 見つからなかった結果は、一時的な失敗（相手の応答が遅いなど）もあるので短めにする
const NOT_FOUND_MAX_AGE = 60 * 60;

type EdgeCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

function edgeCache(): EdgeCache | null {
  const c = (globalThis as { caches?: { default?: EdgeCache } }).caches;
  return c?.default ?? null;
}

/**
 * 画像の読み込みとして呼ばれたか（Sec-Fetch-Dest: image）。
 * このヘッダはブラウザが付け、ページのスクリプトからは書き換えられない。
 * ヘッダを送らない古いブラウザではアイコンが出ず、頭文字の表示になる。
 */
function isImageRequest(request: Request): boolean {
  return request.headers.get('sec-fetch-dest') === 'image';
}

/**
 * 応答が Sec-Fetch-Dest によって変わることを伝える。ブラウザが画像として受け取った
 * リダイレクトを、同じ URL をリンクとして開いたときに使い回さないようにする。
 * （サーバー側のキャッシュには Vary を付けない形で入れ、返すときに付ける）
 */
function withVary(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('vary', 'Sec-Fetch-Dest');
  return new Response(response.body, { status: response.status, headers });
}

export const GET: RequestHandler = async ({ url, request }) => {
  // キャッシュを引く前に確かめる（画像として呼ばれたときの結果を、リンクで開いた人に返さない）
  if (!isImageRequest(request)) {
    return withVary(new Response('bad request', { status: 400 }));
  }

  const target = url.searchParams.get('url') ?? '';
  if (target.length > 2048 || !isAllowedTarget(target)) {
    return new Response('bad request', { status: 400 });
  }

  const cache = edgeCache();
  // キャッシュのキーは url と v（探し方の版）だけで作る。余分なパラメータを付けて
  // キャッシュを素通りさせ、毎回サーバーに探しに行かせることができないようにする。
  const keyParams = new URLSearchParams({ url: target, v: url.searchParams.get('v') ?? '' });
  const cacheKey = new Request(`${url.origin}${url.pathname}?${keyParams}`, { method: 'GET' });
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return withVary(hit);
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
  return withVary(response);
};
