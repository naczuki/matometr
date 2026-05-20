import { nip19 } from 'nostr-tools';
import type { NostrEvent } from 'nostr-tools';
import type { AddressPointer } from 'nostr-tools/nip19';

export type NeventBlock = { type: 'nevent'; content: string };
export type CommentBlock = { type: 'comment'; content: string };
export type HeadingBlock = { type: 'heading'; content: string };
export type ParagraphBlock = { type: 'paragraph'; content: string };
export type MatomeBlock = NeventBlock | CommentBlock | HeadingBlock | ParagraphBlock;

const NEVENT_LINE = /^nostr:nevent1[a-z0-9]+$/;
const HEADING_LINE = /^## .+/;
const BLOCKQUOTE_LINE = /^> /;

export class Matome {
  readonly id: string;
  readonly pubkey: string;
  readonly naddr: string;
  readonly dTag: string;
  readonly title: string;
  readonly summary: string;
  readonly publishedAt: number;
  readonly createdAt: number;
  readonly content: string;
  readonly blocks: MatomeBlock[];
  readonly isNosli: boolean;
  readonly tags: string[];

  private constructor(params: {
    id: string;
    pubkey: string;
    naddr: string;
    dTag: string;
    title: string;
    summary: string;
    publishedAt: number;
    createdAt: number;
    content: string;
    blocks: MatomeBlock[];
    isNosli: boolean;
    tags: string[];
  }) {
    this.id = params.id;
    this.pubkey = params.pubkey;
    this.naddr = params.naddr;
    this.dTag = params.dTag;
    this.title = params.title;
    this.summary = params.summary;
    this.publishedAt = params.publishedAt;
    this.createdAt = params.createdAt;
    this.content = params.content;
    this.blocks = params.blocks;
    this.isNosli = params.isNosli;
    this.tags = params.tags;
  }

  get postCount(): number {
    return this.blocks.filter((b) => b.type === 'nevent').length;
  }

  get posts(): NeventBlock[] {
    return this.blocks.filter((b): b is NeventBlock => b.type === 'nevent');
  }

  static fromEvent(event: NostrEvent): Matome | null {
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

    return new Matome({
      id: event.id,
      pubkey: event.pubkey,
      naddr: nip19.naddrEncode(pointer),
      dTag,
      title,
      summary,
      publishedAt: publishedAtStr ? parseInt(publishedAtStr, 10) : event.created_at,
      createdAt: event.created_at,
      content: event.content,
      blocks: Matome.parseContent(event.content),
      isNosli: tTags.includes('nosli'),
      tags: tTags.filter((t) => t !== 'matometr' && t !== 'nosli')
    });
  }

  private static parseContent(content: string): MatomeBlock[] {
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
        blocks.push({ type: 'paragraph', content: line });
        i++;
      } else {
        i++;
      }
    }

    return blocks;
  }
}
