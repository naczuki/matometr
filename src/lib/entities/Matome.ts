import { nip19 } from 'nostr-tools';
import type { NostrEvent } from 'nostr-tools';
import type { AddressPointer } from 'nostr-tools/nip19';

export type NeventBlock = { type: 'nevent'; content: string };
export type NaddrBlock = { type: 'naddr'; content: string };
export type MentionBlock = { type: 'mention'; content: string; pubkey: string };
export type CommentBlock = { type: 'comment'; content: string };
export type HeadingBlock = { type: 'heading'; content: string };
export type ParagraphBlock = { type: 'paragraph'; content: string };
export type MatomeBlock = NeventBlock | NaddrBlock | MentionBlock | CommentBlock | HeadingBlock | ParagraphBlock;

const NEVENT_LINE = /^nostr:nevent1[a-z0-9]+$/;
const NOSTR_REF_SOLO = /^nostr:(nevent1|note1|naddr1|npub1|nprofile1)[a-z0-9]+$/;
const HEADING_LINE = /^## .+/;
const BLOCKQUOTE_LINE = /^> /;
const TAG_REF_LINE = /^#\[(\d+)\]$/;

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
  readonly rawEvent: NostrEvent;
  // TODO: 既存リアクション数の集計で初期化する
  favCount: number = 0;

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
    rawEvent: NostrEvent;
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
    this.rawEvent = params.rawEvent;
  }

  get isMatometr(): boolean {
    return this.rawEvent.tags.some(([k, v]) => k === 't' && v === 'matometr');
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
      blocks: Matome.parseContent(event.content, event.tags),
      isNosli: tTags.includes('nosli'),
      tags: tTags.filter((t) => t !== 'matometr' && t !== 'nosli'),
      rawEvent: event
    });
  }

  private static parseContent(content: string, eventTags: string[][]): MatomeBlock[] {
    const layoutTag = eventTags.find(([k]) => k === 'matome_layout');
    if (layoutTag && layoutTag[1] === '1') {
      return Matome.parseContentWithLayout(content, eventTags, layoutTag[2]);
    }
    return Matome.parseContentLegacy(content, eventTags);
  }

  private static classifyRefChunk(chunk: string): MatomeBlock {
    const encoded = chunk.replace(/^nostr:/, '');
    try {
      const decoded = nip19.decode(encoded);
      if (decoded.type === 'naddr') {
        return { type: 'naddr', content: chunk };
      }
      if (decoded.type === 'npub') {
        return { type: 'mention', content: chunk, pubkey: decoded.data };
      }
      if (decoded.type === 'nprofile') {
        return { type: 'mention', content: chunk, pubkey: decoded.data.pubkey };
      }
    } catch { /* treat as nevent */ }
    return { type: 'nevent', content: chunk };
  }

  private static parseContentWithLayout(content: string, eventTags: string[][], layoutJson: string): MatomeBlock[] {
    let runs: number[][];
    try {
      runs = JSON.parse(layoutJson) as number[][];
      if (!Array.isArray(runs)) throw new Error();
    } catch {
      return Matome.parseContentLegacy(content, eventTags);
    }

    const chunks = content.split(/\n\s*\n/).map((c) => c.trim()).filter((c) => c.length > 0);
    const blocks: MatomeBlock[] = [];
    let runIndex = 0;
    let textRunChunks: string[] = [];

    function flushTextRun(): void {
      if (textRunChunks.length === 0) return;
      const grouping = runIndex < runs.length ? runs[runIndex] : null;
      runIndex++;

      if (!grouping || !Array.isArray(grouping)) {
        for (const chunk of textRunChunks) {
          if (HEADING_LINE.test(chunk) && !chunk.includes('\n')) {
            blocks.push({ type: 'heading', content: chunk.slice(3) });
          } else {
            blocks.push({ type: 'comment', content: chunk });
          }
        }
        textRunChunks = [];
        return;
      }

      const totalFromGrouping = grouping.reduce((a, b) => a + b, 0);
      if (totalFromGrouping !== textRunChunks.length) {
        for (const chunk of textRunChunks) {
          if (HEADING_LINE.test(chunk) && !chunk.includes('\n')) {
            blocks.push({ type: 'heading', content: chunk.slice(3) });
          } else {
            blocks.push({ type: 'comment', content: chunk });
          }
        }
        textRunChunks = [];
        return;
      }

      let offset = 0;
      for (const size of grouping) {
        const slice = textRunChunks.slice(offset, offset + size);
        const joined = slice.join('\n\n');
        if (size === 1 && HEADING_LINE.test(joined) && !joined.includes('\n')) {
          blocks.push({ type: 'heading', content: joined.slice(3) });
        } else {
          blocks.push({ type: 'comment', content: joined });
        }
        offset += size;
      }
      textRunChunks = [];
    }

    for (const chunk of chunks) {
      if (NOSTR_REF_SOLO.test(chunk)) {
        flushTextRun();
        blocks.push(Matome.classifyRefChunk(chunk));
      } else {
        textRunChunks.push(chunk);
      }
    }
    flushTextRun();

    if (blocks.filter((b) => b.type === 'nevent').length === 0) {
      for (const tag of eventTags) {
        if (tag[0] === 'e' && tag[1]) {
          blocks.push({ type: 'nevent', content: `nostr:${nip19.neventEncode({ id: tag[1] })}` });
        }
      }
    }

    return blocks;
  }

  private static parseContentLegacy(content: string, eventTags: string[][]): MatomeBlock[] {
    const lines = content.split('\n');
    const blocks: MatomeBlock[] = [];
    let hasPostBlocks = false;
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (NEVENT_LINE.test(line.trim())) {
        blocks.push({ type: 'nevent', content: line.trim() });
        hasPostBlocks = true;
        i++;
      } else if (TAG_REF_LINE.test(line.trim())) {
        const match = line.trim().match(TAG_REF_LINE);
        if (match) {
          const idx = parseInt(match[1], 10);
          const tag = eventTags[idx];
          if (tag && tag[0] === 'e' && tag[1]) {
            const neventStr = `nostr:${nip19.neventEncode({ id: tag[1] })}`;
            blocks.push({ type: 'nevent', content: neventStr });
            hasPostBlocks = true;
          }
        }
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

    if (!hasPostBlocks) {
      for (const tag of eventTags) {
        if (tag[0] === 'e' && tag[1]) {
          blocks.push({ type: 'nevent', content: `nostr:${nip19.neventEncode({ id: tag[1] })}` });
        }
      }
    }

    return blocks;
  }
}
