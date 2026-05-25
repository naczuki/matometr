import { createRxNostr, nip07Signer } from 'rx-nostr';
import type { RxNostr } from 'rx-nostr';
import { verifyEvent } from 'nostr-tools';
import { DEFAULT_RELAYS } from '$lib/stores/relays';
import type { Note } from '$lib/types';

export const HEX_64 = /^[0-9a-f]{64}$/;

export function toNote(event: { id: string; pubkey: string; content: string; created_at: number; tags: string[][]; kind: number }): Note {
  return { id: event.id, pubkey: event.pubkey, content: event.content, createdAt: event.created_at, tags: event.tags, kind: event.kind };
}

export function withRelays(relays?: string[]): { on: { relays: string[]; defaultReadRelays: boolean } } | undefined {
  return relays && relays.length > 0 ? { on: { relays, defaultReadRelays: true } } : undefined;
}

let _client: RxNostr | null = null;

export function getClient(): RxNostr {
  if (_client) return _client;
  _client = createRxNostr({
    verifier: async (event) => verifyEvent(event as Parameters<typeof verifyEvent>[0]),
    eoseTimeout: 6000
  });
  _client.setDefaultRelays(DEFAULT_RELAYS);
  console.log('[NostrClient] initialized. relays:', DEFAULT_RELAYS);
  return _client;
}

export async function sendToRelays(eventParams: {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    console.log('[sendToRelays] event:', JSON.stringify(eventParams, null, 2));
    if (localStorage.getItem('debug:dryrun') === '1') {
      console.warn('[sendToRelays] dry-run mode — イベントは送信されませんでした');
      resolve();
      return;
    }
    let published = false;
    const sub = getClient()
      .send(eventParams, { signer: nip07Signer() })
      .subscribe({
        next(p) {
          if (p.ok && !published) {
            published = true;
            sub.unsubscribe();
            resolve();
          }
        },
        error: reject,
        complete() {
          if (!published) reject(new Error('リレーに公開できませんでした'));
        },
      });

    setTimeout(() => {
      if (!published) {
        sub.unsubscribe();
        reject(new Error('タイムアウト：リレーに接続できませんでした'));
      }
    }, 20_000);
  });
}
