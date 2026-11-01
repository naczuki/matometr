import { describe, it, expect } from 'vitest';
import { findIconHref, resolveFavicon } from './favicon';

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

function mockFetch(routes: Record<string, { status?: number; type: string; body?: string }>) {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push(url);
    const route = routes[url];
    if (!route)
      return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
    const res = new Response(route.body ?? 'x', {
      status: route.status ?? 200,
      headers: { 'content-type': route.type }
    });
    Object.defineProperty(res, 'url', { value: url });
    return res;
  }) as typeof fetch;
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
    expect(await resolveFavicon('https://nokakoi.com/app/', fn)).toBe(
      'https://nokakoi.com/app/icon/nokakoi.png'
    );
  });

  it('ページに無ければサイトのトップ、それでも無ければ /favicon.ico', async () => {
    const { fn } = mockFetch({
      'https://a.example/post': { type: 'text/html', body: '<title>x</title>' },
      'https://a.example/': { type: 'text/html', body: '<link rel="icon" href="/i.svg">' },
      'https://a.example/i.svg': { type: 'image/svg+xml' }
    });
    expect(await resolveFavicon('https://a.example/post', fn)).toBe('https://a.example/i.svg');

    const { fn: fn2 } = mockFetch({
      'https://b.example/': { type: 'text/html', body: '' },
      'https://b.example/favicon.ico': { type: 'image/x-icon' }
    });
    expect(await resolveFavicon('https://b.example/', fn2)).toBe('https://b.example/favicon.ico');
  });

  it('画像の代わりにページを返すアイコンは使わない', async () => {
    const { fn } = mockFetch({
      'https://c.example/': { type: 'text/html', body: '<link rel="icon" href="/favicon.ico">' },
      'https://c.example/favicon.ico': { type: 'text/html; charset=utf-8', body: '<html>' }
    });
    expect(await resolveFavicon('https://c.example/', fn)).toBeNull();
  });

  it('http(s) 以外は調べない', async () => {
    const { fn, calls } = mockFetch({});
    expect(await resolveFavicon('file:///etc/passwd', fn)).toBeNull();
    expect(calls).toEqual([]);
  });
});
