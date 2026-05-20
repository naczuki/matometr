import { createRxNostr, createRxOneshotReq, createRxForwardReq, uniq } from 'rx-nostr';
import type { RxNostr } from 'rx-nostr';
import type { Observable } from 'rxjs';
import { map, filter, tap } from 'rxjs';
import { verifyEvent } from 'nostr-tools';
import { DEFAULT_RELAYS } from '$lib/stores/relays';
import { Matome } from '$lib/entities/Matome';

let _client: RxNostr | null = null;

function getClient(): RxNostr {
  if (_client) return _client;
  _client = createRxNostr({
    verifier: async (event) => verifyEvent(event as Parameters<typeof verifyEvent>[0])
  });
  _client.setDefaultRelays(DEFAULT_RELAYS);
  console.log('[NostrClient] initialized. relays:', DEFAULT_RELAYS);
  return _client;
}

/**
 * kind:30023 + t:matometr のまとめ一覧を取得。
 * リレーから EOSE が届いた時点で Observable が complete する。
 */
export function fetchMatomeList(limit = 30): Observable<Matome> {
  const client = getClient();
  const rxReq = createRxOneshotReq({
    filters: {
      kinds: [30023],
      '#t': ['matometr'],
      limit
    }
  });

  return client.use(rxReq).pipe(
    uniq(),
    tap(({ event, from }) => {
      const title = event.tags.find(([k]) => k === 'title')?.[1] ?? '(no title)';
      console.log(`[NostrClient] EVENT | relay: ${from} | id: ${event.id.slice(0, 8)}… | title: ${title}`);
    }),
    map(({ event }) => Matome.fromEvent(event)),
    filter((m): m is Matome => m !== null)
  );
}

/**
 * kind:30023 + t:matometr の新着をリアルタイム購読。
 * 返値の Observable を subscribe した Subscription を unsubscribe() して終了すること。
 */
export function watchNewMatome(): Observable<Matome> {
  const client = getClient();
  const rxReq = createRxForwardReq();

  const obs = client.use(rxReq).pipe(
    uniq(),
    tap(({ event }) => console.log(`[NostrClient] NEW EVENT | id: ${event.id.slice(0, 8)}…`)),
    map(({ event }) => Matome.fromEvent(event)),
    filter((m): m is Matome => m !== null)
  );

  rxReq.emit({ kinds: [30023], '#t': ['matometr'] });

  return obs;
}

/**
 * nosli 互換まとめ（t:nosli）を取得。
 * eタグ有り・コメントなしのため閲覧のみ（編集は nosli へ誘導）。
 */
export function fetchNosliList(limit = 10): Observable<Matome> {
  const client = getClient();
  const rxReq = createRxOneshotReq({
    filters: {
      kinds: [30023],
      '#t': ['nosli'],
      limit
    }
  });

  return client.use(rxReq).pipe(
    uniq(),
    map(({ event }) => Matome.fromEvent(event)),
    filter((m): m is Matome => m !== null)
  );
}
