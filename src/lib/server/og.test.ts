import { describe, it, expect, vi } from 'vitest';
import { cachedOgForUrl, injectOgIntoHtml, type OgData } from './og';
import type { EdgeCache } from './edgeCache';

const NADDR = 'naddr1' + 'q'.repeat(30);
const PAGE = new URL(`https://matometr.example/${NADDR}`);

function fakeCache(): EdgeCache & { store: Map<string, Response> } {
  const store = new Map<string, Response>();
  return {
    store,
    match: async (req) => store.get(req.url)?.clone(),
    put: async (req, res) => {
      store.set(req.url, res);
    }
  };
}

const OG: OgData = {
  title: 'タイトル',
  description: '説明',
  image: 'https://matometr.example/ogp.png',
  url: PAGE.toString()
};

describe('cachedOgForUrl', () => {
  it('対象外の URL は取得もキャッシュもしない', async () => {
    const cache = fakeCache();
    const fetchOg = vi.fn(async () => OG);
    expect(
      await cachedOgForUrl(new URL('https://matometr.example/new'), cache, fetchOg)
    ).toBeNull();
    expect(fetchOg).not.toHaveBeenCalled();
    expect(cache.store.size).toBe(0);
  });

  it('同じページの 2 回目はキャッシュから返し、リレーに問い合わせない', async () => {
    const cache = fakeCache();
    const fetchOg = vi.fn(async () => OG);
    expect(await cachedOgForUrl(PAGE, cache, fetchOg)).toEqual(OG);
    expect(await cachedOgForUrl(PAGE, cache, fetchOg)).toEqual(OG);
    expect(fetchOg).toHaveBeenCalledTimes(1);
  });

  it('クエリが違っても同じキャッシュを使い、url は今回のリクエストのものにする', async () => {
    const cache = fakeCache();
    const fetchOg = vi.fn(async () => OG);
    await cachedOgForUrl(PAGE, cache, fetchOg);
    const withQuery = new URL(`${PAGE}?utm_source=x`);
    const og = await cachedOgForUrl(withQuery, cache, fetchOg);
    expect(og?.url).toBe(withQuery.toString());
    expect(og?.title).toBe('タイトル');
    expect(fetchOg).toHaveBeenCalledTimes(1);
  });

  it('取得できなかった結果も覚える（短い期限で）', async () => {
    const cache = fakeCache();
    const fetchOg = vi.fn(async () => null);
    expect(await cachedOgForUrl(PAGE, cache, fetchOg)).toBeNull();
    expect(await cachedOgForUrl(PAGE, cache, fetchOg)).toBeNull();
    expect(fetchOg).toHaveBeenCalledTimes(1);
    const stored = [...cache.store.values()][0];
    expect(stored.headers.get('cache-control')).toBe('public, max-age=60');
  });

  it('見つかった結果は 5 分覚える', async () => {
    const cache = fakeCache();
    await cachedOgForUrl(PAGE, cache, async () => OG);
    const stored = [...cache.store.values()][0];
    expect(stored.headers.get('cache-control')).toBe('public, max-age=300');
  });

  it('キャッシュが無い環境では毎回取得する', async () => {
    const fetchOg = vi.fn(async () => OG);
    await cachedOgForUrl(PAGE, null, fetchOg);
    await cachedOgForUrl(PAGE, null, fetchOg);
    expect(fetchOg).toHaveBeenCalledTimes(2);
  });

  it('キャッシュが壊れていても取得して返す', async () => {
    const broken: EdgeCache = {
      match: async () => {
        throw new Error('cache down');
      },
      put: async () => {
        throw new Error('cache down');
      }
    };
    expect(await cachedOgForUrl(PAGE, broken, async () => OG)).toEqual(OG);
  });
});

describe('injectOgIntoHtml', () => {
  const SHELL = [
    '<title>まとめたー - matometr</title>',
    '<meta property="og:title" content="まとめたー" />',
    '<meta property="og:description" content="Nostrのまとめをつくる・よむ" />',
    '<meta property="og:url" content="" />',
    '<meta property="og:image" content="/ogp.png" />',
    '<meta name="twitter:title" content="まとめたー" />',
    '<meta name="twitter:description" content="Nostrのまとめをつくる・よむ" />',
    '<meta name="twitter:image" content="/ogp.png" />'
  ].join('\n');

  it('title と og:* / twitter:* を差し替える', () => {
    const html = injectOgIntoHtml(SHELL, OG);
    expect(html).toContain('<title>タイトル</title>');
    expect(html).toContain('<meta property="og:title" content="タイトル" />');
    expect(html).toContain('<meta property="og:description" content="説明" />');
    expect(html).toContain(`<meta property="og:url" content="${PAGE}" />`);
    expect(html).toContain(
      '<meta name="twitter:image" content="https://matometr.example/ogp.png" />'
    );
  });

  it('値の中の記号でタグを抜け出せない', () => {
    const html = injectOgIntoHtml(SHELL, {
      ...OG,
      title: '"><script>alert(1)</script>',
      description: "$& $' $1"
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('content="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
    expect(html).toContain(`<meta property="og:description" content="$&amp; $' $1" />`);
  });
});
