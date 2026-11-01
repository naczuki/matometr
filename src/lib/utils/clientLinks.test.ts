import { describe, it, expect } from 'vitest';
import {
  DEFAULT_OPEN_CLIENTS,
  DEFAULT_SHARE_CLIENTS,
  clientIconUrl,
  fillOpenUrl,
  fillShareUrl,
  isUsable,
  sanitizeClientLinks,
  validateName,
  validateUrl,
  type ClientLink
} from './clientLinks';

describe('既定値', () => {
  it('既定のシェア先・「○○で開く」はすべてメニューに出せる', () => {
    for (const c of DEFAULT_SHARE_CLIENTS) expect(isUsable('share', c)).toBe(true);
    for (const c of DEFAULT_OPEN_CLIENTS) expect(isUsable('open', c)).toBe(true);
  });

  it('「○○で開く」の既定は従来どおり nostter', () => {
    expect(DEFAULT_OPEN_CLIENTS.map((c) => c.url)).toEqual(['https://nostter.app/{nevent}']);
  });
});

describe('validateUrl', () => {
  it('シェア先は {text} が必要', () => {
    expect(validateUrl('share', 'https://example.com/post?text={text}')).toBeNull();
    expect(validateUrl('share', 'https://example.com/post')).not.toBeNull();
    expect(validateUrl('share', 'https://example.com/{nevent}')).not.toBeNull();
  });

  it('「○○で開く」は {nevent} / {note} / {id} のどれかが必要', () => {
    expect(validateUrl('open', 'https://example.com/{nevent}')).toBeNull();
    expect(validateUrl('open', 'https://example.com/{note}')).toBeNull();
    expect(validateUrl('open', 'https://example.com/e/{id}')).toBeNull();
    expect(validateUrl('open', 'https://example.com/')).not.toBeNull();
  });

  it('http(s) 以外のスキームは受け付けない', () => {
    expect(validateUrl('open', 'javascript:alert(1)//{nevent}')).not.toBeNull();
    expect(validateUrl('share', 'data:text/html,{text}')).not.toBeNull();
    expect(validateUrl('share', '  ')).not.toBeNull();
  });
});

describe('validateName', () => {
  it('空白だけの名前は不可', () => {
    expect(validateName('  ')).not.toBeNull();
    expect(validateName('nostter')).toBeNull();
  });
});

describe('isUsable', () => {
  const base: ClientLink = {
    id: 'x',
    name: 'x',
    url: 'https://example.com/{nevent}',
    enabled: true
  };

  it('表示オフ・URL 不正はメニューに出さない', () => {
    expect(isUsable('open', base)).toBe(true);
    expect(isUsable('open', { ...base, enabled: false })).toBe(false);
    expect(isUsable('open', { ...base, url: 'https://example.com/' })).toBe(false);
    expect(isUsable('open', { ...base, name: '' })).toBe(false);
  });
});

describe('fillShareUrl', () => {
  it('{text} を URL エンコードした文章で置き換える（複数回出ても全部）', () => {
    expect(
      fillShareUrl('https://example.com/?a={text}&b={text}', 'まとめ #タグ\nhttps://x/?q=1')
    ).toBe(
      'https://example.com/?a=' +
        encodeURIComponent('まとめ #タグ\nhttps://x/?q=1') +
        '&b=' +
        encodeURIComponent('まとめ #タグ\nhttps://x/?q=1')
    );
  });
});

describe('fillOpenUrl', () => {
  const ids = { nevent: 'nevent1abc', note: 'note1def', id: '0123abcd' };

  it('各プレースホルダを対応する ID で置き換える', () => {
    expect(fillOpenUrl('https://nostter.app/{nevent}', ids)).toBe('https://nostter.app/nevent1abc');
    expect(fillOpenUrl('https://example.com/{note}', ids)).toBe('https://example.com/note1def');
    expect(fillOpenUrl('https://example.com/e/{id}?n={nevent}', ids)).toBe(
      'https://example.com/e/0123abcd?n=nevent1abc'
    );
  });
});

describe('clientIconUrl', () => {
  it('既定アイコンは同じサイトのときだけ使い、それ以外は /favicon.ico', () => {
    const nostter = DEFAULT_SHARE_CLIENTS.find((c) => c.id === 'nostter')!;
    expect(clientIconUrl(nostter)).toBe('https://nostter.app/favicon.ico');
    const haiku = DEFAULT_SHARE_CLIENTS.find((c) => c.id === 'noshaiku')!;
    expect(clientIconUrl(haiku)).toBe('https://nos-haiku.vercel.app/favicon.png');
    expect(clientIconUrl({ ...haiku, url: 'https://other.example/?t={text}' })).toBe(
      'https://other.example/favicon.ico'
    );
    expect(clientIconUrl({ ...haiku, url: 'not a url' })).toBeNull();
  });
});

describe('sanitizeClientLinks', () => {
  it('配列でなければ null（既定値を使う）', () => {
    expect(sanitizeClientLinks(undefined)).toBeNull();
    expect(sanitizeClientLinks({})).toBeNull();
  });

  it('形の合わない要素・重複 id を捨て、http(s) 以外のアイコンを外す', () => {
    expect(
      sanitizeClientLinks([
        { id: 'a', name: 'A', url: 'https://a/{text}', enabled: false },
        { id: 'a', name: 'dup', url: 'https://dup/{text}', enabled: true },
        { id: 'b', name: 'B', url: 'https://b/{text}', icon: 'javascript:alert(1)' },
        { id: 'c', name: 1, url: 'https://c/{text}' },
        null,
        'x'
      ])
    ).toEqual([
      { id: 'a', name: 'A', url: 'https://a/{text}', enabled: false },
      { id: 'b', name: 'B', url: 'https://b/{text}', enabled: true }
    ]);
  });

  it('空配列は空配列のまま（全部削除した状態を保つ）', () => {
    expect(sanitizeClientLinks([])).toEqual([]);
  });
});
