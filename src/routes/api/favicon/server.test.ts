import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const resolveFavicon = vi.fn<(url: string) => Promise<string | null>>();

vi.mock('$lib/server/favicon', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/server/favicon')>();
  return { ...original, resolveFavicon: (url: string) => resolveFavicon(url) };
});

import { GET } from './+server';

type Handler = (event: { url: URL; request: Request }) => Promise<Response>;
const get = GET as unknown as Handler;

function call(query: string, headers: Record<string, string> = {}): Promise<Response> {
  const url = new URL(`https://matometr.example/api/favicon?${query}`);
  return get({ url, request: new Request(url, { headers }) });
}

const IMAGE = { 'sec-fetch-dest': 'image' };
const PAGE = encodeURIComponent('https://client.example.com/app');

beforeEach(() => {
  resolveFavicon.mockReset();
});

describe('GET /api/favicon：画像の読み込みとして呼ばれたときだけ応じる', () => {
  it('リンクとして開かれたとき（Sec-Fetch-Dest が image 以外・無し）は 400 で、探しにも行かない', async () => {
    resolveFavicon.mockResolvedValue('https://client.example.com/icon.png');
    const cases: Record<string, string>[] = [
      {},
      { 'sec-fetch-dest': 'document' },
      { 'sec-fetch-dest': 'iframe' }
    ];
    for (const headers of cases) {
      const res = await call(`url=${PAGE}`, headers);
      expect(res.status).toBe(400);
      expect(res.headers.get('location')).toBeNull();
    }
    expect(resolveFavicon).not.toHaveBeenCalled();
  });

  it('<img> からなら、見つかったアイコンへリダイレクトする', async () => {
    resolveFavicon.mockResolvedValue('https://client.example.com/icon.png');
    const res = await call(`url=${PAGE}`, IMAGE);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://client.example.com/icon.png');
    expect(res.headers.get('vary')).toBe('Sec-Fetch-Dest');
  });

  it('見つからなければ 404', async () => {
    resolveFavicon.mockResolvedValue(null);
    const res = await call(`url=${PAGE}`, IMAGE);
    expect(res.status).toBe(404);
  });

  it('読みに行けない先（localhost など）は 400', async () => {
    const res = await call(`url=${encodeURIComponent('http://localhost/')}`, IMAGE);
    expect(res.status).toBe(400);
    expect(resolveFavicon).not.toHaveBeenCalled();
  });
});

describe('GET /api/favicon：サーバー側のキャッシュ', () => {
  const store = new Map<string, Response>();
  const g = globalThis as { caches?: unknown };
  let original: unknown;

  beforeEach(() => {
    store.clear();
    original = g.caches;
    g.caches = {
      default: {
        match: async (req: Request) => store.get(req.url)?.clone(),
        put: async (req: Request, res: Response) => {
          store.set(req.url, res);
        }
      }
    };
  });

  afterEach(() => {
    g.caches = original;
  });

  it('同じ url なら 2 回目はキャッシュから返し、探しに行かない', async () => {
    resolveFavicon.mockResolvedValue('https://client.example.com/icon.png');
    await call(`url=${PAGE}&v=2`, IMAGE);
    const second = await call(`url=${PAGE}&v=2`, IMAGE);
    expect(second.status).toBe(302);
    expect(second.headers.get('location')).toBe('https://client.example.com/icon.png');
    expect(second.headers.get('vary')).toBe('Sec-Fetch-Dest');
    expect(resolveFavicon).toHaveBeenCalledTimes(1);
  });

  it('余分なパラメータを付けてもキャッシュを素通りしない', async () => {
    resolveFavicon.mockResolvedValue('https://client.example.com/icon.png');
    await call(`url=${PAGE}&v=2`, IMAGE);
    await call(`url=${PAGE}&v=2&x=1`, IMAGE);
    await call(`x=2&v=2&url=${PAGE}`, IMAGE);
    expect(resolveFavicon).toHaveBeenCalledTimes(1);
    expect(store.size).toBe(1);
  });

  it('キャッシュに入っていても、リンクとして開かれたら 400', async () => {
    resolveFavicon.mockResolvedValue('https://client.example.com/icon.png');
    await call(`url=${PAGE}&v=2`, IMAGE);
    const res = await call(`url=${PAGE}&v=2`, { 'sec-fetch-dest': 'document' });
    expect(res.status).toBe(400);
    expect(res.headers.get('location')).toBeNull();
  });
});
