import { nip19 } from 'nostr-tools';
import { ulid } from 'ulid';
import type { EditorBlock } from '$lib/types';
import { sendToRelays } from './nostrCore';

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

function extractHashtags(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of text.matchAll(/#(\S+)/g)) {
    const tag = m[1].toLowerCase();
    if (!seen.has(tag)) { seen.add(tag); result.push(tag); }
  }
  return result;
}

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

export async function publishAnnouncement(content: string): Promise<void> {
  if (!window.nostr) throw new Error('Nostr 拡張機能が利用できません');
  const now = Math.floor(Date.now() / 1000);
  const tTags = extractHashtags(content).map((tag) => ['t', tag]);
  await sendToRelays({
    kind: 1,
    created_at: now,
    tags: [['client', 'matometr'], ...tTags],
    content,
  });
}
