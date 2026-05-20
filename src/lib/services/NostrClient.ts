import { createRxNostr, createRxOneshotReq, createRxForwardReq, uniq, nip07Signer } from 'rx-nostr';
import type { RxNostr } from 'rx-nostr';
import { EMPTY, type Observable } from 'rxjs';
import { map, filter, tap, take } from 'rxjs';
import { verifyEvent, nip19 } from 'nostr-tools';
import type { AddressPointer } from 'nostr-tools/nip19';
import { ulid } from 'ulid';
import { DEFAULT_RELAYS } from '$lib/stores/relays';
import { Matome } from '$lib/entities/Matome';
import type { UserProfile, Note, EditorBlock } from '$lib/types';

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
    filters: { kinds: [1], ids: [eventId], limit: 1 }
  });
  return client.use(rxReq).pipe(
    map(
      ({ event }): Note => ({
        id: event.id,
        pubkey: event.pubkey,
        content: event.content,
        createdAt: event.created_at,
        tags: event.tags
      })
    ),
    take(1)
  );
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
          nip05: typeof meta.nip05 === 'string' ? meta.nip05 : undefined
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

/**
 * まとめを NIP-23 kind:30023 イベントとして署名・公開する。
 * 成功したら naddr1 文字列を返す。
 * 署名には NIP-07（window.nostr）を使用。
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
  const content = blocksToContent(params.blocks);

  const eventParams = {
    kind: 30023 as const,
    created_at: now,
    tags: [
      ['d', dTag],
      ['title', params.title],
      ['summary', params.summary],
      ['published_at', String(now)],
      ['t', 'matometr'],
      ['client', 'matometr'],
    ],
    content,
  };

  const naddr = nip19.naddrEncode({ kind: 30023, pubkey, identifier: dTag });

  await new Promise<void>((resolve, reject) => {
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

    // 20 秒でタイムアウト
    setTimeout(() => {
      if (!published) {
        sub.unsubscribe();
        reject(new Error('タイムアウト：リレーに接続できませんでした'));
      }
    }, 20_000);
  });

  return naddr;
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
