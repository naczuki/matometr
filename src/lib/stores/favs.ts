import { writable, get } from 'svelte/store';

const _faved = writable<Map<string, number>>(new Map());

export const favedMatomes = { subscribe: _faved.subscribe };

function toKey(pubkey: string, dTag: string): string {
  return `30023:${pubkey}:${dTag}`;
}

export function markFaved(pubkey: string, dTag: string): void {
  _faved.update((m) => {
    const key = toKey(pubkey, dTag);
    m.set(key, (m.get(key) ?? 0) + 1);
    return new Map(m);
  });
}

export function getFavDelta(pubkey: string, dTag: string): number {
  return get(_faved).get(toKey(pubkey, dTag)) ?? 0;
}
