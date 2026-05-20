import type { Matome, MatomeBlock } from '$lib/types';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from 'nostr-tools';
import type { AddressPointer } from 'nostr-tools/nip19';

const NEVENT_LINE = /^nostr:nevent1[a-z0-9]+$/;
const HEADING_LINE = /^## .+/;
const BLOCKQUOTE_LINE = /^> /;

export function parseContent(content: string): MatomeBlock[] {
  const lines = content.split('\n');
  const blocks: MatomeBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (NEVENT_LINE.test(line.trim())) {
      blocks.push({ type: 'nevent', content: line.trim() });
      i++;
    } else if (HEADING_LINE.test(line)) {
      blocks.push({ type: 'heading', content: line.slice(3) });
      i++;
    } else if (BLOCKQUOTE_LINE.test(line)) {
      const commentLines: string[] = [];
      while (i < lines.length && BLOCKQUOTE_LINE.test(lines[i])) {
        commentLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ type: 'comment', content: commentLines.join('\n') });
    } else if (line.trim()) {
      blocks.push({ type: 'text', content: line });
      i++;
    } else {
      i++;
    }
  }

  return blocks;
}

export function fromNostrEvent(event: NostrEvent): Matome | null {
  if (event.kind !== 30023) return null;

  const dTag = event.tags.find(([k]) => k === 'd')?.[1];
  const title = event.tags.find(([k]) => k === 'title')?.[1];
  const summary = event.tags.find(([k]) => k === 'summary')?.[1] ?? '';
  const publishedAtStr = event.tags.find(([k]) => k === 'published_at')?.[1];
  const tTags = event.tags.filter(([k]) => k === 't').map(([, v]) => v);

  if (!dTag || !title) return null;

  const pointer: AddressPointer = {
    identifier: dTag,
    pubkey: event.pubkey,
    kind: 30023
  };

  const naddr = nip19.naddrEncode(pointer);
  const isNosli = tTags.includes('nosli');

  return {
    id: event.id,
    pubkey: event.pubkey,
    naddr,
    dTag,
    title,
    summary,
    publishedAt: publishedAtStr ? parseInt(publishedAtStr, 10) : event.created_at,
    createdAt: event.created_at,
    content: event.content,
    blocks: parseContent(event.content),
    isNosli
  };
}
