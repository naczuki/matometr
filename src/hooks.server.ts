/**
 * OGP 動的注入。SSR は使わない（ssr=false の SPA）ため、ここではコンポーネントの
 * サーバーレンダリングはせず、SPA シェル HTML の <head> メタタグだけを差し替える。
 *
 * /<naddr>・/<npub>（未prerenderの動的ルート）は Worker 上で handle が走る。
 * リレーからまとめ／プロフィールを取得できたら og:* / twitter:* / <title> を注入する。
 * 取得不可・対象外はそのまま（汎用 OGP）。クローラーは注入後の <head> を読む。
 */
import type { Handle } from '@sveltejs/kit';
import { cachedOgForUrl, injectOgIntoHtml } from '$lib/server/og';
import { edgeCache } from '$lib/server/edgeCache';

export const handle: Handle = async ({ event, resolve }) => {
  // リレーへの問い合わせ（キャッシュに無ければ最大 3 秒）は、ページの組み立てと並行して進める
  const ogPromise = cachedOgForUrl(event.url, edgeCache()).catch(() => null);
  const response = await resolve(event);
  const og = await ogPromise;

  if (!og) return response;
  if (!(response.headers.get('content-type') ?? '').includes('text/html')) return response;

  const html = injectOgIntoHtml(await response.text(), og);
  const headers = new Headers(response.headers);
  headers.delete('content-length'); // 本文長が変わるため除去
  return new Response(html, { status: response.status, headers });
};
