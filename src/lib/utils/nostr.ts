import { nip19 } from 'nostr-tools';
import { DEFAULT_RELAYS_JP } from '$lib/stores/relays';
import type { Note } from '$lib/types';

const HEX_64 = /^[0-9a-f]{64}$/;

export function resolveRepostTarget(note: Note): { eventId: string; relay: string } | null {
  if (note.kind !== 6 && note.kind !== 16) return null;
  let targetId = '';
  let relay = '';
  for (const tag of note.tags) {
    if (tag[0] === 'e' && tag[1] && HEX_64.test(tag[1])) {
      targetId = tag[1];
      relay = tag[2] ?? '';
    }
  }
  if (!targetId) return null;
  return { eventId: targetId, relay };
}

export function parseNostrInput(raw: string): string | null {
  const m = raw.trim().match(/(nevent1[a-z0-9]+|note1[a-z0-9]+)/);
  if (!m) return null;
  try {
    const decoded = nip19.decode(m[1]);
    if (decoded.type === 'nevent') return `nostr:${m[1]}`;
    if (decoded.type === 'note') {
      const nevent = nip19.neventEncode({ id: decoded.data, relays: [DEFAULT_RELAYS_JP[0]] });
      return `nostr:${nevent}`;
    }
  } catch { /* invalid bech32 */ }
  return null;
}

export function eventIdFromNevent(neventStr: string): string | null {
  const m = neventStr.match(/nostr:(nevent1[a-z0-9]+)/);
  if (!m) return null;
  try {
    const decoded = nip19.decode(m[1]);
    if (decoded.type === 'nevent') return decoded.data.id;
  } catch { /* invalid */ }
  return null;
}

export function shortNpubFromPubkey(pubkey: string): string {
  if (!pubkey) return '…';
  try {
    const npub = nip19.npubEncode(pubkey);
    return npub.slice(0, 8) + '…' + npub.slice(-4);
  } catch {
    return pubkey.slice(0, 8) + '…';
  }
}

export function shortNpub(npub: string | undefined): string {
  if (!npub) return '…';
  return npub.slice(0, 8) + '…' + npub.slice(-4);
}

export function externalNoteUrl(nevent: string): string {
  return `https://nostter.app/${nevent}`;
}

export function externalNpubUrl(npub: string): string {
  return `https://nostter.app/${npub}`;
}

export function neventFor(note: Note, relays: string[] = []): string {
  try {
    return `nostr:${nip19.neventEncode({
      id: note.id,
      author: note.pubkey,
      relays: relays.length > 0 ? relays.slice(0, 1) : undefined
    })}`;
  } catch {
    return `nostr:${nip19.noteEncode(note.id)}`;
  }
}
