<script lang="ts">
  import { onMount } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import { base } from '$app/paths';
  import type { Note } from '$lib/types';
  import { fetchNoteById } from '$lib/services/NostrClient';
  import { profiles, requestProfile } from '$lib/stores/profiles';
  import { avatarStyle } from '$lib/utils/avatar';
  import { parseNostrRefs, isSafeUrl } from '$lib/utils/nostrContent';
  import { shortNpubFromPubkey } from '$lib/utils/nostr';

  export let eventId: string;

  let note: Note | null = null;
  let failed = false;

  onMount(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sub = fetchNoteById(eventId).subscribe({
      next: (n) => {
        note = n;
        requestProfile(n.pubkey);
        if (timer) clearTimeout(timer);
      },
      error: () => { failed = true; },
      complete: () => { if (!note) failed = true; }
    });
    timer = setTimeout(() => { if (!note) failed = true; }, 10_000);
    return () => {
      sub.unsubscribe();
      if (timer) clearTimeout(timer);
    };
  });

  $: profile = note ? $profiles.get(note.pubkey) : undefined;
  $: authorName = profile?.displayName ?? profile?.name ?? shortNpubFromPubkey(note?.pubkey ?? '');
  $: authorStyle = note ? avatarStyle(note.pubkey) : { bg: '#e5e5e5', fg: '#737373', initial: '?' };
  $: picture = profile?.picture ?? null;

  let picFailed = false;
  $: picture, (picFailed = false);

  // 画像URLは除去（引用カードでは画像表示しない）
  function stripImages(content: string): string {
    const IMAGE_RE = /https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp)(?:[?#][^\s]*)?/gi;
    return content.replace(IMAGE_RE, '').replace(/\n{3,}/g, '\n\n').trim();
  }

  $: emojiMap = (() => {
    const map = new Map<string, string>();
    if (!note) return map;
    for (const tag of note.tags) {
      const [k, shortcode, url] = tag;
      if (k === 'emoji' && shortcode && url && isSafeUrl(url)) map.set(shortcode, url);
    }
    return map;
  })();

  let failedEmojis: Set<string> = new Set();
  function onEmojiError(shortcode: string): void {
    failedEmojis = new Set([...failedEmojis, shortcode]);
  }

  $: segments = note ? parseNostrRefs(stripImages(note.content), emojiMap) : [];

  $: for (const seg of segments) {
    if (seg.type === 'mention') requestProfile(seg.pubkey);
  }

  function truncateName(name: string, max = 30): string {
    return name.length > max ? name.slice(0, max) + '…' : name;
  }

  function shortRef(encoded: string): string {
    return encoded.slice(0, 14) + '…';
  }

  function safeNeventEncode(id: string): string {
    try { return nip19.neventEncode({ id }); } catch { return ''; }
  }
</script>

<div class="quoted">
  {#if failed}
    <div class="quoted-error">この投稿が見つかりませんでした</div>
  {:else if !note}
    <span class="quoted-state">取得中…</span>
  {:else}
    <div class="quoted-header">
      <div class="quoted-avatar" style="background:{authorStyle.bg};color:{authorStyle.fg};">
        {#if picture && !picFailed}
          <img src={picture} alt="" on:error={() => (picFailed = true)} />
        {:else}
          {authorStyle.initial}
        {/if}
      </div>
      <span class="quoted-name">{truncateName(authorName)}</span>
    </div>
    <div class="quoted-content">
      {#each segments as segment}
        {#if segment.type === 'text'}
          <span class="text-seg">{segment.content}</span>
        {:else if segment.type === 'mention'}
          {@const mp = $profiles.get(segment.pubkey)}
          <a class="mention-link" href="{base}/user/{nip19.npubEncode(segment.pubkey)}">
            @{truncateName(mp?.displayName ?? mp?.name ?? shortNpubFromPubkey(segment.pubkey))}
          </a>
        {:else if segment.type === 'quote'}
          <!-- ネスト1段まで：引用はリンクのみ、カード展開しない -->
          {@const ne = safeNeventEncode(segment.eventId)}
          {#if ne}
            <a class="quote-ref-link" href="https://njump.me/{ne}" target="_blank" rel="noopener noreferrer">
              nostr:{shortRef(ne)}
            </a>
          {/if}
        {:else if segment.type === 'naddr'}
          <a class="naddr-link" href="https://njump.me/{segment.naddr}" target="_blank" rel="noopener noreferrer">
            nostr:{shortRef(segment.naddr)}
          </a>
        {:else if segment.type === 'emoji'}
          {#if failedEmojis.has(segment.shortcode)}
            :{segment.shortcode}:
          {:else}
            <img
              src={segment.url}
              alt=":{segment.shortcode}:"
              class="emoji-img"
              loading="lazy"
              on:error={() => onEmojiError(segment.shortcode)}
            />
          {/if}
        {:else if segment.type === 'url'}
          <a class="naddr-link" href={segment.url} target="_blank" rel="noopener noreferrer">{segment.url}</a>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .quoted {
    display: block;
    border: 1.5px solid var(--border);
    border-radius: 10px;
    padding: 10px 14px;
    margin: 6px 0;
    background: var(--bg);
  }

  .quoted-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 5px;
  }

  .quoted-avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    font-weight: 700;
    font-family: var(--font-ui);
    flex-shrink: 0;
    overflow: hidden;
  }

  .quoted-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }

  .quoted-name {
    font-size: 12px;
    font-weight: 700;
    color: var(--ink);
    font-family: var(--font-ui);
  }

  .quoted-content {
    font-size: 13px;
    color: var(--ink2);
    line-height: 1.7;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .text-seg {
    white-space: pre-wrap;
  }

  .emoji-img {
    height: 1.2em;
    width: auto;
    vertical-align: middle;
    display: inline;
  }

  .mention-link,
  .quote-ref-link,
  .naddr-link {
    color: var(--accent);
    text-decoration: none;
    font-size: 12px;
  }

  .mention-link {
    font-weight: 600;
    font-size: inherit;
  }

  .mention-link:hover,
  .quote-ref-link:hover,
  .naddr-link:hover {
    text-decoration: underline;
  }

  .quoted-error {
    font-size: 12px;
    color: var(--ink3);
    font-family: var(--font-ui);
  }

  .quoted-state {
    font-size: 12px;
    color: var(--ink3);
    font-style: italic;
    font-family: var(--font-ui);
  }
</style>
