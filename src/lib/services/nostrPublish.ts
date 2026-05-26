import { nip19 } from 'nostr-tools';
import { ulid } from 'ulid';
import type { EditorBlock } from '$lib/types';
import { sendToRelays } from './nostrCore';

const NOSTR_REF_SOLO = /^nostr:(nevent1|note1|naddr1|npub1|nprofile1)[a-z0-9]+$/;

function splitTextToChunks(text: string): string[] {
  return text.split(/\n\s*\n/).map((c) => c.trim()).filter((c) => c.length > 0);
}

function blocksToContent(blocks: EditorBlock[]): string {
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

function buildLayoutTag(blocks: EditorBlock[]): string[][] {
  const effectiveBlocks = blocks.filter((b) => {
    if (b.type === 'nevent') return !!b.nevent;
    return b.text.trim().length > 0;
  });

  const runs: number[][] = [];
  let currentRun: number[] = [];

  for (const block of effectiveBlocks) {
    if (block.type === 'nevent') {
      if (currentRun.length > 0) {
        runs.push(currentRun);
        currentRun = [];
      }
    } else {
      let chunkCount: number;
      if (block.type === 'heading') {
        chunkCount = 1;
      } else {
        chunkCount = splitTextToChunks(block.text).length;
        if (chunkCount === 0) chunkCount = 1;
      }
      currentRun.push(chunkCount);
    }
  }
  if (currentRun.length > 0) {
    runs.push(currentRun);
  }

  if (runs.length === 0) return [];
  return [['matome_layout', '1', JSON.stringify(runs)]];
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
    if (!seen.has(tag)) { seen.add(tag); result.push(tag); }
  }
  return result;
}

const CLIENT_TAG = ['client', 'matometr', '31990:82b30d30444170e6a8c819e8406e362a3695454a4617894ce2706f3840c6c003:matometr', 'wss://yabu.me'];

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
      CLIENT_TAG,
      ...buildMentionTags(params.blocks),
      ...buildLayoutTag(params.blocks),
    ],
    content: blocksToContent(params.blocks),
  });

  return nip19.naddrEncode({ kind: 30023, pubkey, identifier: dTag });
}

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
      CLIENT_TAG,
      ...buildMentionTags(params.blocks),
      ...buildLayoutTag(params.blocks),
    ],
    content: blocksToContent(params.blocks),
  });

  return nip19.naddrEncode({ kind: 30023, pubkey, identifier: params.dTag });
}

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

export async function publishReaction(params: {
  eventId: string;
  eventPubkey: string;
  kind: number;
  dTag: string;
}): Promise<void> {
  if (!window.nostr) throw new Error('Nostr 拡張機能が利用できません');

  const now = Math.floor(Date.now() / 1000);
  const aTagValue = `${params.kind}:${params.eventPubkey}:${params.dTag}`;
  await sendToRelays({
    kind: 7,
    created_at: now,
    tags: [
      ['e', params.eventId],
      ['p', params.eventPubkey],
      ['a', aTagValue],
      ['k', String(params.kind)],
    ],
    content: '+',
  });
}

export async function publishAnnouncement(content: string): Promise<void> {
  if (!window.nostr) throw new Error('Nostr 拡張機能が利用できません');
  const now = Math.floor(Date.now() / 1000);
  const tTags = extractHashtags(content).map((tag) => ['t', tag]);
  await sendToRelays({
    kind: 1,
    created_at: now,
    tags: [CLIENT_TAG, ...tTags],
    content,
  });
}
