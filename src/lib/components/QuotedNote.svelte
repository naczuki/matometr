<script lang="ts">
  import { onMount } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import { base } from '$app/paths';
  import type { Note } from '$lib/types';
  import { fetchNoteById } from '$lib/services/NostrClient';
  import { profiles, requestProfile } from '$lib/stores/profiles';
  import { parseNostrRefs, extractImages, resolveTagRefs, buildEmojiMap } from '$lib/utils/nostrContent';
  import { shortNpubFromPubkey, resolveRepostTarget, externalNoteUrl } from '$lib/utils/nostr';
  import { timeAgo } from '$lib/utils/time';
  import Avatar from '$lib/components/Avatar.svelte';

  export let eventId: string;
  export let showDate: boolean = false;

  let note: Note | null = null;
  let failed = false;

  let repostSub: { unsubscribe(): void } | null = null;
  let resolvingRepost = false;
  let repostTimer: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sub = fetchNoteById(eventId).subscribe({
      next: (n) => {
        const repost = resolveRepostTarget(n);
        if (repost) {
          resolvingRepost = true;
          if (timer) { clearTimeout(timer); timer = null; }
          repostSub = fetchNoteById(repost.eventId).subscribe({
            next: (original) => {
              note = original;
              requestProfile(original.pubkey);
              if (repostTimer) { clearTimeout(repostTimer); repostTimer = null; }
            },
            error: () => { failed = true; },
            complete: () => { if (!note) failed = true; }
          });
          repostTimer = setTimeout(() => { if (!note) failed = true; }, 10_000);
          return;
        }
        if (n.kind === 1111) {
          failed = true;
          if (timer) clearTimeout(timer);
          return;
        }
        note = n;
        requestProfile(n.pubkey);
        if (timer) clearTimeout(timer);
      },
      error: () => { failed = true; },
      complete: () => { if (!note && !resolvingRepost) failed = true; }
    });
    timer = setTimeout(() => { if (!note && !resolvingRepost) failed = true; }, 10_000);
    return () => {
      sub.unsubscribe();
      repostSub?.unsubscribe();
      if (timer) clearTimeout(timer);
      if (repostTimer) clearTimeout(repostTimer);
    };
  });

  $: profile = note ? $profiles.get(note.pubkey) : undefined;
  $: authorName = profile?.displayName ?? profile?.name ?? shortNpubFromPubkey(note?.pubkey ?? '');
  $: picture = profile?.picture ?? null;

  $: emojiMap = note ? buildEmojiMap(note.tags) : new Map<string, string>();

  let failedEmojis: Set<string> = new Set();
  function onEmojiError(shortcode: string): void {
    failedEmojis = new Set([...failedEmojis, shortcode]);
  }

  $: ({ text: parsedText, urls: imageUrls, videoUrls } = note
    ? extractImages(resolveTagRefs(note.content, note.tags))
    : { text: '', urls: [], videoUrls: [] });
  $: segments = parseNostrRefs(parsedText, emojiMap);

  function hideMediaOnError(e: Event): void {
    const el = e.currentTarget as HTMLElement;
    const item = el.closest<HTMLElement>('.media-item');
    if (item) item.style.display = 'none';
    else el.style.display = 'none';
  }

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
      <Avatar pubkey={note.pubkey} {picture} size={20} />
      <span class="quoted-name">{truncateName(authorName)}</span>
      {#if showDate && note}
        <span class="quoted-date">{timeAgo(note.createdAt)}</span>
      {/if}
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
          {@const ne = safeNeventEncode(segment.eventId)}
          {#if ne}
            <a class="quote-ref-link" href={externalNoteUrl(ne)} target="_blank" rel="noopener noreferrer">
              nostr:{shortRef(ne)}
            </a>
          {/if}
        {:else if segment.type === 'naddr'}
          <a class="naddr-link" href="{base}/matome/?id={segment.naddr}" rel="noopener noreferrer">
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
    {#if imageUrls.length > 0}
      <div class="media-grid" class:multi={imageUrls.length > 1}>
        {#each imageUrls.slice(0, 4) as url, i}
          <div class="media-item">
            <img src={url} alt="" loading="lazy" on:error={hideMediaOnError} />
            {#if i === 3 && imageUrls.length > 4}
              <span class="more-badge">+{imageUrls.length - 3}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
    {#if videoUrls.length > 0}
      <div class="media-grid" class:multi={videoUrls.length > 1}>
        {#each videoUrls.slice(0, 4) as url, i}
          <div class="media-item">
            <video src={url} controls playsinline on:error={hideMediaOnError}>
              <track kind="captions" />
            </video>
            {#if i === 3 && videoUrls.length > 4}
              <span class="more-badge">+{videoUrls.length - 3}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
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

  .quoted-name {
    font-size: 12px;
    font-weight: 700;
    color: var(--ink);
    font-family: var(--font-ui);
  }

  .quoted-date {
    margin-left: auto;
    font-size: 11px;
    color: var(--ink3);
    white-space: nowrap;
    flex-shrink: 0;
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
    max-height: 1.7em;
    max-width: 100%;
    vertical-align: top;
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

  .media-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 4px;
    margin-top: 8px;
  }

  .media-grid.multi {
    grid-template-columns: 1fr 1fr;
  }

  .media-item {
    position: relative;
  }

  .media-item img,
  .media-item video {
    width: 100%;
    max-height: 180px;
    object-fit: cover;
    border-radius: 8px;
    display: block;
  }

  .more-badge {
    position: absolute;
    bottom: 6px;
    right: 6px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 12px;
    border-radius: 4px;
    padding: 2px 6px;
    font-family: var(--font-ui);
    line-height: 1.4;
    pointer-events: none;
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
