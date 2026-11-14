import { nip19 } from 'nostr-tools';
import { ulid } from 'ulid';
import type { EditorBlock } from '$lib/types';
import { collectObservable } from '$lib/utils/rxCollect';
import { sendToRelays } from './nostrCore';
import { fetchUserWriteRelays } from './nostrFetch';

function splitTextToChunks(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

// テスト（ラウンドトリップ検証）から参照するため export している
export function blocksToContent(blocks: EditorBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === 'nevent' && block.nevent) {
      parts.push(block.nevent);
    } else if (block.type === 'comment' && block.text.trim()) {
      parts.push(block.text.trim());
    } else if (block.type === 'heading' && block.text.trim()) {
      parts.push(`## ${block.text}`);
    }
  }
  return parts.join('\n\n');
}

// テスト（ラウンドトリップ検証）から参照するため export している
export function buildLayoutTag(blocks: EditorBlock[]): string[][] {
  const effectiveBlocks = blocks.filter((b) => {
    if (b.type === 'nevent') return !!b.nevent;
    return b.text.trim().length > 0;
  });

  // v1: nevent で区切られたテキスト連続区間ごとのチャンク数の入れ子配列。
  // 種別を内容から推測するため「## で始まるコメント」「nostr: 参照のみのコメント」を
  // 取り違える。旧クライアント互換のために残し、新クライアントは v2 を優先して読む。
  const runs: number[][] = [];
  let currentRun: number[] = [];
  // v2: ブロック列をそのまま記録する。'e'=引用ポスト, 'h'=見出し, 数値=コメント（チャンク数）。
  const seq: ('e' | 'h' | number)[] = [];

  for (const block of effectiveBlocks) {
    if (block.type === 'nevent') {
      if (currentRun.length > 0) {
        runs.push(currentRun);
        currentRun = [];
      }
      seq.push('e');
    } else if (block.type === 'heading') {
      currentRun.push(1);
      seq.push('h');
    } else {
      let chunkCount = splitTextToChunks(block.text).length;
      if (chunkCount === 0) chunkCount = 1;
      currentRun.push(chunkCount);
      seq.push(chunkCount);
    }
  }
  if (currentRun.length > 0) {
    runs.push(currentRun);
  }

  if (seq.length === 0) return [];
  const tags: string[][] = [];
  if (runs.length > 0) tags.push(['matome_layout', '1', JSON.stringify(runs)]);
  tags.push(['matome_layout', '2', JSON.stringify(seq)]);
  return tags;
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

function extractHashtags(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of text.matchAll(/#(\S+)/g)) {
    const tag = m[1].toLowerCase();
    if (!seen.has(tag)) {
      seen.add(tag);
      result.push(tag);
    }
  }
  return result;
}

const CLIENT_TAG = [
  'client',
  'matometr',
  '31990:82b30d30444170e6a8c819e8406e362a3695454a4617894ce2706f3840c6c003:matometr',
  'wss://yabu.me'
];

// write リレーの一覧は送信のたびに取り直さず、しばらく覚えておく（ふぁぼ・保存のたびに
// 一覧の取得を待つと、応答の遅いリレーがあるだけで送信開始が数秒遅れる）。
const WRITE_RELAYS_TTL_MS = 10 * 60_000;
// 見つからなかった結果は、取得に失敗しただけのこともあるので短めにする
const WRITE_RELAYS_EMPTY_TTL_MS = 60_000;
const writeRelaysCache = new Map<string, { relays: string[]; expiresAt: number }>();

// まとめの保存・編集・削除、ふぁぼ、告知投稿は、既定リレーに加えてユーザーの write リレー
// （NIP-65）にも送る。kind:10002 が無い・取得できない場合は既定リレーだけになる。
async function userWriteRelays(pubkey: string): Promise<string[]> {
  const cached = writeRelaysCache.get(pubkey);
  if (cached && Date.now() < cached.expiresAt) return cached.relays;
  const relays = await collectObservable(fetchUserWriteRelays(pubkey), []);
  const ttl = relays.length > 0 ? WRITE_RELAYS_TTL_MS : WRITE_RELAYS_EMPTY_TTL_MS;
  writeRelaysCache.set(pubkey, { relays, expiresAt: Date.now() + ttl });
  return relays;
}

/**
 * 新しいまとめの d タグ。公開がタイムアウトなどで失敗したあとにやり直しても別のまとめに
 * ならないよう、呼び出し側（作成画面）で 1 回だけ作って publishMatome に渡す。
 */
export function newMatomeDTag(): string {
  return `matometr-${ulid()}`;
}

/**
 * 置き換え可能イベントを上書きするときの created_at。
 * リレーは created_at が新しい方を残すので、前の版と同じ秒・それ以前にならないようにする
 * （同じ秒に続けて保存したとき・前の版を保存した端末の時計が進んでいたとき）。
 */
export function replacingCreatedAt(now: number, prevCreatedAt = 0): number {
  return Math.max(now, prevCreatedAt + 1);
}

export async function publishMatome(params: {
  title: string;
  summary: string;
  blocks: EditorBlock[];
  /** 公開をやり直すときは、最初に使った d タグと公開時刻を渡す（newMatomeDTag を参照） */
  dTag?: string;
  publishedAt?: number;
}): Promise<string> {
  if (!window.nostr) throw new Error('Nostr 拡張機能が利用できません');

  const pubkey = await window.nostr.getPublicKey();
  const dTag = params.dTag ?? newMatomeDTag();
  const now = Math.floor(Date.now() / 1000);
  const publishedAt = params.publishedAt ?? now;
  const relays = await userWriteRelays(pubkey);

  await sendToRelays(
    {
      kind: 30023 as const,
      created_at: now,
      tags: [
        ['d', dTag],
        ['title', params.title],
        ['summary', params.summary],
        ['published_at', String(publishedAt)],
        ['t', 'matometr'],
        CLIENT_TAG,
        ...buildMentionTags(params.blocks),
        ...buildLayoutTag(params.blocks)
      ],
      content: blocksToContent(params.blocks)
    },
    relays
  );

  return nip19.naddrEncode({ kind: 30023, pubkey, identifier: dTag });
}

export async function updateMatome(params: {
  dTag: string;
  publishedAt: number;
  /** 編集前の版の created_at。これより新しい時刻で保存する */
  prevCreatedAt?: number;
  title: string;
  summary: string;
  blocks: EditorBlock[];
}): Promise<string> {
  if (!window.nostr) throw new Error('Nostr 拡張機能が利用できません');

  const pubkey = await window.nostr.getPublicKey();
  const now = Math.floor(Date.now() / 1000);
  const relays = await userWriteRelays(pubkey);

  await sendToRelays(
    {
      kind: 30023 as const,
      created_at: replacingCreatedAt(now, params.prevCreatedAt),
      tags: [
        ['d', params.dTag],
        ['title', params.title],
        ['summary', params.summary],
        ['published_at', String(params.publishedAt)],
        ['t', 'matometr'],
        CLIENT_TAG,
        ...buildMentionTags(params.blocks),
        ...buildLayoutTag(params.blocks)
      ],
      content: blocksToContent(params.blocks)
    },
    relays
  );

  return nip19.naddrEncode({ kind: 30023, pubkey, identifier: params.dTag });
}

export async function deleteMatome(params: {
  eventId: string;
  pubkey: string;
  dTag: string;
}): Promise<void> {
  if (!window.nostr) throw new Error('Nostr 拡張機能が利用できません');

  const pubkey = await window.nostr.getPublicKey();
  const now = Math.floor(Date.now() / 1000);
  const relays = await userWriteRelays(pubkey);
  // e タグは指定した版しか消えず、古い版を持つリレーで復活しうる。
  // a タグは NIP-09 で「その時点までの全バージョンを削除」と定められているので併記する。
  await sendToRelays(
    {
      kind: 5,
      created_at: now,
      tags: [
        ['e', params.eventId],
        ['a', `30023:${params.pubkey}:${params.dTag}`],
        ['k', '30023']
      ],
      content: ''
    },
    relays
  );
}

export async function publishReaction(params: {
  eventId: string;
  eventPubkey: string;
  kind: number;
  dTag: string;
}): Promise<void> {
  if (!window.nostr) throw new Error('Nostr 拡張機能が利用できません');

  const pubkey = await window.nostr.getPublicKey();
  const now = Math.floor(Date.now() / 1000);
  const aTagValue = `${params.kind}:${params.eventPubkey}:${params.dTag}`;
  const relays = await userWriteRelays(pubkey);
  await sendToRelays(
    {
      kind: 7,
      created_at: now,
      tags: [
        ['e', params.eventId],
        ['p', params.eventPubkey],
        ['a', aTagValue],
        ['k', String(params.kind)]
      ],
      content: '+'
    },
    relays
  );
}

export async function publishAnnouncement(content: string): Promise<void> {
  if (!window.nostr) throw new Error('Nostr 拡張機能が利用できません');
  const pubkey = await window.nostr.getPublicKey();
  const now = Math.floor(Date.now() / 1000);
  const tTags = extractHashtags(content).map((tag) => ['t', tag]);
  const relays = await userWriteRelays(pubkey);
  await sendToRelays(
    {
      kind: 1,
      created_at: now,
      tags: [CLIENT_TAG, ...tTags],
      content
    },
    relays
  );
}

/**
 * NIP-78（kind:30078）のアプリ固有データを保存する。content は呼び出し側で用意する
 * （設定の同期では NIP-44 で自分宛てに暗号化したもの）。既定リレーと write リレーに送る。
 */
export async function publishAppData(params: {
  dTag: string;
  content: string;
  createdAt: number;
}): Promise<void> {
  if (!window.nostr) throw new Error('Nostr 拡張機能が利用できません');
  const pubkey = await window.nostr.getPublicKey();
  const relays = await userWriteRelays(pubkey);
  await sendToRelays(
    {
      kind: 30078,
      created_at: params.createdAt,
      tags: [['d', params.dTag]],
      content: params.content
    },
    relays
  );
}
