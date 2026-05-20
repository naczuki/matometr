import { createRxNostr } from 'rx-nostr';
import { get } from 'svelte/store';
import { relays } from '$lib/stores/relays';

export function createClient() {
  const rxNostr = createRxNostr();
  rxNostr.setDefaultRelays(get(relays));
  return rxNostr;
}
