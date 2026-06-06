import type { Note } from '$lib/types';
import { buildEmojiMap } from '$lib/utils/nostrContent';

/**
 * NIP-25 / NIP-30 に基づきリアクションの表示内容を解決する（lumilumi Reaction.svelte 準拠）。
 * - content が `+` または空文字 → 星（⭐ 扱い）
 * - content が `-` → 👎
 * - `:shortcode:` 形式 → emoji タグの url を引いて画像表示。引けなければテキスト扱い。
 * - それ以外（「草」等） → content をそのまま文字表示
 */
export type ResolvedReaction =
  | { type: 'star' }
  | { type: 'thumbsdown' }
  | { type: 'emoji'; shortcode: string; url: string }
  | { type: 'text'; text: string };

const SHORTCODE_RE = /^:([a-zA-Z0-9_-]+):$/;

export function resolveReaction(content: string, tags: string[][]): ResolvedReaction {
  if (content === '+' || content === '') return { type: 'star' };
  if (content === '-') return { type: 'thumbsdown' };
  const m = content.match(SHORTCODE_RE);
  if (m) {
    const url = buildEmojiMap(tags).get(m[1]);
    if (url) return { type: 'emoji', shortcode: m[1], url };
  }
  return { type: 'text', text: content };
}

export interface ReactionGroup {
  /** 行を一意にするキー（並び替え・#each キー用） */
  key: string;
  reaction: ResolvedReaction;
  /** この種類を押した全員の pubkey。**潰さない**＝同一 pubkey も回数ぶん含む。 */
  pubkeys: string[];
}

/**
 * リアクションイベント群を「1 行 = 1 種類」にまとめる。
 * pubkey や絵文字での丸め込みはしない（件数＝イベント総数）。
 */
export function groupReactions(events: Note[]): ReactionGroup[] {
  const groups = new Map<string, ReactionGroup>();
  for (const ev of events) {
    const reaction = resolveReaction(ev.content, ev.tags);
    let key: string;
    switch (reaction.type) {
      case 'star':
        key = '+';
        break;
      case 'thumbsdown':
        key = '-';
        break;
      case 'emoji':
        key = 'emoji:' + reaction.shortcode;
        break;
      default:
        key = 'text:' + reaction.text;
    }
    const existing = groups.get(key);
    if (existing) existing.pubkeys.push(ev.pubkey);
    else groups.set(key, { key, reaction, pubkeys: [ev.pubkey] });
  }
  return [...groups.values()];
}
