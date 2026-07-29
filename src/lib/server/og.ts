/**
 * OGP 動的注入のロジック（hooks.server.ts から使用）。
 *
 * /<naddr>・/<npub> のとき、リレーからまとめ／プロフィールを取得して
 * OgData を組み立て、SPA シェル（app.html 由来の <head>）の og:* / twitter:* / <title> を
 * 文字列置換で書き換える。HTMLRewriter は使わず（Cloudflare 固有型を避けるため）、
 * 置換対象は app.html の固定タグなので確実に当たる。
 */
import { decode } from 'nostr-tools/nip19';
import { fetchFirstEvent, tagValue, type NostrEvent } from './relay';

export interface OgData {
  title: string;
  description: string;
  image: string;
  url: string;
}

/** メタタグに入れる文字列を無害化（制御文字除去・空白圧縮・長さ制限）。 */
function sanitize(input: string | undefined, max: number): string {
  if (!input) return '';
  const cleaned = input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > max ? cleaned.slice(0, max - 1) + '…' : cleaned;
}

/** HTML 属性／テキスト用エスケープ（metaタグ breakout 防止）。 */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** URL から OGP 対象を判定し、リレー取得して OgData を返す（対象外・取得失敗は null）。 */
export async function ogForUrl(url: URL): Promise<OgData | null> {
  const matome = url.pathname.match(/^\/(naddr1[0-9a-z]+)\/?$/);
  if (matome) return buildMatomeOg(matome[1], url);

  const user = url.pathname.match(/^\/(npub1[0-9a-z]+)\/?$/);
  if (user) return buildUserOg(user[1], url);

  return null;
}

async function buildMatomeOg(naddr: string, url: URL): Promise<OgData | null> {
  try {
    const decoded = decode(naddr);
    if (decoded.type !== 'naddr') return null;
    const { pubkey, identifier, kind } = decoded.data;
    const event = await fetchFirstEvent({
      kinds: [kind],
      authors: [pubkey],
      '#d': [identifier],
      limit: 1
    });
    if (!event) return null;
    const title = sanitize(tagValue(event, 'title'), 120);
    if (!title) return null;
    const image = tagValue(event, 'image');
    return {
      title,
      description: sanitize(tagValue(event, 'summary'), 200),
      image: image && /^https?:\/\//.test(image) ? image : `${url.origin}/ogp.png`,
      url: url.toString()
    };
  } catch {
    return null;
  }
}

async function buildUserOg(npub: string, url: URL): Promise<OgData | null> {
  try {
    const decoded = decode(npub);
    if (decoded.type !== 'npub') return null;
    const event = await fetchFirstEvent({ kinds: [0], authors: [decoded.data], limit: 1 });
    const profile = parseProfile(event);
    if (!profile?.name) return null;
    return {
      title: `${sanitize(profile.name, 80)} のまとめ | まとめたー`,
      description: sanitize(profile.about, 200),
      image:
        profile.picture && /^https?:\/\//.test(profile.picture)
          ? profile.picture
          : `${url.origin}/ogp.png`,
      url: url.toString()
    };
  } catch {
    return null;
  }
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

/** SPA シェル HTML の og:* / twitter:* / <title> を OgData で置換する。 */
export function injectOgIntoHtml(html: string, og: OgData): string {
  const title = esc(og.title);
  const desc = esc(og.description);
  const image = esc(og.image);
  const u = esc(og.url);
  // 置換文字列だと val 中の $& や $' が特殊パターン扱いされるため、関数形式で挿入する
  const setContent = (h: string, attr: string, val: string) =>
    h.replace(
      new RegExp(`(<meta ${attr} content=")[^"]*(")`),
      (_m, p1: string, p2: string) => p1 + val + p2
    );
  return [
    (h: string) => setContent(h, 'property="og:title"', title),
    (h: string) => setContent(h, 'property="og:description"', desc),
    (h: string) => setContent(h, 'property="og:url"', u),
    (h: string) => setContent(h, 'property="og:image"', image),
    (h: string) => setContent(h, 'name="twitter:title"', title),
    (h: string) => setContent(h, 'name="twitter:description"', desc),
    (h: string) => setContent(h, 'name="twitter:image"', image),
    (h: string) => h.replace(/<title>[^<]*<\/title>/, () => `<title>${title}</title>`)
  ].reduce((acc, fn) => fn(acc), html);
}
