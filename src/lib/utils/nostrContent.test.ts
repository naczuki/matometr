import { describe, it, expect } from 'vitest';
import { nip19 } from 'nostr-tools';
import { isSafeUrl, parseNostrRefs, resolveTagRefs } from './nostrContent';

// isSafeUrl は「リンクとして安全に開いてよい URL か」を判定する。
// ユーザー投稿に javascript: などの危険な URL が混ざっても弾けることが大事
// （XSS の入口になるため）。ここはセキュリティ的に重要なテスト。
describe('isSafeUrl', () => {
  it('http / https は安全とみなす', () => {
    expect(isSafeUrl('http://example.com')).toBe(true);
    expect(isSafeUrl('https://example.com/path?a=1')).toBe(true);
  });

  it('javascript: スキームは危険なので false', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
  });

  it('data: スキームも false', () => {
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('URL として壊れている文字列は false', () => {
    expect(isSafeUrl('not a url')).toBe(false);
  });
});

const ID = 'a'.repeat(64);
const quotesOf = (text: string, tags: string[][] = []) =>
  parseNostrRefs(text, undefined, tags).filter((s) => s.type === 'quote');

describe('parseNostrRefs のリレーヒント', () => {
  it('nevent のヒントを引用に持たせる', () => {
    const ne = nip19.neventEncode({ id: ID, relays: ['wss://a.example/'] });
    expect(quotesOf(`見て nostr:${ne}`)).toEqual([
      { type: 'quote', eventId: ID, relays: ['wss://a.example/'] }
    ]);
  });

  it('ヒントの無い note1 は q タグのヒントで補う', () => {
    const note = nip19.noteEncode(ID);
    const tags = [
      ['q', ID, 'wss://q.example/'],
      ['q', 'b'.repeat(64), 'wss://other.example/']
    ];
    expect(quotesOf(`nostr:${note}`, tags)).toEqual([
      { type: 'quote', eventId: ID, relays: ['wss://q.example/'] }
    ]);
  });

  it('nevent のヒントに q タグのヒントを重複なく足す', () => {
    const ne = nip19.neventEncode({ id: ID, relays: ['wss://a.example/'] });
    const tags = [
      ['q', ID, 'wss://a.example/'],
      ['q', ID, 'wss://q.example/']
    ];
    expect(quotesOf(`nostr:${ne}`, tags)[0]).toMatchObject({
      relays: ['wss://a.example/', 'wss://q.example/']
    });
  });

  it('ws(s) でない q タグのヒントは無視する', () => {
    const note = nip19.noteEncode(ID);
    expect(quotesOf(`nostr:${note}`, [['q', ID, 'https://example.com/']])[0]).toMatchObject({
      relays: []
    });
  });
});

describe('resolveTagRefs', () => {
  it('e タグのリレーヒントを nevent に含める', () => {
    const out = resolveTagRefs('#[0]', [['e', ID, 'wss://e.example/']]);
    expect(quotesOf(out)).toEqual([{ type: 'quote', eventId: ID, relays: ['wss://e.example/'] }]);
  });

  it('e タグにヒントが無ければヒント無しの nevent にする', () => {
    const out = resolveTagRefs('#[0]', [['e', ID, '']]);
    expect(quotesOf(out)).toEqual([{ type: 'quote', eventId: ID, relays: [] }]);
  });
});
