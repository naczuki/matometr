import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ breaks: true });

export type HtmlSegment = { type: 'html'; html: string };
export type NeventSegment = { type: 'nevent'; ref: string };
export type NaddrSegment = { type: 'naddr'; ref: string };
export type ContentSegment = HtmlSegment | NeventSegment | NaddrSegment;

const NOSTR_REF = /nostr:(nevent1[a-z0-9]+|naddr1[a-z0-9]+)/g;

// コメント・長文記事の本文は誰でも書けるので、Markdown が出すタグと、文章の整形に使う
// 無害なタグだけを通す。DOMPurify の既定はスクリプトは落とすが、<form>・<input>・style 属性・
// class・id は通すため、画面全体を覆う偽のログイン画面のようなものを作れてしまう。
// 通さないタグの中の文章は残る（タグだけ外れる）。
const ALLOWED_TAGS = [
  // Markdown が出すもの
  'p',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'em',
  'del',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'a',
  'img',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  // タスクリストのチェックボックス（下のフックでチェックボックス以外は落とす）
  'input',
  // 本文に直接書かれることのある、整形用のタグ
  'b',
  'i',
  'u',
  's',
  'mark',
  'small',
  'sub',
  'sup',
  'kbd',
  'abbr',
  'cite',
  'q',
  'ins',
  'div',
  'span',
  'figure',
  'figcaption',
  'details',
  'summary',
  'dl',
  'dt',
  'dd',
  'tfoot',
  'caption',
  'ruby',
  'rt',
  'rp',
  'video',
  'audio',
  'source'
];

// style・class・id・name・フォーム関係の属性は通さない
const ALLOWED_ATTR = [
  'href',
  'src',
  'alt',
  'title',
  'align',
  'start',
  'colspan',
  'rowspan',
  'open',
  'controls',
  'poster',
  // タスクリストのチェックボックス用
  'type',
  'checked',
  'disabled'
];

let hookInstalled = false;

function installHook(): void {
  if (hookInstalled) return;
  hookInstalled = true;
  // <input> はタスクリストのチェックボックス（操作できないもの）だけを残す
  DOMPurify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName !== 'input') return;
    const el = node as Element;
    if (el.getAttribute('type') !== 'checkbox') {
      el.remove();
      return;
    }
    el.setAttribute('disabled', '');
  });
}

function sanitize(html: string): string {
  installHook();
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false });
}

export function renderInlineMarkdown(text: string): string {
  return sanitize(marked.parse(text) as string);
}

export function parseMarkdownContent(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let lastIndex = 0;

  NOSTR_REF.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = NOSTR_REF.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index);
      const html = sanitize(marked.parse(text) as string);
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
    const html = sanitize(marked.parse(text) as string);
    if (html.trim()) segments.push({ type: 'html', html });
  }

  return segments;
}
