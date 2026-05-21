import { createRxNostr, createRxOneshotReq, createRxForwardReq, uniq, nip07Signer } from 'rx-nostr';
import type { RxNostr } from 'rx-nostr';
import { EMPTY, merge, type Observable } from 'rxjs';
import { map, filter, tap, take } from 'rxjs';
import { verifyEvent, nip19 } from 'nostr-tools';
import type { AddressPointer } from 'nostr-tools/nip19';
import { ulid } from 'ulid';
import { DEFAULT_RELAYS, SEARCH_RELAYS } from '$lib/stores/relays';
import { Matome } from '$lib/entities/Matome';
import type { UserProfile, Note, EditorBlock, NoteEditorBlock } from '$lib/types';

const HEX_64 = /^[0-9a-f]{64}$/;

function toNote(event: { id: string; pubkey: string; content: string; created_at: number; tags: string[][] }): Note {
  return { id: event.id, pubkey: event.pubkey, content: event.content, createdAt: event.created_at, tags: event.tags };
}

function withRelays(relays?: string[]): { on: { relays: string[]; defaultReadRelays: boolean } } | undefined {
  return relays && relays.length > 0 ? { on: { relays, defaultReadRelays: true } } : undefined;
}

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
 * naddr が示す kind:30023 イベントを1件取得。
 */
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

/**
 * kind:1 ノートをイベントIDで1件取得。
 */
export function fetchNoteById(eventId: string): Observable<Note> {
  const client = getClient();
  const rxReq = createRxOneshotReq({
    filters: { kinds: [1, 42], ids: [eventId], limit: 1 }
  });
  return client.use(rxReq).pipe(
    map(({ event }) => toNote(event)),
    take(1)
  );
}

/**
 * kind:3 フォローリストから p タグの pubkey 配列を取得。
 */
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

/**
 * NIP-65 kind:10002 リレーリストから read リレー URL を取得。
 * marker なしは read/write 両用とみなす。
 */
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

/**
 * 指定 pubkey 群の kind:1 を取得。
 * until を渡せば過去方向に辿れる。relays 指定があれば追加で問い合わせる。
 */
export function fetchNotesFromAuthors(
  authors: string[],
  options: { until?: number; limit?: number; relays?: string[] } = {}
): Observable<Note> {
  if (authors.length === 0) return EMPTY;
  const client = getClient();
  const { until, limit = 30, relays } = options;
  const filter = until
    ? { kinds: [1], authors, limit, until }
    : { kinds: [1], authors, limit };
  const rxReq = createRxOneshotReq({ filters: filter });

  return client.use(rxReq, withRelays(relays)).pipe(
    uniq(),
    map(({ event }) => toNote(event))
  );
}

/**
 * 自分の kind:7 リアクション一覧から、対象イベントID とリアクション時刻を取得。
 */
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
      // 最後の e タグが対象イベントとする慣例
      let eventId = '';
      for (const tag of event.tags) {
        if (tag[0] === 'e' && tag[1] && HEX_64.test(tag[1])) eventId = tag[1];
      }
      return eventId ? { eventId, reactedAt: event.created_at } : null;
    }),
    filter((r): r is { eventId: string; reactedAt: number } => r !== null)
  );
}

/**
 * 複数イベントIDの kind:1 を取得。
 */
export function fetchNotesByIds(
  ids: string[],
  options: { relays?: string[] } = {}
): Observable<Note> {
  if (ids.length === 0) return EMPTY;
  const client = getClient();
  const { relays } = options;
  const rxReq = createRxOneshotReq({
    filters: { kinds: [1], ids, limit: ids.length }
  });

  return client.use(rxReq, withRelays(relays)).pipe(
    uniq(),
    map(({ event }) => toNote(event))
  );
}

/**
 * #t フィルタ（DEFAULT_RELAYS）と NIP-50 search（SEARCH_RELAYS）を
 * マージして kind:1 を取得。id 重複は呼び出し側で除去する。
 */
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

/**
 * 複数 pubkey の kind:0 プロフィールを一括取得。EOSE で complete する。
 */
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

/**
 * エディタブロック配列を NIP-23 content 文字列に変換。
 * - nevent  → `nostr:nevent1...` 単独行
 * - comment → `> ` 引用ブロック（改行は各行に付与）
 * - heading → `## ` 見出し
 * ブロック間は空行（\n\n）区切り。
 */
function blocksToContent(blocks: EditorBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === 'nevent' && block.nevent) {
      parts.push(block.nevent);
    } else if (block.type === 'comment' && block.text.trim()) {
      parts.push(block.text.split('\n').map((l) => `> ${l}`).join('\n'));
    } else if (block.type === 'heading' && block.text.trim()) {
      parts.push(`## ${block.text}`);
    }
  }
  return parts.join('\n\n');
}

function buildMentionTags(blocks: EditorBlock[]): string[][] {
  const seenIds = new Set<string>();
  const seenPubkeys = new Set<string>();
  const qTags: string[][] = [];
  const pTags: string[][] = [];

  for (const block of blocks) {
    if (block.type !== 'nevent' || !block.nevent) continue;
    try {
      const decoded = nip19.decode(block.nevent.replace(/^nostr:/, ''));
      if (decoded.type !== 'nevent') continue;
      const { id, relays, author } = decoded.data;
      const relay = relays?.[0] ?? '';

      if (!seenIds.has(id)) {
        seenIds.add(id);
        qTags.push(['q', id, relay, author ?? '']);
      }

      if (author && !seenPubkeys.has(author)) {
        seenPubkeys.add(author);
        pTags.push(['p', author, relay]);
      }
    } catch {
      // 無効な nevent は無視
    }
  }

  return [...qTags, ...pTags];
}

async function sendToRelays(eventParams: {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
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

/**
 * まとめを NIP-23 kind:30023 イベントとして署名・公開する。
 * 成功したら naddr1 文字列を返す。
 */
export async function publishMatome(params: {
  title: string;
  summary: string;
  blocks: EditorBlock[];
}): Promise<string> {
  if (!window.nostr) throw new Error('Nostr 拡張機能が利用できません');

  const pubkey = await window.nostr.getPublicKey();
  const dTag = `matometr-${ulid()}`;
  const now = Math.floor(Date.now() / 1000);

  await sendToRelays({
    kind: 30023 as const,
    created_at: now,
    tags: [
      ['d', dTag],
      ['title', params.title],
      ['summary', params.summary],
      ['published_at', String(now)],
      ['t', 'matometr'],
      ['client', 'matometr'],
      ...buildMentionTags(params.blocks),
    ],
    content: blocksToContent(params.blocks),
  });

  return nip19.naddrEncode({ kind: 30023, pubkey, identifier: dTag });
}

/**
 * 既存まとめを同じ d-tag で上書き公開する（NIP-23 replace）。
 * 成功したら naddr1 文字列を返す。
 */
export async function updateMatome(params: {
  dTag: string;
  publishedAt: number;
  title: string;
  summary: string;
  blocks: EditorBlock[];
}): Promise<string> {
  if (!window.nostr) throw new Error('Nostr 拡張機能が利用できません');

  const pubkey = await window.nostr.getPublicKey();
  const now = Math.floor(Date.now() / 1000);

  await sendToRelays({
    kind: 30023 as const,
    created_at: now,
    tags: [
      ['d', params.dTag],
      ['title', params.title],
      ['summary', params.summary],
      ['published_at', String(params.publishedAt)],
      ['t', 'matometr'],
      ['client', 'matometr'],
      ...buildMentionTags(params.blocks),
    ],
    content: blocksToContent(params.blocks),
  });

  return nip19.naddrEncode({ kind: 30023, pubkey, identifier: params.dTag });
}

/**
 * まとめを NIP-09 の kind:5 削除イベントとして署名・公開する。
 */
export async function deleteMatome(eventId: string): Promise<void> {
  if (!window.nostr) throw new Error('Nostr 拡張機能が利用できません');

  const now = Math.floor(Date.now() / 1000);
  await sendToRelays({
    kind: 5,
    created_at: now,
    tags: [
      ['e', eventId],
      ['k', '30023'],
    ],
    content: '',
  });
}

/**
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

/**
 * 指定ユーザーの kind:30023 まとめを取得（t:matometr + t:nosli の両方）。
 * EOSE で complete する。
 */
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
