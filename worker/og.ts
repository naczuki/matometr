/**
 * OGP 動的注入の本体。
 *
 * リレーからまとめ／プロフィールを取得し、build/ の SPA シェル（app.html 由来の <head>）に
 * HTMLRewriter で og:* / twitter:* / <title> を書き換えて 200 で返す。
 * 取得失敗・タイムアウト・デコード不能のときは無改変のシェルを 200 で返す（汎用 OGP）。
 */
import { decode } from 'nostr-tools/nip19';
import type { Env } from './index';
import { fetchFirstEvent, tagValue, type NostrEvent } from './nostr';

const CACHE_TTL_SECONDS = 300;

interface OgData {
  title: string;
  description: string;
  image: string;
  url: string;
}

/** メタタグに入れる文字列を無害化（制御文字除去・空白圧縮・長さ制限）。 */
function sanitize(input: string | undefined, max: number): string {
  if (!input) return '';
  // eslint-disable-next-line no-control-regex
  const cleaned = input
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > max ? cleaned.slice(0, max - 1) + '…' : cleaned;
}

/** HTMLRewriter: 属性値を差し替える（自動エスケープされるので breakout 不可）。 */
class SetAttr {
  constructor(
    private attr: string,
    private value: string
  ) {}
  element(el: Element) {
    el.setAttribute(this.attr, this.value);
  }
}

/** HTMLRewriter: テキスト内容を差し替える（テキストとして自動エスケープ）。 */
class SetText {
  constructor(private value: string) {}
  element(el: Element) {
    el.setInnerContent(this.value);
  }
}

/** SPA シェル（prerender 済み index.html）を取得して OGP を注入し、キャッシュして返す。 */
async function injectOg(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  og: OgData | null
): Promise<Response> {
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // SPA シェル（ルートの index.html）を取得。ssr=false なので全ページ同一シェル＝URL駆動。
  const shellResp = await env.ASSETS.fetch(new Request(new URL('/', request.url).toString()));

  let response: Response;
  if (!og) {
    // 取得失敗時は無改変（汎用 OGP）で 200。
    response = new Response(shellResp.body, shellResp);
  } else {
    response = new HTMLRewriter()
      .on('title', new SetText(og.title))
      .on('meta[property="og:title"]', new SetAttr('content', og.title))
      .on('meta[property="og:description"]', new SetAttr('content', og.description))
      .on('meta[property="og:url"]', new SetAttr('content', og.url))
      .on('meta[property="og:image"]', new SetAttr('content', og.image))
      .on('meta[name="twitter:title"]', new SetAttr('content', og.title))
      .on('meta[name="twitter:description"]', new SetAttr('content', og.description))
      .on('meta[name="twitter:image"]', new SetAttr('content', og.image))
      .transform(new Response(shellResp.body, shellResp));
  }

  response = new Response(response.body, response);
  response.headers.set('Content-Type', 'text/html; charset=utf-8');
  response.headers.set('Cache-Control', `public, max-age=${CACHE_TTL_SECONDS}`);
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

/** /matome/<naddr> : kind:30023 を取得し OGP を注入。 */
export async function handleMatomeOg(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  naddr: string
): Promise<Response> {
  const url = new URL(request.url);
  let og: OgData | null = null;
  try {
    const decoded = decode(naddr);
    if (decoded.type === 'naddr') {
      const { pubkey, identifier, kind } = decoded.data;
      const event = await fetchFirstEvent({
        kinds: [kind],
        authors: [pubkey],
        '#d': [identifier],
        limit: 1
      });
      if (event) {
        const title = sanitize(tagValue(event, 'title'), 120);
        if (title) {
          const image = tagValue(event, 'image');
          og = {
            title,
            description: sanitize(tagValue(event, 'summary'), 200),
            image: image && /^https?:\/\//.test(image) ? image : `${url.origin}/ogp.png`,
            url: url.toString()
          };
        }
      }
    }
  } catch {
    /* デコード失敗等 → 汎用 OGP */
  }
  return injectOg(request, env, ctx, og);
}

/** /user/<npub> : kind:0（プロフィール）を取得し OGP を注入。 */
export async function handleUserOg(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  npub: string
): Promise<Response> {
  const url = new URL(request.url);
  let og: OgData | null = null;
  try {
    const decoded = decode(npub);
    if (decoded.type === 'npub') {
      const pubkey = decoded.data;
      const event = await fetchFirstEvent({ kinds: [0], authors: [pubkey], limit: 1 });
      const profile = parseProfile(event);
      if (profile?.name) {
        og = {
          title: `${sanitize(profile.name, 80)} のまとめ | まとめたー`,
          description: sanitize(profile.about, 200),
          image:
            profile.picture && /^https?:\/\//.test(profile.picture)
              ? profile.picture
              : `${url.origin}/ogp.png`,
          url: url.toString()
        };
      }
    }
  } catch {
    /* デコード失敗等 → 汎用 OGP */
  }
  return injectOg(request, env, ctx, og);
}

function parseProfile(
  event: NostrEvent | null
): { name?: string; about?: string; picture?: string } | null {
  if (!event) return null;
  try {
    const c = JSON.parse(event.content) as Record<string, string>;
    return { name: c.display_name || c.name, about: c.about, picture: c.picture };
  } catch {
    return null;
  }
}
