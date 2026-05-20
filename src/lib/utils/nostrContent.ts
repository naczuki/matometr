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

function isSafeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

const IMAGE_RE = /https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp)(?:[?#][^\s]*)?/gi;

export function extractImages(content: string): { text: string; urls: string[] } {
  const urls: string[] = [];
  const text = content
    .replace(IMAGE_RE, (url) => { urls.push(url); return ''; })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text, urls };
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
