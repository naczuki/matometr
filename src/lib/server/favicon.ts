// 登録したクライアントのアイコン（ファビコン）を探す。/api/favicon から使う。
//
// ブラウザからは他サイトの HTML を読めない（CORS）ので、サーバーでページを読み、
// <link rel="icon"> などに書かれたアイコンの場所を調べる。見つからなければ /favicon.ico を試す。
// 返すのはアイコンの URL だけで、画像そのものは中継しない。
//
// 誰でも呼べる API なので、サーバーから読みに行く先を絞る（SSRF 対策）。
// - 公開サイトのホスト名だけ（IP アドレス・localhost・内部向けのドメインは読まない）
// - ポートは既定（80 / 443）だけ
// - リダイレクトは自動で追わず、1 回ごとに同じ条件で確かめる（最大 MAX_REDIRECTS 回）
// - 1 回の問い合わせ全体（本文の読み込みを含む）に期限（TIMEOUT_MS）を付ける
// なお本番の Cloudflare Workers は、もともと IP アドレス宛てには fetch できない。

const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
/** HTML はこの長さまでしか読まない（アイコンの指定は <head> にある） */
const MAX_HTML_BYTES = 256 * 1024;

/** 内部向け・予約済みのドメイン（RFC 6761 / 6762 / 8375 など）。これらとその下は読まない */
const BLOCKED_SUFFIXES = [
  'localhost',
  'local',
  'internal',
  'intranet',
  'lan',
  'home',
  'corp',
  'private',
  'home.arpa',
  'localdomain',
  'test',
  'invalid',
  'example'
];

type FetchFn = typeof fetch;

export interface ResolveOptions {
  fetchFn?: FetchFn;
  timeoutMs?: number;
}

function isIpv4(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

/**
 * サーバーから読みに行ってよい URL か。
 * http(s)・既定のポート・公開サイトのホスト名（ドットを含み、IP アドレスでも内部向けでもない）だけ。
 * URL の解析で 10 進や 16 進の IPv4（例：2130706433、0x7f.1）は 127.0.0.1 の形に直るので、ここで弾ける。
 */
export function isAllowedTarget(value: string): boolean {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.username || u.password) return false;
  if (u.port !== '') return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host.startsWith('[') || isIpv4(host)) return false;
  if (!host.includes('.')) return false;
  return !BLOCKED_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
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

/** url を読み、最後にたどり着いた URL と一緒に返す（読みに行けない先なら null） */
type Getter = (url: string) => Promise<{ res: Response; url: string } | null>;

/**
 * 1 回の問い合わせの中で使う読み込み関数を作る。読みに行く先の確認・リダイレクト・期限をまとめて扱う。
 * fetch はメソッドとして呼ばない（Cloudflare Workers では this が違うと Illegal invocation になる）。
 */
function createGetter(fetchFn: FetchFn, signal: AbortSignal): Getter {
  return async (url) => {
    let current = url;
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      if (!isAllowedTarget(current)) return null;
      const res = await fetchFn(current, {
        redirect: 'manual',
        signal,
        headers: { accept: 'text/html,image/*;q=0.9,*/*;q=0.8' }
      });
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel().catch(() => {});
        current = new URL(location, current).toString();
        continue;
      }
      return { res, url: current };
    }
    return null;
  };
}

/** 本文を MAX_HTML_BYTES まで読む。期限が来たら読み込みも止まる（fetch と同じ signal を使うため） */
async function readLimitedText(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  try {
    while (bytes < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return text;
}

/** アイコンとして読めるか（画像を返すか）。ページの代わりに HTML を返すサイトがあるので確かめる */
async function isImage(get: Getter, url: string): Promise<boolean> {
  try {
    const got = await get(url);
    if (!got) return false;
    await got.res.body?.cancel().catch(() => {});
    if (!got.res.ok) return false;
    const type = (got.res.headers.get('content-type') ?? '').toLowerCase();
    return !type.includes('text/html');
  } catch {
    return false;
  }
}

async function iconFromPage(get: Getter, pageUrl: string): Promise<string | null> {
  try {
    const got = await get(pageUrl);
    if (!got) return null;
    const { res } = got;
    const type = (res.headers.get('content-type') ?? '').toLowerCase();
    if (!res.ok || !type.includes('html')) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    const href = findIconHref(await readLimitedText(res));
    if (!href) return null;
    const icon = new URL(href, got.url).toString();
    return (await isImage(get, icon)) ? icon : null;
  } catch {
    return null;
  }
}

/**
 * ページ URL からアイコンの URL を探す。
 * ページ → サイトのトップ → サイトの /favicon.ico の順に試し、見つからなければ null。
 * 全体で timeoutMs を過ぎたら、読み込み中のものも含めて打ち切る。
 */
export async function resolveFavicon(
  pageUrl: string,
  options: ResolveOptions = {}
): Promise<string | null> {
  if (!isAllowedTarget(pageUrl)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);
  const get = createGetter(options.fetchFn ?? fetch, controller.signal);
  try {
    const origin = new URL(pageUrl).origin;
    for (const page of new Set([pageUrl, `${origin}/`])) {
      const icon = await iconFromPage(get, page);
      if (icon) return icon;
      if (controller.signal.aborted) return null;
    }
    const fallback = `${origin}/favicon.ico`;
    return (await isImage(get, fallback)) ? fallback : null;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
