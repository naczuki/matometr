import { describe, it, expect } from 'vitest';
import {
  DEFAULT_OPEN_CLIENTS,
  DEFAULT_SHARE_CLIENTS,
  clientIconCandidates,
  iconPageUrl,
  isNostrUri,
  fillOpenUrl,
  fillShareUrl,
  isUsable,
  sanitizeClientLinks,
  validateName,
  validateUrl,
  settingsDataFromJson,
  settingsDataToJson,
  hasUnsavedChanges,
  decideOnOpen,
  decideOnEnable,
  remoteChangedSinceSync,
  emptySettingsData,
  updateLink,
  addLink,
  removeLink,
  resetKind,
  sameSettingsData,
  isInitialState,
  type ClientLink,
  type LocalSettingsState
} from './clientLinks';

describe('既定値', () => {
  it('既定のシェア先・「○○で開く」はすべて正しい名前と URL を持つ', () => {
    for (const c of DEFAULT_SHARE_CLIENTS) expect(isUsable('share', c)).toBe(true);
    for (const c of DEFAULT_OPEN_CLIENTS) {
      expect(validateName(c.name)).toBeNull();
      expect(validateUrl('open', c.url)).toBeNull();
    }
  });

  it('「○○で開く」の既定は nostter（表示）と nostr: のアプリ（非表示）', () => {
    expect(DEFAULT_OPEN_CLIENTS.map((c) => [c.url, c.enabled])).toEqual([
      ['https://nostter.app/{nevent}', true],
      ['nostr:{nevent}', false]
    ]);
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

  it('http(s) 以外のスキームは受け付けない（「○○で開く」だけ nostr: も可）', () => {
    expect(validateUrl('open', 'javascript:alert(1)//{nevent}')).not.toBeNull();
    expect(validateUrl('share', 'data:text/html,{text}')).not.toBeNull();
    expect(validateUrl('share', '  ')).not.toBeNull();
    expect(validateUrl('open', 'nostr:{nevent}')).toBeNull();
    expect(validateUrl('open', 'NOSTR:{note}')).toBeNull();
    expect(validateUrl('open', 'nostr:')).not.toBeNull();
    expect(validateUrl('share', 'nostr:{text}')).not.toBeNull();
  });

  it('isNostrUri', () => {
    expect(isNostrUri('nostr:{nevent}')).toBe(true);
    expect(isNostrUri(' nostr:x')).toBe(true);
    expect(isNostrUri('https://nostr.example/')).toBe(false);
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

describe('iconPageUrl', () => {
  it('プレースホルダ・クエリ・フラグメントを除いたページの URL', () => {
    expect(iconPageUrl('https://nokakoi.com/app/?text={text}')).toBe('https://nokakoi.com/app/');
    expect(iconPageUrl('https://nostter.app/post?content={text}')).toBe('https://nostter.app/post');
    expect(iconPageUrl('https://nostter.app/{nevent}')).toBe('https://nostter.app/');
    expect(iconPageUrl('https://example.com/e/{id}#x')).toBe('https://example.com/e/');
  });

  it('http(s) でなければ null', () => {
    expect(iconPageUrl('nostr:{nevent}')).toBeNull();
    expect(iconPageUrl('not a url')).toBeNull();
  });
});

describe('clientIconCandidates', () => {
  const api = '/api/favicon';

  it('既定アイコン（同じサイトのときだけ）→ サーバーで探したアイコン の順', () => {
    const haiku = DEFAULT_SHARE_CLIENTS.find((c) => c.id === 'noshaiku')!;
    expect(clientIconCandidates(haiku, api)).toEqual([
      'https://nos-haiku.vercel.app/favicon.png',
      '/api/favicon?url=' + encodeURIComponent('https://nos-haiku.vercel.app/antenna') + '&v=2'
    ]);
    expect(clientIconCandidates({ ...haiku, url: 'https://other.example/?t={text}' }, api)).toEqual(
      ['/api/favicon?url=' + encodeURIComponent('https://other.example/') + '&v=2']
    );
  });

  it('nokakoi の既定アイコンはアプリのアイコン', () => {
    const nokakoi = DEFAULT_SHARE_CLIENTS.find((c) => c.id === 'nokakoi')!;
    expect(clientIconCandidates(nokakoi, api)[0]).toBe('https://nokakoi.com/app/icon/nokakoi.png');
  });

  it('URL が不正・nostr: なら候補なし', () => {
    const link: ClientLink = { id: 'x', name: 'x', url: 'not a url', enabled: true };
    expect(clientIconCandidates(link, api)).toEqual([]);
    expect(clientIconCandidates({ ...link, url: 'nostr:{nevent}' }, api)).toEqual([]);
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

describe('settingsDataToJson / settingsDataFromJson', () => {
  const link: ClientLink = { id: 'a', name: 'A', url: 'https://a/{text}', enabled: true };

  it('変更していない種類（null）は書かず、読み戻すと null に戻る', () => {
    const json = settingsDataToJson({ share: [link], open: null });
    expect(json).toEqual({ v: 1, share: [link] });
    expect(settingsDataFromJson(JSON.parse(JSON.stringify(json)))).toEqual({
      share: [link],
      open: null
    });
  });

  it('全部削除した状態（空配列）も保てる', () => {
    expect(settingsDataFromJson(settingsDataToJson({ share: [], open: [] }))).toEqual({
      share: [],
      open: []
    });
  });

  it('形式バージョンが違う・オブジェクトでなければ null', () => {
    expect(settingsDataFromJson({ v: 2, share: [] })).toBeNull();
    expect(settingsDataFromJson('x')).toBeNull();
    expect(settingsDataFromJson(null)).toBeNull();
  });
});

describe('hasUnsavedChanges', () => {
  const untouched: LocalSettingsState = { data: emptySettingsData(), updatedAt: 0 };
  const edited: LocalSettingsState = { data: { share: [], open: null }, updatedAt: 5000 };

  it('同期記録があれば、そのときから設定が変わったかで決まる', () => {
    expect(hasUnsavedChanges(edited, { remoteCreatedAt: 1, localUpdatedAt: 5000 })).toBe(false);
    expect(hasUnsavedChanges(edited, { remoteCreatedAt: 1, localUpdatedAt: 4000 })).toBe(true);
  });

  it('同期記録が無ければ、一度でも変えていれば未保存', () => {
    expect(hasUnsavedChanges(untouched, undefined)).toBe(false);
    expect(hasUnsavedChanges(edited, undefined)).toBe(true);
  });
});

describe('decideOnOpen', () => {
  const untouched: LocalSettingsState = { data: emptySettingsData(), updatedAt: 0 };
  const editedAt = (sec: number): LocalSettingsState => ({
    data: { share: [], open: null },
    updatedAt: sec * 1000
  });

  it('前回そろえた後に他の端末で保存されていなければ何もしない', () => {
    const record = { remoteCreatedAt: 100, localUpdatedAt: 0 };
    expect(decideOnOpen(100, untouched, record)).toBe('up-to-date');
    expect(decideOnOpen(90, untouched, record)).toBe('up-to-date');
    expect(decideOnOpen(101, untouched, record)).toBe('apply');
  });

  it('送れていない変更があれば、新しい方を使う', () => {
    const record = { remoteCreatedAt: 100, localUpdatedAt: 1000 };
    expect(decideOnOpen(200, editedAt(300), record)).toBe('keep-local');
    expect(decideOnOpen(200, editedAt(150), record)).toBe('apply');
  });

  it('この端末で同期したことが無ければ読み込む', () => {
    expect(decideOnOpen(100, untouched, undefined)).toBe('apply');
  });
});

describe('decideOnEnable', () => {
  const untouched: LocalSettingsState = { data: emptySettingsData(), updatedAt: 0 };
  const edited: LocalSettingsState = { data: { share: [], open: null }, updatedAt: 5000 };

  it('他の端末の設定が無ければ、この端末の設定を送る', () => {
    expect(decideOnEnable(null, edited, undefined)).toBe('push');
    expect(decideOnEnable(null, untouched, undefined)).toBe('push');
  });

  it('この端末が初期状態なら、他の端末の設定を読み込む', () => {
    expect(decideOnEnable(100, untouched, undefined)).toBe('apply');
  });

  it('設定を変えてある端末で初めて同期をオンにするときは聞く', () => {
    expect(decideOnEnable(100, edited, undefined)).toBe('ask');
  });

  it('前に同期していた端末', () => {
    const record = { remoteCreatedAt: 100, localUpdatedAt: 5000 };
    // どちらも変わっていない
    expect(decideOnEnable(100, edited, record)).toBe('none');
    // 他の端末だけ変わった
    expect(decideOnEnable(200, edited, record)).toBe('apply');
    // この端末だけ変わった
    expect(decideOnEnable(100, { ...edited, updatedAt: 6000 }, record)).toBe('push');
    // どちらも変わった
    expect(decideOnEnable(200, { ...edited, updatedAt: 6000 }, record)).toBe('ask');
  });
});

describe('remoteChangedSinceSync', () => {
  it('同期記録が無ければ、Nostr に設定があるだけで「更新あり」', () => {
    expect(remoteChangedSinceSync(100, undefined)).toBe(true);
  });

  it('前回そろえた created_at より新しいときだけ「更新あり」', () => {
    const record = { remoteCreatedAt: 100, localUpdatedAt: 0 };
    expect(remoteChangedSinceSync(100, record)).toBe(false);
    expect(remoteChangedSinceSync(101, record)).toBe(true);
  });
});

describe('下書きの編集（updateLink / addLink / removeLink / resetKind）', () => {
  it('既定値のままの種類を編集すると、既定値から始めて書き換える', () => {
    const edited = updateLink(emptySettingsData(), 'open', 'nostter', { enabled: false });
    expect(edited.open).toEqual([
      { ...DEFAULT_OPEN_CLIENTS[0], enabled: false },
      { ...DEFAULT_OPEN_CLIENTS[1] }
    ]);
    expect(edited.share).toBeNull();
  });

  it('追加・削除・デフォルトに戻す', () => {
    let data = addLink(emptySettingsData(), 'open', {
      id: 'x',
      name: ' njump ',
      url: ' https://njump.me/{nevent} '
    });
    expect(data.open?.map((c) => [c.id, c.name, c.url, c.enabled])).toEqual([
      ['nostter', 'nostter', 'https://nostter.app/{nevent}', true],
      ['nostr-app', 'アプリ', 'nostr:{nevent}', false],
      ['x', 'njump', 'https://njump.me/{nevent}', true]
    ]);
    data = removeLink(data, 'open', 'nostter');
    expect(data.open?.map((c) => c.id)).toEqual(['nostr-app', 'x']);
    expect(resetKind(data, 'open').open).toBeNull();
  });

  it('元のデータは書き換えない', () => {
    const original = { share: null, open: [{ ...DEFAULT_OPEN_CLIENTS[0] }] };
    updateLink(original, 'open', 'nostter', { name: '変更' });
    expect(original.open[0].name).toBe('nostter');
  });
});

describe('sameSettingsData / isInitialState', () => {
  it('内容が同じなら別オブジェクトでも同じ', () => {
    const a = addLink(emptySettingsData(), 'open', { id: 'x', name: 'a', url: 'https://a/{id}' });
    const b = addLink(emptySettingsData(), 'open', { id: 'x', name: 'a', url: 'https://a/{id}' });
    expect(sameSettingsData(a, b)).toBe(true);
    expect(sameSettingsData(a, emptySettingsData())).toBe(false);
  });

  it('一度も変えていない端末だけが初期状態', () => {
    expect(isInitialState({ data: emptySettingsData(), updatedAt: 0 })).toBe(true);
    expect(isInitialState({ data: emptySettingsData(), updatedAt: 1 })).toBe(false);
    expect(isInitialState({ data: { share: [], open: null }, updatedAt: 0 })).toBe(false);
  });
});
