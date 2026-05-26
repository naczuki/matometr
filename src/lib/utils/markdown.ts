import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ breaks: true });

export type HtmlSegment = { type: 'html'; html: string };
export type NeventSegment = { type: 'nevent'; ref: string };
export type NaddrSegment = { type: 'naddr'; ref: string };
export type ContentSegment = HtmlSegment | NeventSegment | NaddrSegment;

const NOSTR_REF = /nostr:(nevent1[a-z0-9]+|naddr1[a-z0-9]+)/g;

export function renderInlineMarkdown(text: string): string {
  return DOMPurify.sanitize(marked.parse(text) as string);
}

export function parseMarkdownContent(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let lastIndex = 0;

  NOSTR_REF.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = NOSTR_REF.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index);
      const html = DOMPurify.sanitize(marked.parse(text) as string);
      if (html.trim()) segments.push({ type: 'html', html });
    }

    const ref = match[1];
    if (ref.startsWith('nevent1')) {
      segments.push({ type: 'nevent', ref: `nostr:${ref}` });
    } else {
      segments.push({ type: 'naddr', ref: `nostr:${ref}` });
    }

    lastIndex = NOSTR_REF.lastIndex;
  }

  if (lastIndex < content.length) {
    const text = content.slice(lastIndex);
    const html = DOMPurify.sanitize(marked.parse(text) as string);
    if (html.trim()) segments.push({ type: 'html', html });
  }

  return segments;
}
