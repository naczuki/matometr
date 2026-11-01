// 登録したクライアントのアイコン（ファビコン）を探す。/api/favicon から使う。
//
// ブラウザからは他サイトの HTML を読めない（CORS）ので、サーバーでページを読み、
// <link rel="icon"> などに書かれたアイコンの場所を調べる。見つからなければ /favicon.ico を試す。
// 返すのはアイコンの URL だけで、画像そのものは中継しない。

const FETCH_TIMEOUT_MS = 5_000;
/** HTML はこの長さまでしか読まない（アイコンの指定は <head> にある） */
const MAX_HTML_BYTES = 256 * 1024;

type FetchFn = typeof fetch;

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  for (const m of tag.matchAll(re)) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

/**
 * HTML からアイコンの href を探す。rel に icon を含むもの（icon / shortcut icon）を優先し、
 * 無ければ apple-touch-icon。mask-icon（単色の SVG）と data: URI は使わない。
 */
export function findIconHref(html: string): string | null {
  let touchIcon: string | null = null;
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseAttributes(m[0]);
    const href = attrs.href?.trim();
    if (!href || /^data:/i.test(href)) continue;
    const rels = (attrs.rel ?? '').toLowerCase().split(/\s+/);
    if (rels.includes('mask-icon')) continue;
    if (rels.includes('icon')) return href;
    if (
      !touchIcon &&
      (rels.includes('apple-touch-icon') || rels.includes('apple-touch-icon-precomposed'))
    ) {
      touchIcon = href;
    }
  }
  return touchIcon;
}

async function fetchWithTimeout(fetchFn: FetchFn, url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetchFn(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { accept: 'text/html,image/*;q=0.9,*/*;q=0.8' }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readLimitedText(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  while (bytes < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => {});
  return text;
}

/** アイコンとして読めるか（画像を返すか）。ページの代わりに HTML を返すサイトがあるので確かめる */
async function isImage(fetchFn: FetchFn, url: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(fetchFn, url);
    await res.body?.cancel().catch(() => {});
    if (!res.ok) return false;
    const type = (res.headers.get('content-type') ?? '').toLowerCase();
    return !type.includes('text/html');
  } catch {
    return false;
  }
}

async function iconFromPage(fetchFn: FetchFn, pageUrl: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(fetchFn, pageUrl);
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    const type = (res.headers.get('content-type') ?? '').toLowerCase();
    if (!type.includes('html')) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    const href = findIconHref(await readLimitedText(res));
    if (!href) return null;
    const icon = new URL(href, res.url || pageUrl).toString();
    return isHttpUrl(icon) && (await isImage(fetchFn, icon)) ? icon : null;
  } catch {
    return null;
  }
}

/**
 * ページ URL からアイコンの URL を探す。
 * ページ → サイトのトップ → サイトの /favicon.ico の順に試し、見つからなければ null。
 */
export async function resolveFavicon(
  pageUrl: string,
  fetchFn: FetchFn = fetch
): Promise<string | null> {
  if (!isHttpUrl(pageUrl)) return null;
  const origin = new URL(pageUrl).origin;
  const pages = [...new Set([pageUrl, `${origin}/`])];
  for (const page of pages) {
    const icon = await iconFromPage(fetchFn, page);
    if (icon) return icon;
  }
  const fallback = `${origin}/favicon.ico`;
  return (await isImage(fetchFn, fallback)) ? fallback : null;
}
