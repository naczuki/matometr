import { createRxOneshotReq, uniq } from 'rx-nostr';
import { EMPTY, merge, Observable } from 'rxjs';
import { map, filter, take } from 'rxjs';
import { nip19 } from 'nostr-tools';
import type { AddressPointer } from 'nostr-tools/nip19';
import { DEFAULT_RELAYS, SEARCH_RELAYS } from '$lib/stores/relays';
import { Matome } from '$lib/entities/Matome';
import type { UserProfile, Note } from '$lib/types';
import { toNote, withRelays, HEX_64, getClient } from './nostrCore';

export function fetchMatomeListWithRelay(
  limit = 30,
  until?: number,
  relays?: string[]
): Observable<{ matome: Matome; relay: string }> {
  const client = getClient();
  const f = {
    kinds: [30023],
    '#t': ['matometr'],
    limit,
    ...(until !== undefined ? { until } : {})
  };
  const rxReq = createRxOneshotReq({ filters: f });
  const useOpts =
    relays && relays.length > 0
      ? { on: { relays, defaultReadRelays: false } }
      : undefined;
  return client.use(rxReq, useOpts).pipe(
    map(({ event, from }) => {
      const matome = Matome.fromEvent(event);
      return matome ? { matome, relay: from } : null;
    }),
    filter((r): r is { matome: Matome; relay: string } => r !== null)
  );
}

export function fetchMatomeByAddress(pointer: AddressPointer): Observable<Matome> {
  const client = getClient();
  const rxReq = createRxOneshotReq({
    filters: { kinds: [30023], authors: [pointer.pubkey], '#d': [pointer.identifier] }
  });
  return client.use(rxReq).pipe(
    map(({ event }) => Matome.fromEvent(event)),
    filter((m): m is Matome => m !== null),
    take(1)
  );
}

export function fetchNoteById(eventId: string): Observable<Note> {
  const client = getClient();
  const rxReq = createRxOneshotReq({
    filters: { ids: [eventId], limit: 1 }
  });
  return client.use(rxReq).pipe(
    map(({ event }) => toNote(event)),
    take(1)
  );
}

export function fetchNoteByIdWithRelay(eventId: string): Observable<{ note: Note; relay: string }> {
  const client = getClient();
  const rxReq = createRxOneshotReq({
    filters: { ids: [eventId], limit: 1 }
  });
  return client.use(rxReq).pipe(
    map(({ event, from }) => ({ note: toNote(event), relay: from })),
    take(1)
  );
}

export function fetchFollowList(pubkey: string): Observable<string[]> {
  const client = getClient();
  const rxReq = createRxOneshotReq({
    filters: { kinds: [3], authors: [pubkey], limit: 1 }
  });
  return client.use(rxReq).pipe(
    map(({ event }) => {
      const seen = new Set<string>();
      for (const tag of event.tags) {
        if (tag[0] === 'p' && tag[1] && HEX_64.test(tag[1])) seen.add(tag[1]);
      }
      return [...seen];
    }),
    take(1)
  );
}

export function fetchUserReadRelays(pubkey: string): Observable<string[]> {
  const client = getClient();
  const rxReq = createRxOneshotReq({
    filters: { kinds: [10002], authors: [pubkey], limit: 1 }
  });
  return client.use(rxReq).pipe(
    map(({ event }) => {
      const relays: string[] = [];
      for (const tag of event.tags) {
        if (tag[0] !== 'r' || !tag[1]) continue;
        if (tag[2] === 'write') continue;
        relays.push(tag[1]);
      }
      return relays;
    }),
    take(1)
  );
}

export function fetchNotesFromAuthors(
  authors: string[],
  options: { until?: number; limit?: number; relays?: string[] } = {}
): Observable<Note> {
  if (authors.length === 0) return EMPTY;
  const client = getClient();
  const { until, limit = 30, relays } = options;
  const f = until
    ? { kinds: [1], authors, limit, until }
    : { kinds: [1], authors, limit };
  const rxReq = createRxOneshotReq({ filters: f });

  return client.use(rxReq, withRelays(relays)).pipe(
    uniq(),
    map(({ event }) => toNote(event))
  );
}

export function fetchNotesFromAuthorsWithRelay(
  authors: string[],
  options: { until?: number; limit?: number; relays?: string[] } = {}
): Observable<{ note: Note; relay: string }> {
  if (authors.length === 0) return EMPTY;
  const client = getClient();
  const { until, limit = 30, relays } = options;
  const f = until
    ? { kinds: [1], authors, limit, until }
    : { kinds: [1], authors, limit };
  const rxReq = createRxOneshotReq({ filters: f });
  const useOpts =
    relays && relays.length > 0
      ? { on: { relays, defaultReadRelays: false } }
      : undefined;
  return client.use(rxReq, useOpts).pipe(
    uniq(),
    map(({ event, from }) => ({ note: toNote(event), relay: from }))
  );
}

export function fetchFavoriteReactions(
  pubkey: string,
  options: { until?: number; limit?: number; relays?: string[] } = {}
): Observable<{ eventId: string; reactedAt: number }> {
  const client = getClient();
  const { until, limit = 100, relays } = options;
  const reactionFilter = until
    ? { kinds: [7], authors: [pubkey], limit, until }
    : { kinds: [7], authors: [pubkey], limit };
  const rxReq = createRxOneshotReq({ filters: reactionFilter });

  return client.use(rxReq, withRelays(relays)).pipe(
    uniq(),
    map(({ event }) => {
      let eventId = '';
      for (const tag of event.tags) {
        if (tag[0] === 'e' && tag[1] && HEX_64.test(tag[1])) eventId = tag[1];
      }
      return eventId ? { eventId, reactedAt: event.created_at } : null;
    }),
    filter((r): r is { eventId: string; reactedAt: number } => r !== null)
  );
}

export function fetchFavoriteReactionsWithRelay(
  pubkey: string,
  options: { until?: number; limit?: number; relays?: string[] } = {}
): Observable<{ eventId: string; reactedAt: number; relay: string }> {
  const client = getClient();
  const { until, limit = 30, relays } = options;
  const reactionFilter = until
    ? { kinds: [7], authors: [pubkey], limit, until }
    : { kinds: [7], authors: [pubkey], limit };
  const rxReq = createRxOneshotReq({ filters: reactionFilter });
  const useOpts =
    relays && relays.length > 0
      ? { on: { relays, defaultReadRelays: false } }
      : undefined;

  return client.use(rxReq, useOpts).pipe(
    uniq(),
    map(({ event, from }) => {
      let eventId = '';
      for (const tag of event.tags) {
        if (tag[0] === 'e' && tag[1] && HEX_64.test(tag[1])) eventId = tag[1];
      }
      return eventId ? { eventId, reactedAt: event.created_at, relay: from } : null;
    }),
    filter(
      (r): r is { eventId: string; reactedAt: number; relay: string } => r !== null
    )
  );
}

export function fetchNotesByIds(
  ids: string[],
  options: { relays?: string[] } = {}
): Observable<Note> {
  if (ids.length === 0) return EMPTY;
  const client = getClient();
  const { relays } = options;
  const rxReq = createRxOneshotReq({
    filters: { ids, limit: ids.length }
  });

  return client.use(rxReq, withRelays(relays)).pipe(
    uniq(),
    map(({ event }) => toNote(event))
  );
}

export function fetchTagSearch(
  keyword: string,
  options: { until?: number; limit?: number; since?: number } = {}
): Observable<Note> {
  if (!keyword) return EMPTY;
  const client = getClient();
  const { until, limit = 30, since } = options;

  const tagFilter = {
    kinds: [1],
    '#t': [keyword],
    limit,
    ...(since != null ? { since } : {}),
    ...(until != null ? { until } : {})
  };
  const tagReq = createRxOneshotReq({ filters: tagFilter });
  const tagObs = client.use(tagReq, {
    on: { relays: DEFAULT_RELAYS, defaultReadRelays: false }
  }).pipe(uniq(), map(({ event }) => toNote(event)));

  const searchFilter = {
    kinds: [1],
    search: keyword,
    limit,
    ...(since != null ? { since } : {}),
    ...(until != null ? { until } : {})
  };
  const searchReq = createRxOneshotReq({ filters: searchFilter });
  const searchObs = client.use(searchReq, {
    on: { relays: [...SEARCH_RELAYS], defaultReadRelays: false }
  }).pipe(uniq(), map(({ event }) => toNote(event)));

  return merge(tagObs, searchObs);
}

export function fetchProfiles(pubkeys: string[]): Observable<UserProfile> {
  if (pubkeys.length === 0) return EMPTY;
  const client = getClient();
  const rxReq = createRxOneshotReq({
    filters: { kinds: [0], authors: pubkeys }
  });

  return client.use(rxReq).pipe(
    uniq(),
    map(({ event }) => {
      try {
        const meta = JSON.parse(event.content) as Record<string, unknown>;
        const emojis: Record<string, string> = {};
        for (const tag of event.tags) {
          const [k, shortcode, url] = tag;
          if (k === 'emoji' && shortcode && url && /^https?:\/\//i.test(url)) {
            emojis[shortcode] = url;
          }
        }
        const profile: UserProfile = {
          pubkey: event.pubkey,
          npub: nip19.npubEncode(event.pubkey),
          name: typeof meta.name === 'string' && meta.name ? meta.name : undefined,
          displayName:
            typeof meta.display_name === 'string' && meta.display_name
              ? meta.display_name
              : undefined,
          picture:
            typeof meta.picture === 'string' && meta.picture ? meta.picture : undefined,
          about: typeof meta.about === 'string' ? meta.about : undefined,
          nip05: typeof meta.nip05 === 'string' ? meta.nip05 : undefined,
          emojis: Object.keys(emojis).length > 0 ? emojis : undefined
        };
        return profile;
      } catch {
        return null;
      }
    }),
    filter((p): p is UserProfile => p !== null)
  );
}

export function fetchReactionCounts(
  matomes: { pubkey: string; dTag: string }[]
): Observable<Map<string, number>> {
  if (matomes.length === 0) return new Observable((s) => { s.next(new Map()); s.complete(); });
  const client = getClient();
  const aValues = matomes.map((m) => `30023:${m.pubkey}:${m.dTag}`);
  const rxReq = createRxOneshotReq({
    filters: { kinds: [7], '#a': aValues, limit: 5000 }
  });

  return new Observable((subscriber) => {
    const counts = new Map<string, number>();
    const seen = new Set<string>();

    const sub = client.use(rxReq).pipe(uniq()).subscribe({
      next({ event }) {
        if (seen.has(event.id)) return;
        seen.add(event.id);
        const aTag = event.tags.find(([k]) => k === 'a');
        if (aTag?.[1]) {
          counts.set(aTag[1], (counts.get(aTag[1]) ?? 0) + 1);
        }
      },
      error(err) { subscriber.error(err); },
      complete() {
        subscriber.next(counts);
        subscriber.complete();
      }
    });
    return () => sub.unsubscribe();
  });
}

export function fetchReactionsForMatome(
  pubkey: string,
  dTag: string,
  myPubkey: string | null
): Observable<{ count: number; myFaved: boolean }> {
  const client = getClient();
  const aTagValue = `30023:${pubkey}:${dTag}`;
  const rxReq = createRxOneshotReq({
    filters: { kinds: [7], '#a': [aTagValue], limit: 500 }
  });

  return new Observable((subscriber) => {
    const seen = new Set<string>();
    let myFaved = false;

    const sub = client.use(rxReq).pipe(uniq()).subscribe({
      next({ event }) {
        if (!seen.has(event.id)) {
          seen.add(event.id);
          if (myPubkey && event.pubkey === myPubkey) {
            myFaved = true;
          }
        }
      },
      error(err) { subscriber.error(err); },
      complete() {
        subscriber.next({ count: seen.size, myFaved });
        subscriber.complete();
      }
    });
    return () => sub.unsubscribe();
  });
}

export function fetchNosliListWithRelay(
  limit = 30,
  until?: number,
  relays?: string[]
): Observable<{ matome: Matome; relay: string }> {
  const client = getClient();
  const f = {
    kinds: [30023],
    '#t': ['nosli'],
    limit,
    ...(until !== undefined ? { until } : {})
  };
  const rxReq = createRxOneshotReq({ filters: f });
  const useOpts =
    relays && relays.length > 0
      ? { on: { relays, defaultReadRelays: false } }
      : undefined;
  return client.use(rxReq, useOpts).pipe(
    map(({ event, from }) => {
      const matome = Matome.fromEvent(event);
      return matome ? { matome, relay: from } : null;
    }),
    filter((r): r is { matome: Matome; relay: string } => r !== null)
  );
}

export function fetchUserMatomes(pubkey: string, limit = 50): Observable<Matome> {
  const client = getClient();

  function makeObs(tag: string): Observable<Matome> {
    const rxReq = createRxOneshotReq({
      filters: { kinds: [30023], authors: [pubkey], '#t': [tag], limit }
    });
    return client.use(rxReq).pipe(
      uniq(),
      map(({ event }) => Matome.fromEvent(event)),
      filter((m): m is Matome => m !== null)
    );
  }

  return merge(makeObs('matometr'), makeObs('nosli'));
}
