import { describe, it, expect } from 'vitest';
import { resolveReplyParentId } from './nostr';
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
});
