import { describe, it, expect } from 'vitest';
import { resolveReplyParentId, isKind1Comment, isEmbeddableNote } from './nostr';
import type { Note } from '$lib/types';

const ID_A = 'a'.repeat(64);
const ID_B = 'b'.repeat(64);
const ID_C = 'c'.repeat(64);

function note(partial: Partial<Note>): Note {
  return {
    id: 'f'.repeat(64),
    pubkey: '1'.repeat(64),
    content: '',
    createdAt: 0,
    tags: [],
    kind: 1,
    ...partial
  };
}

describe('resolveReplyParentId', () => {
  it('returns reply-marked e tag over root', () => {
    const n = note({
      tags: [
        ['e', ID_A, '', 'root'],
        ['e', ID_B, '', 'reply']
      ]
    });
    expect(resolveReplyParentId(n)).toBe(ID_B);
  });

  it('falls back to root marker when no reply marker', () => {
    const n = note({ tags: [['e', ID_A, '', 'root']] });
    expect(resolveReplyParentId(n)).toBe(ID_A);
  });

  it('uses the last e tag for legacy (unmarked) tags', () => {
    const n = note({
      tags: [
        ['e', ID_A],
        ['e', ID_B],
        ['e', ID_C]
      ]
    });
    expect(resolveReplyParentId(n)).toBe(ID_C);
  });

  it('returns null when there are no e tags', () => {
    expect(resolveReplyParentId(note({ tags: [['p', '2'.repeat(64)]] }))).toBeNull();
  });

  it('returns null for non kind:1 events', () => {
    const n = note({ kind: 6, tags: [['e', ID_A]] });
    expect(resolveReplyParentId(n)).toBeNull();
  });

  it('ignores malformed e tag ids', () => {
    const n = note({ tags: [['e', 'not-hex']] });
    expect(resolveReplyParentId(n)).toBeNull();
  });

  it('returns lowercase e tag for kind:1111 comment rooted at kind:1', () => {
    const n = note({
      kind: 1111,
      tags: [
        ['E', ID_A, '', '1'.repeat(64)],
        ['K', '1'],
        ['e', ID_B, '', '1'.repeat(64)],
        ['k', '1111']
      ]
    });
    expect(resolveReplyParentId(n)).toBe(ID_B);
  });

  it('returns null for kind:1111 comment rooted at other kinds', () => {
    const n = note({
      kind: 1111,
      tags: [
        ['K', '30023'],
        ['e', ID_B],
        ['k', '30023']
      ]
    });
    expect(resolveReplyParentId(n)).toBeNull();
  });
});

describe('isKind1Comment', () => {
  it('accepts kind:1111 whose root kind is 1', () => {
    expect(
      isKind1Comment(
        note({
          kind: 1111,
          tags: [
            ['K', '1'],
            ['k', '1']
          ]
        })
      )
    ).toBe(true);
  });

  it('accepts replies to comments within a kind:1 thread', () => {
    expect(
      isKind1Comment(
        note({
          kind: 1111,
          tags: [
            ['K', '1'],
            ['k', '1111']
          ]
        })
      )
    ).toBe(true);
  });

  it('rejects kind:1111 rooted at other kinds or without K tag', () => {
    expect(isKind1Comment(note({ kind: 1111, tags: [['K', '30023']] }))).toBe(false);
    expect(isKind1Comment(note({ kind: 1111, tags: [['k', '1']] }))).toBe(false);
  });

  it('rejects non-1111 kinds', () => {
    expect(isKind1Comment(note({ kind: 1, tags: [['K', '1']] }))).toBe(false);
  });
});

describe('isEmbeddableNote', () => {
  it('accepts kind:1 and kind:1111 rooted at kind:1', () => {
    expect(isEmbeddableNote(note({ kind: 1 }))).toBe(true);
    expect(isEmbeddableNote(note({ kind: 1111, tags: [['K', '1']] }))).toBe(true);
  });

  it('rejects other kinds', () => {
    for (const kind of [6, 16, 20, 30023]) {
      expect(isEmbeddableNote(note({ kind }))).toBe(false);
    }
    expect(isEmbeddableNote(note({ kind: 1111, tags: [['K', '30023']] }))).toBe(false);
  });
});
