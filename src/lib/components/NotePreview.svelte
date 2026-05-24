<script lang="ts">
  import type { Note } from '$lib/types';
  import { profiles, requestProfile } from '$lib/stores/profiles';
  import { timeAgo } from '$lib/utils/time';
  import { extractImages, parseNostrRefs, buildEmojiMap } from '$lib/utils/nostrContent';
  import { shortNpubFromPubkey } from '$lib/utils/nostr';
  import Avatar from '$lib/components/Avatar.svelte';

  export let note: Note;
  export let selected = false;
  export let onClick: (note: Note) => void;

  $: requestProfile(note.pubkey);
  $: profile = $profiles.get(note.pubkey);
  $: picture = profile?.picture ?? null;
  $: author = profile?.displayName ?? profile?.name ?? shortNpubFromPubkey(note.pubkey);
  $: parsed = extractImages(note.content);
  $: emojiMap = buildEmojiMap(note.tags);
  $: segments = parseNostrRefs(parsed.text, emojiMap);

  function truncateName(name: string, max = 30): string {
    return name.length > max ? name.slice(0, max) + '…' : name;
  }

  function hideOnError(e: Event): void {
    const el = e.currentTarget as HTMLElement;
    const item = el.closest<HTMLElement>('.media-item');
    if (item) item.style.display = 'none';
    else el.style.display = 'none';
  }
</script>

<button
  class="post"
  class:selected
  on:click={() => onClick(note)}
  type="button"
>
  <div class="check" aria-hidden="true">{selected ? '✓' : ''}</div>
  <div class="post-body">
    <div class="post-header">
      <Avatar pubkey={note.pubkey} {picture} size={26} />
      <span class="author">{truncateName(author)}</span>
      <span class="time">{timeAgo(note.createdAt)}</span>
    </div>
    <div class="content">
      {#each segments as seg}
        {#if seg.type === 'text'}<span class="text-seg">{seg.content}</span>
        {:else if seg.type === 'mention'}@{shortNpubFromPubkey(seg.pubkey)}
        {:else if seg.type === 'url'}<span class="url">{seg.url}</span>
        {:else if seg.type === 'emoji'}<img src={seg.url} alt=":{seg.shortcode}:" class="emoji" loading="lazy" />
        {:else if seg.type === 'quote'}<span class="ref">nostr:nevent…</span>
        {:else if seg.type === 'naddr'}<span class="ref">nostr:naddr…</span>
        {/if}
      {/each}
    </div>
    {#if parsed.urls.length > 0}
      <div class="images" class:multi={parsed.urls.length > 1}>
        {#each parsed.urls.slice(0, 4) as url, i}
          <div class="media-item">
            <img src={url} alt="" loading="lazy" on:error={hideOnError} />
            {#if i === 3 && parsed.urls.length > 4}
              <span class="more-badge">+{parsed.urls.length - 3}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
    {#if parsed.videoUrls.length > 0}
      <div class="images" class:multi={parsed.videoUrls.length > 1}>
        {#each parsed.videoUrls.slice(0, 4) as url, i}
          <div class="media-item">
            <video src={url} controls playsinline on:error={hideOnError}>
              <track kind="captions" />
            </video>
            {#if i === 3 && parsed.videoUrls.length > 4}
              <span class="more-badge">+{parsed.videoUrls.length - 3}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</button>

<style>
  .post {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    text-align: left;
    width: 100%;
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: 12px;
    padding: 10px 12px;
    cursor: pointer;
    font: inherit;
    color: inherit;
    transition: border-color 0.12s, background 0.12s;
  }

  .post:hover {
    border-color: var(--accent-mid);
  }

  .post.selected {
    border-color: var(--accent);
    background: var(--accent-pale);
  }

  .check {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    border-radius: 50%;
    border: 1.5px solid var(--border2);
    background: var(--surface);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    color: #fff;
    margin-top: 2px;
  }

  .post.selected .check {
    background: var(--accent);
    border-color: var(--accent);
  }

  .post-body {
    flex: 1;
    min-width: 0;
  }

  .post-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .author {
    font-size: 12px;
    font-weight: 700;
    color: var(--ink);
    font-family: var(--font-ui);
    overflow-wrap: anywhere;
    word-break: break-word;
    min-width: 0;
  }

  .time {
    font-size: 11px;
    color: var(--ink3);
    margin-left: auto;
    flex-shrink: 0;
  }

  .content {
    font-size: 13px;
    line-height: 1.55;
    color: var(--ink);
    overflow-wrap: anywhere;
    word-break: break-word;
    max-height: 7.5em;
    overflow: hidden;
  }

  .text-seg {
    white-space: pre-wrap;
  }

  .url,
  .ref {
    color: var(--accent);
    word-break: break-all;
  }

  .emoji {
    max-height: 1.55em;
    max-width: 100%;
    vertical-align: top;
    display: inline;
  }

  .images {
    display: grid;
    grid-template-columns: 1fr;
    gap: 4px;
    margin-top: 8px;
  }

  .images.multi {
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
</style>
