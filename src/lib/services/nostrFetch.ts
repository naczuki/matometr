import { createRxOneshotReq, uniq } from 'rx-nostr';
import { EMPTY, merge, concat, defer, timer, Observable, forkJoin, Subscription } from 'rxjs';
import {
  map,
  filter,
  take,
  scan,
  reduce,
  switchMap,
  distinctUntilChanged,
  takeUntil,
  defaultIfEmpty
} from 'rxjs';
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
    relays && relays.length > 0 ? { on: { relays, defaultReadRelays: false } } : undefined;
  return client.use(rxReq, useOpts).pipe(
    map(({ event, from }) => {
      const matome = Matome.fromEvent(event);
      return matome ? { matome, relay: from } : null;
    }),
    filter((r): r is { matome: Matome; relay: string } => r !== null)
  );
}

// 置換可能イベントは複数リレーから新旧バージョンが届きうるため、
// その時点で最新（created_at 最大）のものだけを下流へ流す。
// 最初の応答は即座に流れ、より新しい版が後から届けば再度流れる。
function latestByCreatedAt<P extends { event: { id: string; created_at: number } }>() {
  return (source: Observable<P>): Observable<P> =>
    source.pipe(
      scan<P, P | null>(
        (best, cur) => (best && best.event.created_at >= cur.event.created_at ? best : cur),
        null
      ),
      filter((p): p is P => p !== null),
      distinctUntilChanged((a, b) => a.event.id === b.event.id)
    );
}

export function fetchMatomeByAddress(pointer: AddressPointer): Observable<Matome> {
  const client = getClient();
  const rxReq = createRxOneshotReq({
    filters: { kinds: [30023], authors: [pointer.pubkey], '#d': [pointer.identifier] }
  });
  // naddr に埋め込まれたリレーヒントがあれば既定リレーに足す（無ければ既定のみ）
  return client.use(rxReq, withRelays(pointer.relays)).pipe(
    latestByCreatedAt(),
    map(({ event }) => Matome.fromEvent(event)),
    filter((m): m is Matome => m !== null)
  );
}

// 段階取得の 1 段あたりの上限。rx-nostr の eoseTimeout は他の購読のイベント受信でも
// リセットされるため、応答しないリレーがあると段が閉じず次の段へ進めないことがある。
const STAGE_LIMIT_MS = 6_000;

const relayKey = (url: string): string => url.replace(/\/+$/, '');
const sameRelay = (a: string, b: string): boolean => relayKey(a) === relayKey(b);

/**
 * 投稿の表示用取得。まず既定リレーで探し、見つからなければ nevent のリレーヒント
 * （既定リレーと重なるものは除く）だけに問い合わせる。どこにも無ければ何も流さず complete する。
 */
export function fetchNoteWithHintFallback(
  eventId: string,
  hintRelays?: string[]
): Observable<{ note: Note; relay: string }> {
  const client = getClient();
  const filters = { ids: [eventId], limit: 1 };
  const hints = (hintRelays ?? []).filter((h) => !DEFAULT_RELAYS.some((d) => sameRelay(d, h)));

  const fromDefaults = client
    .use(createRxOneshotReq({ filters }))
    .pipe(takeUntil(timer(STAGE_LIMIT_MS)));
  const fromHints =
    hints.length > 0
      ? client
          .use(createRxOneshotReq({ filters }), {
            on: { relays: hints, defaultReadRelays: false }
          })
          .pipe(takeUntil(timer(STAGE_LIMIT_MS)))
      : EMPTY;

  // concat は前段が complete してから次段を購読するので、ヒントへの REQ は既定リレーで
  // 見つからなかったときだけ飛ぶ。
  return concat(fromDefaults, fromHints).pipe(
    take(1),
    map(({ event, from }) => ({ note: toNote(event), relay: from }))
  );
}

/**
 * 投稿に作者本人の削除要求（NIP-09 の kind:5）があるか。既定リレーとリレーヒントに問い合わせる。
 * 作者以外の kind:5 は削除として扱わない。
 */
export function fetchHasDeletion(
  eventId: string,
  author: string,
  hintRelays?: string[]
): Observable<boolean> {
  const client = getClient();
  const rxReq = createRxOneshotReq({
    filters: { kinds: [5], authors: [author], '#e': [eventId], limit: 1 }
  });
  return client.use(rxReq, withRelays(hintRelays)).pipe(
    takeUntil(timer(STAGE_LIMIT_MS)),
    filter(({ event }) => event.pubkey === author),
    take(1),
    map(() => true),
    defaultIfEmpty(false)
  );
}

export function fetchFollowList(pubkey: string): Observable<string[]> {
  const client = getClient();
  const rxReq = createRxOneshotReq({
    filters: { kinds: [3], authors: [pubkey], limit: 1 }
  });
  return client.use(rxReq).pipe(
    latestByCreatedAt(),
    map(({ event }) => {
      const seen = new Set<string>();
      for (const tag of event.tags) {
        if (tag[0] === 'p' && tag[1] && HEX_64.test(tag[1])) seen.add(tag[1]);
      }
      return [...seen];
    })
  );
}

// NIP-65（kind:10002）の r タグから read / write 用のリレーを取り出す。マーカー無しは両用。
function fetchUserRelays(pubkey: string, usage: 'read' | 'write'): Observable<string[]> {
  const client = getClient();
  const rxReq = createRxOneshotReq({
    filters: { kinds: [10002], authors: [pubkey], limit: 1 }
  });
  const other = usage === 'read' ? 'write' : 'read';
  return client.use(rxReq).pipe(
    latestByCreatedAt(),
    map(({ event }) => {
      const relays: string[] = [];
      for (const tag of event.tags) {
        if (tag[0] !== 'r' || !tag[1]) continue;
        if (tag[2] === other) continue;
        relays.push(tag[1]);
      }
      return relays;
    })
  );
}

export function fetchUserReadRelays(pubkey: string): Observable<string[]> {
  return fetchUserRelays(pubkey, 'read');
}

export function fetchUserWriteRelays(pubkey: string): Observable<string[]> {
  return fetchUserRelays(pubkey, 'write');
}

/**
 * ID 貼り付け用の取得。既定リレー＋リレーヒント → 投稿の作者の write リレー → まとめ作成者
 * （reader）の read リレー の順に探す。後ろの段は前の段で見つからなかったときだけリレーリスト
 * （NIP-65）を引き、まだ問い合わせていないリレーにだけ問い合わせる。どこにも無ければ何も流さず
 * complete する。
 */
export function fetchNoteWithRelayListFallback(
  eventId: string,
  options: { hintRelays?: string[]; author?: string; reader?: string } = {}
): Observable<{ note: Note; relay: string }> {
  const { hintRelays = [], author, reader } = options;
  return defer(() => {
    const client = getClient();
    const filters = { ids: [eventId], limit: 1 };
    const asked = new Set([...DEFAULT_RELAYS, ...hintRelays].map(relayKey));

    const fromRelayList = (pubkey: string | undefined, usage: 'read' | 'write') =>
      pubkey
        ? fetchUserRelays(pubkey, usage).pipe(
            takeUntil(timer(STAGE_LIMIT_MS)),
            reduce((_prev, relays) => relays, [] as string[]),
            switchMap((relays) => {
              const fresh = relays.filter((r) => !asked.has(relayKey(r)));
              for (const r of fresh) asked.add(relayKey(r));
              if (fresh.length === 0) return EMPTY;
              return client
                .use(createRxOneshotReq({ filters }), {
                  on: { relays: fresh, defaultReadRelays: false }
                })
                .pipe(takeUntil(timer(STAGE_LIMIT_MS)));
            })
          )
        : EMPTY;

    return concat(
      client
        .use(createRxOneshotReq({ filters }), withRelays(hintRelays))
        .pipe(takeUntil(timer(STAGE_LIMIT_MS))),
      fromRelayList(author, 'write'),
      fromRelayList(reader, 'read')
    ).pipe(
      take(1),
      map(({ event, from }) => ({ note: toNote(event), relay: from }))
    );
  });
}

export function fetchNotesFromAuthors(
  authors: string[],
  options: { until?: number; limit?: number; relays?: string[] } = {}
): Observable<Note> {
  if (authors.length === 0) return EMPTY;
  const client = getClient();
  const { until, limit = 30, relays } = options;
  const f = until ? { kinds: [1], authors, limit, until } : { kinds: [1], authors, limit };
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
  // kind:1 への返信を kind:1111 で出すクライアントがあるため併せて取得する。
  // kind:1 起点かどうかは取得後に呼び出し側で判定する（isEmbeddableNote）。
  const f = until
    ? { kinds: [1, 1111], authors, limit, until }
    : { kinds: [1, 1111], authors, limit };
  const rxReq = createRxOneshotReq({ filters: f });
  const useOpts =
    relays && relays.length > 0 ? { on: { relays, defaultReadRelays: false } } : undefined;
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
    relays && relays.length > 0 ? { on: { relays, defaultReadRelays: false } } : undefined;

  return client.use(rxReq, useOpts).pipe(
    uniq(),
    map(({ event, from }) => {
      let eventId = '';
      for (const tag of event.tags) {
        if (tag[0] === 'e' && tag[1] && HEX_64.test(tag[1])) eventId = tag[1];
      }
      return eventId ? { eventId, reactedAt: event.created_at, relay: from } : null;
    }),
    filter((r): r is { eventId: string; reactedAt: number; relay: string } => r !== null)
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

export function fetchNotesByIdsWithRelay(
  ids: string[],
  options: { relays?: string[] } = {}
): Observable<{ note: Note; relay: string }> {
  if (ids.length === 0) return EMPTY;
  const client = getClient();
  const { relays } = options;
  const rxReq = createRxOneshotReq({
    filters: { ids, limit: ids.length }
  });

  return client.use(rxReq, withRelays(relays)).pipe(
    uniq(),
    map(({ event, from }) => ({ note: toNote(event), relay: from }))
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
  const tagObs = client
    .use(tagReq, {
      on: { relays: DEFAULT_RELAYS, defaultReadRelays: false }
    })
    .pipe(
      uniq(),
      map(({ event }) => toNote(event))
    );

  const searchFilter = {
    kinds: [1],
    search: keyword,
    limit,
    ...(since != null ? { since } : {}),
    ...(until != null ? { until } : {})
  };
  const searchReq = createRxOneshotReq({ filters: searchFilter });
  const searchObs = client
    .use(searchReq, {
      on: { relays: [...SEARCH_RELAYS], defaultReadRelays: false }
    })
    .pipe(
      uniq(),
      map(({ event }) => toNote(event))
    );

  return merge(tagObs, searchObs);
}

/**
 * 単一リレーに対する検索取得（タグ #t または全文 search の片方のみ）。
 * リレーごとに独立した until カーソルでページングするため、リレーを 1 つに絞り、
 * 返却イベントの出所（from）も一緒に流す。SearchFeedTab の watermark ページングで使う。
 */
export function fetchTagSearchOneRelay(
  keyword: string,
  mode: 'tag' | 'search',
  relay: string,
  options: { until?: number; limit?: number } = {}
): Observable<{ note: Note; relay: string }> {
  if (!keyword) return EMPTY;
  const client = getClient();
  const { until, limit = 30 } = options;
  // kind:1111 は kind:1 への返信として出すクライアントがあるため併せて取得する
  // （kind:1 起点かどうかは呼び出し側で判定）。
  const kinds = [1, 1111];
  const f =
    mode === 'tag'
      ? { kinds, '#t': [keyword], limit, ...(until != null ? { until } : {}) }
      : { kinds, search: keyword, limit, ...(until != null ? { until } : {}) };
  const rxReq = createRxOneshotReq({ filters: f });
  return client
    .use(rxReq, { on: { relays: [relay], defaultReadRelays: false } })
    .pipe(map(({ event, from }) => ({ note: toNote(event), relay: from })));
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
          createdAt: event.created_at,
          name: typeof meta.name === 'string' && meta.name ? meta.name : undefined,
          displayName:
            typeof meta.display_name === 'string' && meta.display_name
              ? meta.display_name
              : undefined,
          picture: typeof meta.picture === 'string' && meta.picture ? meta.picture : undefined,
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
  if (matomes.length === 0)
    return new Observable((s) => {
      s.next(new Map());
      s.complete();
    });
  const client = getClient();
  const aValues = matomes.map((m) => `30023:${m.pubkey}:${m.dTag}`);
  const rxReq = createRxOneshotReq({
    filters: { kinds: [7], '#a': aValues }
  });

  return new Observable((subscriber) => {
    const counts = new Map<string, number>();
    const seen = new Set<string>();

    const sub = client
      .use(rxReq)
      .pipe(uniq())
      .subscribe({
        next({ event }) {
          if (seen.has(event.id)) return;
          seen.add(event.id);
          const aTag = event.tags.find(([k]) => k === 'a');
          if (aTag?.[1]) {
            counts.set(aTag[1], (counts.get(aTag[1]) ?? 0) + 1);
          }
        },
        error(err) {
          subscriber.error(err);
        },
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

  const count$ = new Observable<number>((subscriber) => {
    const seen = new Set<string>();
    const rxReq = createRxOneshotReq({ filters: { kinds: [7], '#a': [aTagValue] } });
    const sub = client
      .use(rxReq)
      .pipe(uniq())
      .subscribe({
        next({ event }) {
          seen.add(event.id);
        },
        complete() {
          subscriber.next(seen.size);
          subscriber.complete();
        },
        error() {
          subscriber.next(0);
          subscriber.complete();
        }
      });
    return () => sub.unsubscribe();
  });

  const faved$ = myPubkey
    ? new Observable<boolean>((subscriber) => {
        const rxReq = createRxOneshotReq({
          filters: { kinds: [7], authors: [myPubkey], '#a': [aTagValue], limit: 1 }
        });
        let found = false;
        const sub = client.use(rxReq).subscribe({
          next() {
            found = true;
          },
          complete() {
            subscriber.next(found);
            subscriber.complete();
          },
          error() {
            subscriber.next(false);
            subscriber.complete();
          }
        });
        return () => sub.unsubscribe();
      })
    : new Observable<boolean>((s) => {
        s.next(false);
        s.complete();
      });

  return forkJoin([count$, faved$]).pipe(map(([count, myFaved]) => ({ count, myFaved })));
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
    relays && relays.length > 0 ? { on: { relays, defaultReadRelays: false } } : undefined;
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

export function fetchUserFavedMatomes(pubkey: string, limit = 500): Observable<Matome> {
  const client = getClient();
  const rxReq = createRxOneshotReq({
    filters: { kinds: [7], authors: [pubkey], '#k': ['30023'], limit }
  });

  // 1 REQ に詰め込む filter 数の上限。著者が多くても、リレーに大量の
  // filter を一度に並べて投げないようチャンクに分割して複数 REQ にする。
  const MAX_FILTERS_PER_REQ = 20;

  return new Observable((subscriber) => {
    const aTagValues = new Set<string>();
    const innerSubs: Subscription[] = [];

    const sub = client
      .use(rxReq)
      .pipe(uniq())
      .subscribe({
        next({ event }) {
          const aTag = event.tags.find(([k]) => k === 'a');
          if (aTag?.[1]?.startsWith('30023:')) {
            aTagValues.add(aTag[1]);
          }
        },
        error(err) {
          subscriber.error(err);
        },
        complete() {
          // 著者ごとに dtag を集約する。同一著者内の #d 配列は OR 評価なので
          // クロスプロダクト誤マッチが起きず、filter 数を「ふぁぼ件数」から
          // 「ふぁぼった著者数」まで減らせる。
          const dTagsByAuthor = new Map<string, string[]>();
          for (const aVal of aTagValues) {
            const parts = aVal.split(':');
            if (parts.length < 3) continue;
            const author = parts[1];
            const dTag = parts.slice(2).join(':');
            const list = dTagsByAuthor.get(author);
            if (list) list.push(dTag);
            else dTagsByAuthor.set(author, [dTag]);
          }

          const filters = [...dTagsByAuthor].map(([author, dTags]) => ({
            kinds: [30023],
            authors: [author],
            '#d': dTags
          }));
          if (filters.length === 0) {
            subscriber.complete();
            return;
          }

          let remaining = 0;
          for (let i = 0; i < filters.length; i += MAX_FILTERS_PER_REQ) {
            const chunk = filters.slice(i, i + MAX_FILTERS_PER_REQ);
            remaining++;
            const mSub = client
              .use(createRxOneshotReq({ filters: chunk }))
              .pipe(
                uniq(),
                map(({ event: ev }) => Matome.fromEvent(ev)),
                filter((m): m is Matome => m !== null),
                filter((m) => m.isMatometr || m.isNosli)
              )
              .subscribe({
                next(m) {
                  subscriber.next(m);
                },
                complete() {
                  if (--remaining === 0) subscriber.complete();
                },
                error() {
                  if (--remaining === 0) subscriber.complete();
                }
              });
            innerSubs.push(mSub);
          }
        }
      });
    return () => {
      sub.unsubscribe();
      for (const s of innerSubs) s.unsubscribe();
    };
  });
}
