import type { NostrEvent } from 'nostr-tools';

declare global {
  namespace svelteHTML {
    interface IntrinsicElements {
      'nostr-share': {
        'data-text'?: string;
        'data-type'?: 'mini' | 'icon';
        style?: string;
        class?: string;
      };
    }
  }

  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: Omit<NostrEvent, 'id' | 'sig' | 'pubkey'>): Promise<NostrEvent>;
      getRelays?(): Promise<Record<string, { read: boolean; write: boolean }>>;
      nip04?: {
        encrypt(pubkey: string, plaintext: string): Promise<string>;
        decrypt(pubkey: string, ciphertext: string): Promise<string>;
      };
    };
  }
}

declare namespace App {
  // interface Error {}
  // interface Locals {}
  // interface PageData {}
  // interface Platform {}
}

export {};
