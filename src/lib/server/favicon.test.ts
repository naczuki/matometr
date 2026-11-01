import { describe, it, expect } from 'vitest';
import { findIconHref, isAllowedTarget, resolveFavicon } from './favicon';

describe('findIconHref', () => {
  it('rel="icon" / "shortcut icon" を優先する', () => {
    const html = `<head>
      <link rel="apple-touch-icon" href="/touch.png">
      <link rel="stylesheet" href="/a.css">
      <link rel="shortcut icon" type="image/png" href="icon/nokakoi.png">
    </head>`;
    expect(findIconHref(html)).toBe('icon/nokakoi.png');
  });

  it('icon が無ければ apple-touch-icon', () => {
    expect(findIconHref(`<link href='/t.png' rel='apple-touch-icon'>`)).toBe('/t.png');
  });

  it('mask-icon・data: URI は使わない', () => {
    expect(
      findIconHref(
        `<link rel="mask-icon" href="/m.svg"><link rel="icon" href="data:image/png;base64,x">`
      )
    ).toBeNull();
  });
});

describe('isAllowedTarget', () => {
  it('公開サイトのホスト名は読める', () => {
    expect(isAllowedTarget('https://nokakoi.com/app/')).toBe(true);
    expect(isAllowedTarget('http://njump.me/')).toBe(true);
    expect(isAllowedTarget('https://example.com:443/')).toBe(true); // 既定のポートは省略扱い
  });

  it('IP アドレスは読まない（10 進・16 進の書き方も）', () => {
    for (const url of [
      'http://127.0.0.1/',
      'http://10.0.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://2130706433/',
      'http://0x7f.1/',
      'http://[::1]/',
      'http://[fd00::1]/'
    ]) {
      expect(isAllowedTarget(url), url).toBe(false);
    }
  });

  it('localhost・内部向けドメイン・ドットの無いホスト名は読まない', () => {
    for (const url of [
      'http://localhost/',
      'http://localhost./',
      'http://foo.localhost/',
      'http://printer.local/',
      'http://metadata.google.internal/',
      'http://router.home.arpa/',
      'http://intranet/',
      'http://a.test/'
    ]) {
      expect(isAllowedTarget(url), url).toBe(false);
    }
  });

  it('既定以外のポート・認証情報付き・http(s) 以外は読まない', () => {
    expect(isAllowedTarget('https://example.com:8080/')).toBe(false);
    expect(isAllowedTarget('https://user:pass@example.com/')).toBe(false);
    expect(isAllowedTarget('file:///etc/passwd')).toBe(false);
    expect(isAllowedTarget('ftp://example.com/')).toBe(false);
  });
});

type Route = {
  status?: number;
  type?: string;
  body?: string;
  location?: string;
  /** 本文を途中で止める（ヘッダーだけ返して送ってこない） */
  stall?: boolean;
};

function mockFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  // Cloudflare Workers の fetch と同じく、this が global 以外で呼ばれたら失敗させる
  const fn = async function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    if (this !== undefined && this !== globalThis) {
      throw new TypeError('Illegal invocation: function called with incorrect `this` reference');
    }
    const url = typeof input === 'string' ? input : input.toString();
    calls.push(url);
    expect(init?.redirect).toBe('manual');
    const route = routes[url];
    if (!route) {
      return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
    }
    const headers: Record<string, string> = { 'content-type': route.type ?? 'text/html' };
    if (route.location) headers.location = route.location;
    const signal = init?.signal;
    const body = route.stall
      ? new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('<html><head>'));
            signal?.addEventListener('abort', () =>
              controller.error(new DOMException('aborted', 'AbortError'))
            );
          }
        })
      : (route.body ?? 'x');
    return new Response(body, { status: route.status ?? 200, headers });
  } as typeof fetch;
  return { fn, calls };
}

describe('resolveFavicon', () => {
  it('ページの <link rel="icon"> を、ページの URL を基準に解決する', async () => {
    const { fn } = mockFetch({
      'https://nokakoi.com/app/': {
        type: 'text/html; charset=utf-8',
        body: '<link rel="icon" type="image/png" href="icon/nokakoi.png">'
      },
      'https://nokakoi.com/app/icon/nokakoi.png': { type: 'image/png' }
    });
    expect(await resolveFavicon('https://nokakoi.com/app/', { fetchFn: fn })).toBe(
      'https://nokakoi.com/app/icon/nokakoi.png'
    );
  });

  it('ページに無ければサイトのトップ、それでも無ければ /favicon.ico', async () => {
    const { fn } = mockFetch({
      'https://a.example.com/post': { body: '<title>x</title>' },
      'https://a.example.com/': { body: '<link rel="icon" href="/i.svg">' },
      'https://a.example.com/i.svg': { type: 'image/svg+xml' }
    });
    expect(await resolveFavicon('https://a.example.com/post', { fetchFn: fn })).toBe(
      'https://a.example.com/i.svg'
    );

    const { fn: fn2 } = mockFetch({
      'https://b.example.com/': { body: '' },
      'https://b.example.com/favicon.ico': { type: 'image/x-icon' }
    });
    expect(await resolveFavicon('https://b.example.com/', { fetchFn: fn2 })).toBe(
      'https://b.example.com/favicon.ico'
    );
  });

  it('画像の代わりにページを返すアイコンは使わない', async () => {
    const { fn } = mockFetch({
      'https://c.example.com/': { body: '<link rel="icon" href="/favicon.ico">' },
      'https://c.example.com/favicon.ico': { type: 'text/html; charset=utf-8', body: '<html>' }
    });
    expect(await resolveFavicon('https://c.example.com/', { fetchFn: fn })).toBeNull();
  });

  it('読みに行けない先は調べない', async () => {
    const { fn, calls } = mockFetch({});
    expect(await resolveFavicon('file:///etc/passwd', { fetchFn: fn })).toBeNull();
    expect(await resolveFavicon('http://127.0.0.1/', { fetchFn: fn })).toBeNull();
    expect(await resolveFavicon('http://localhost/', { fetchFn: fn })).toBeNull();
    expect(calls).toEqual([]);
  });

  it('リダイレクトは 1 回ごとに確かめ、内部向けの先へは行かない', async () => {
    const { fn, calls } = mockFetch({
      'https://d.example.com/': { status: 302, location: 'http://169.254.169.254/' },
      'https://d.example.com/favicon.ico': { status: 301, location: 'http://localhost/x.ico' }
    });
    expect(await resolveFavicon('https://d.example.com/', { fetchFn: fn })).toBeNull();
    expect(calls.some((u) => u.includes('169.254') || u.includes('localhost'))).toBe(false);
  });

  it('公開サイトへのリダイレクトは追う（相対の Location も）', async () => {
    const { fn } = mockFetch({
      'https://e.example.com/app': { status: 301, location: '/app/' },
      'https://e.example.com/app/': { body: '<link rel="icon" href="i.png">' },
      'https://e.example.com/app/i.png': { status: 302, location: 'https://cdn.example.net/i.png' },
      'https://cdn.example.net/i.png': { type: 'image/png' }
    });
    expect(await resolveFavicon('https://e.example.com/app', { fetchFn: fn })).toBe(
      'https://e.example.com/app/i.png'
    );
  });

  it('リダイレクトが続きすぎたらやめる', async () => {
    const routes: Record<string, Route> = {};
    for (let i = 0; i < 10; i++) {
      routes[`https://f.example.com/${i}`] = {
        status: 302,
        location: `https://f.example.com/${i + 1}`
      };
    }
    const { fn, calls } = mockFetch(routes);
    expect(await resolveFavicon('https://f.example.com/0', { fetchFn: fn })).toBeNull();
    expect(
      calls.filter((u) => u.startsWith('https://f.example.com/') && /\/\d$/.test(u)).length
    ).toBeLessThanOrEqual(4);
  });

  it('本文の途中で止まっても、期限で打ち切る', async () => {
    const { fn } = mockFetch({ 'https://g.example.com/': { stall: true } });
    const started = Date.now();
    expect(
      await resolveFavicon('https://g.example.com/', { fetchFn: fn, timeoutMs: 200 })
    ).toBeNull();
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
