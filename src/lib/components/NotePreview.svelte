<script lang="ts">
  import { nip19 } from 'nostr-tools';
  import type { Note } from '$lib/types';
  import { profiles, requestProfile } from '$lib/stores/profiles';
  import { avatarStyle } from '$lib/utils/avatar';
  import { timeAgo } from '$lib/utils/time';
  import { extractImages, parseNostrRefs, isSafeUrl } from '$lib/utils/nostrContent';

  export let note: Note;
  export let selected = false;
  export let onClick: (note: Note) => void;

  $: requestProfile(note.pubkey);
  $: profile = $profiles.get(note.pubkey);
  $: style = avatarStyle(note.pubkey);
  $: picture = profile?.picture;
  $: author = profile?.displayName ?? profile?.name ?? shortNpub(note.pubkey);
  $: parsed = extractImages(note.content);
  $: emojiMap = buildEmojiMap(note);
  $: segments = parseNostrRefs(parsed.text, emojiMap);

  function shortNpub(pubkey: string): string {
    try {
      const npub = nip19.npubEncode(pubkey);
      return npub.slice(0, 10) + '…';
    } catch {
      return pubkey.slice(0, 8) + '…';
    }
  }

  function truncateName(name: string, max = 30): string {
    return name.length > max ? name.slice(0, max) + '…' : name;
  }

  function buildEmojiMap(n: Note): Map<string, string> {
    const m = new Map<string, string>();
    for (const tag of n.tags) {
      if (tag[0] === 'emoji' && tag[1] && tag[2] && isSafeUrl(tag[2])) m.set(tag[1], tag[2]);
    }
    return m;
  }

  function hideOnError(e: Event): void {
    (e.currentTarget as HTMLElement).style.display = 'none';
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
      <div class="avatar" style="background:{style.bg};color:{style.fg};">
        {#if picture}
          <img src={picture} alt="" on:error={hideOnError} />
        {:else}
          {style.initial}
        {/if}
      </div>
      <span class="author">{truncateName(author)}</span>
      <span class="time">{timeAgo(note.createdAt)}</span>
    </div>
    <div class="content">
      {#each segments as seg}
        {#if seg.type === 'text'}<span class="text-seg">{seg.content}</span>
        {:else if seg.type === 'mention'}@{shortNpub(seg.pubkey)}
        {:else if seg.type === 'url'}<span class="url">{seg.url}</span>
        {:else if seg.type === 'emoji'}<img src={seg.url} alt=":{seg.shortcode}:" class="emoji" loading="lazy" />
        {:else if seg.type === 'quote'}<span class="ref">nostr:nevent…</span>
        {:else if seg.type === 'naddr'}<span class="ref">nostr:naddr…</span>
        {/if}
      {/each}
    </div>
    {#if parsed.urls.length > 0}
      <div class="images" class:multi={parsed.urls.length > 1}>
        {#each parsed.urls.slice(0, 4) as url}
          <img src={url} alt="" loading="lazy" on:error={hideOnError} />
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

  .avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    flex-shrink: 0;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    font-family: var(--font-ui);
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
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
    height: 1.2em;
    width: auto;
    vertical-align: middle;
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

  .images img {
    width: 100%;
    max-height: 180px;
    object-fit: cover;
    border-radius: 8px;
    display: block;
  }
</style>
