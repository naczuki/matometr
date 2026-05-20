import { writable } from 'svelte/store';

export const DEFAULT_RELAYS_JP = [
  'wss://relay-jp.nostr.wirednet.jp/',
  'wss://yabu.me/',
  'wss://r.kojira.io/',
  'wss://nrelay-jp.c-stellar.net/'
] as const;

export const DEFAULT_RELAYS_GLOBAL = ['wss://nos.lol/', 'wss://relay.damus.io/'] as const;

export const DEFAULT_RELAYS = [...DEFAULT_RELAYS_JP, ...DEFAULT_RELAYS_GLOBAL];

export const SEARCH_RELAYS = [
  'wss://search.nos.today/',
  'wss://nostr.wine/',
  'wss://cagliostr.compile-error.net/'
] as const;

export const relays = writable<string[]>(DEFAULT_RELAYS);
