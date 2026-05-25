import { writable, get } from 'svelte/store';
import type { UserProfile } from '$lib/types';
import { fetchProfiles } from '$lib/services/NostrClient';

export const profiles = writable<Map<string, UserProfile>>(new Map());

const pending = new Set<string>();
const queue = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function requestProfile(pubkey: string): void {
  if (get(profiles).has(pubkey) || pending.has(pubkey)) return;
  pending.add(pubkey);
  queue.add(pubkey);
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 50);
}

function flush(): void {
  timer = null;
  const pubkeys = [...queue];
  queue.clear();
  if (pubkeys.length === 0) return;

  fetchProfiles(pubkeys).subscribe({
    next: (profile) => {
      profiles.update((m) => {
        m.set(profile.pubkey, profile);
        return m;
      });
      pending.delete(profile.pubkey);
    },
    error: () => pubkeys.forEach((pk) => pending.delete(pk)),
    complete: () => pubkeys.forEach((pk) => pending.delete(pk))
  });
}
