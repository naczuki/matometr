import { nip19 } from 'nostr-tools';

export type TextSegment = { type: 'text'; content: string };
export type MentionSegment = { type: 'mention'; pubkey: string };
export type QuoteSegment = { type: 'quote'; eventId: string };
export type NaddrSegment = { type: 'naddr'; naddr: string };
export type UrlSegment = { type: 'url'; url: string };
export type EmojiSegment = { type: 'emoji'; shortcode: string; url: string };
export type ContentSegment =
  | TextSegment
  | MentionSegment
  | QuoteSegment
  | NaddrSegment
  | UrlSegment
  | EmojiSegment;

export function isSafeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function buildEmojiMap(tags: string[][]): Map<string, string> {
  const map = new Map<string, string>();
  for (const tag of tags) {
    const [k, shortcode, url] = tag;
    if (k === 'emoji' && shortcode && url && isSafeUrl(url)) map.set(shortcode, url);
  }
  return map;
}

const IMAGE_RE = /https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp)(?:[?#][^\s]*)?/gi;
const VIDEO_RE = /https?:\/\/[^\s]+\.(?:mp4|webm|mov|m4v)(?:[?#][^\s]*)?/gi;

export function extractImages(content: string): { text: string; urls: string[]; videoUrls: string[] } {
  const videoUrls: string[] = [];
  const urls: string[] = [];
  VIDEO_RE.lastIndex = 0;
  IMAGE_RE.lastIndex = 0;
  const text = content
    .replace(VIDEO_RE, (url) => { videoUrls.push(url); return ''; })
    .replace(IMAGE_RE, (url) => { urls.push(url); return ''; })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text, urls, videoUrls };
}

const TAG_REF_RE = /#\[(\d+)\]/g;

/**
 * NIP-08 廃止形式 #[N] をノート自身の tags[N] を使って展開する。
 * e タグ → nostr:nevent1…、p タグ → nostr:npub1…、それ以外 → 除去。
 */
export function resolveTagRefs(content: string, tags: string[][]): string {
  return content.replace(TAG_REF_RE, (_match, indexStr: string) => {
    const idx = parseInt(indexStr, 10);
    const tag = tags[idx];
    if (!tag || tag.length < 2) return '';
    if (tag[0] === 'e' && tag[1]) {
      try { return `nostr:${nip19.neventEncode({ id: tag[1] })}`; } catch { return ''; }
    }
    if (tag[0] === 'p' && tag[1]) {
      try { return `nostr:${nip19.npubEncode(tag[1])}`; } catch { return ''; }
    }
    return '';
  });
}

// Group 1: nostr ref  Group 2: URL  Group 3: emoji shortcode
const CONTENT_RE =
  /nostr:(npub1[a-z0-9]+|nprofile1[a-z0-9]+|nevent1[a-z0-9]+|note1[a-z0-9]+|naddr1[a-z0-9]+)|(https?:\/\/[^\s<>"]+)|:([a-zA-Z0-9_]+):/gi;

export function parseNostrRefs(
  text: string,
  emojiMap?: Map<string, string>
): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(CONTENT_RE)) {
    const start = match.index!;
    if (start > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, start) });
    }

    // URL
    if (match[2]) {
      if (isSafeUrl(match[2])) {
        segments.push({ type: 'url', url: match[2] });
      } else {
        segments.push({ type: 'text', content: match[2] });
      }
      lastIndex = start + match[0].length;
      continue;
    }

    // Emoji shortcode
    if (match[3]) {
      const shortcode = match[3];
      const url = emojiMap?.get(shortcode);
      if (url) {
        segments.push({ type: 'emoji', shortcode, url });
      } else {
        segments.push({ type: 'text', content: match[0] });
      }
      lastIndex = start + match[0].length;
      continue;
    }

    // Nostr ref
    const encoded = match[1];
    try {
      const decoded = nip19.decode(encoded);
      switch (decoded.type) {
        case 'npub':
          segments.push({ type: 'mention', pubkey: decoded.data });
          break;
        case 'nprofile':
          segments.push({ type: 'mention', pubkey: decoded.data.pubkey });
          break;
        case 'nevent':
          segments.push({ type: 'quote', eventId: decoded.data.id });
          break;
        case 'note':
          segments.push({ type: 'quote', eventId: decoded.data as string });
          break;
        case 'naddr':
          segments.push({ type: 'naddr', naddr: encoded });
          break;
        default:
          segments.push({ type: 'text', content: match[0] });
      }
    } catch {
      segments.push({ type: 'text', content: match[0] });
    }

    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}
