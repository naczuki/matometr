<script lang="ts">
  import { onMount } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import { base } from '$app/paths';
  import type { Note } from '$lib/types';
  import { fetchNoteById } from '$lib/services/NostrClient';
  import { profiles, requestProfile } from '$lib/stores/profiles';
  import { avatarStyle } from '$lib/utils/avatar';
  import { timeAgo } from '$lib/utils/time';
  import { parseNostrRefs, extractImages } from '$lib/utils/nostrContent';
  import QuotedNote from '$lib/components/QuotedNote.svelte';

  export let nevent: string;
  export let num: number;
  export let total: number;

  let note: Note | null = null;
  let loadError = false;

  onMount(() => {
    const str = nevent.replace('nostr:', '');
    let eventId: string;
    try {
      const decoded = nip19.decode(str);
      if (decoded.type === 'nevent') eventId = decoded.data.id;
      else if (decoded.type === 'note') eventId = decoded.data;
      else { loadError = true; return; }
    } catch {
      loadError = true;
      return;
    }

    const sub = fetchNoteById(eventId).subscribe({
      next: (n) => {
        note = n;
        requestProfile(n.pubkey);
      },
      error: () => { loadError = true; }
    });
    return () => sub.unsubscribe();
  });

  $: profile = note ? $profiles.get(note.pubkey) : undefined;
  $: authorName = profile?.displayName ?? profile?.name ?? shortNpub(note?.pubkey ?? '');
  $: authorStyle = note ? avatarStyle(note.pubkey) : { bg: '#e5e5e5', fg: '#737373', initial: '?' };
  $: picture = profile?.picture ?? null;

  let imgFailed = false;
  $: picture, (imgFailed = false);

  function shortNpub(pubkey: string): string {
    if (!pubkey) return '…';
    try {
      const npub = nip19.npubEncode(pubkey);
      return npub.slice(0, 8) + '…' + npub.slice(-4);
    } catch {
      return pubkey.slice(0, 8) + '…';
    }
  }

  $: parsedContent = note ? extractImages(note.content) : { text: '', urls: [] };
  $: segments = parseNostrRefs(parsedContent.text);

  // メンション対象のプロフィールをリクエスト
  $: for (const seg of segments) {
    if (seg.type === 'mention') requestProfile(seg.pubkey);
  }

  let failedImages: Set<string> = new Set();

  function onImgError(url: string): void {
    failedImages = new Set([...failedImages, url]);
  }

  function shortenNaddr(naddr: string): string {
    return naddr.slice(0, 12) + '…' + naddr.slice(-4);
  }
</script>

<div class="note-card">
  <div class="note-num">{num} / {total}</div>

  {#if loadError}
    <div class="load-error">この投稿は取得できませんでした</div>
  {:else if !note}
    <div class="load-placeholder">取得中…</div>
  {:else}
    <div class="note-header">
      <div class="avatar" style="background:{authorStyle.bg};color:{authorStyle.fg};">
        {#if picture && !imgFailed}
          <img src={picture} alt="" on:error={() => (imgFailed = true)} />
        {:else}
          {authorStyle.initial}
        {/if}
      </div>
      <div>
        <div class="note-name">{authorName}</div>
        <div class="note-pub">{shortNpub(note.pubkey)}</div>
      </div>
      <span class="note-time">{timeAgo(note.createdAt)}</span>
    </div>
    <div class="note-content">
      {#each segments as segment}
        {#if segment.type === 'text'}
          <span class="text-seg">{segment.content}</span>
        {:else if segment.type === 'mention'}
          {@const mp = $profiles.get(segment.pubkey)}
          <a
            class="mention-link"
            href="{base}/user/{nip19.npubEncode(segment.pubkey)}"
          >@{mp?.displayName ?? mp?.name ?? shortNpub(segment.pubkey)}</a>
        {:else if segment.type === 'quote'}
          <QuotedNote eventId={segment.eventId} />
        {:else if segment.type === 'naddr'}
          <a
            class="naddr-link"
            href="https://njump.me/{segment.naddr}"
            target="_blank"
            rel="noopener noreferrer"
          >nostr:{shortenNaddr(segment.naddr)}</a>
        {:else if segment.type === 'url'}
          <a
            class="url-link"
            href={segment.url}
            target="_blank"
            rel="noopener noreferrer"
          >{segment.url}</a>
        {/if}
      {/each}
    </div>
    {#if parsedContent.urls.length > 0}
      <div class="note-images" class:multi={parsedContent.urls.length > 1}>
        {#each parsedContent.urls as url}
          {#if failedImages.has(url)}
            <div class="img-error">
              <span>🖼 画像を読み込めませんでした</span>
              <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
            </div>
          {:else}
            <img
              src={url}
              alt=""
              class="note-img"
              loading="lazy"
              on:error={() => onImgError(url)}
            />
          {/if}
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .note-card {
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: var(--radius-card);
    padding: 18px;
    margin-bottom: 12px;
    transition: box-shadow 0.15s;
  }

  .note-card:hover {
    box-shadow: 0 4px 16px rgba(249, 115, 22, 0.08);
    border-color: var(--accent-mid);
  }

  .note-num {
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
    background: var(--accent-mid);
    padding: 2px 9px;
    border-radius: var(--radius-btn);
    display: inline-block;
    margin-bottom: 10px;
    font-family: var(--font-ui);
  }

  .note-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 11px;
  }

  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-ui);
    font-size: 14px;
    font-weight: 700;
    overflow: hidden;
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }

  .note-name {
    font-weight: 700;
    font-size: 13px;
    color: var(--ink);
    font-family: var(--font-ui);
  }

  .note-pub {
    font-size: 11px;
    color: var(--ink3);
    font-family: monospace;
  }

  .note-time {
    font-size: 12px;
    color: var(--ink3);
    flex-shrink: 0;
    margin-left: auto;
  }

  .note-content {
    font-size: 14px;
    line-height: 1.85;
    color: var(--ink);
    word-break: break-word;
  }

  .text-seg {
    white-space: pre-wrap;
  }

  .mention-link {
    color: var(--accent);
    text-decoration: none;
    font-weight: 600;
  }

  .mention-link:hover {
    text-decoration: underline;
  }

  .naddr-link {
    color: var(--accent);
    text-decoration: none;
    font-size: 12px;
    word-break: break-all;
  }

  .naddr-link:hover {
    text-decoration: underline;
  }

  .note-images {
    display: grid;
    grid-template-columns: 1fr;
    gap: 6px;
    margin-top: 10px;
  }

  .note-images.multi {
    grid-template-columns: 1fr 1fr;
  }

  .note-img {
    width: 100%;
    max-height: 200px;
    object-fit: cover;
    border-radius: 8px;
    display: block;
  }

  .url-link {
    color: var(--accent);
    text-decoration: none;
    word-break: break-all;
    font-size: 13px;
  }

  .url-link:hover {
    text-decoration: underline;
  }

  .img-error {
    width: 100%;
    background: var(--bg);
    border: 1.5px solid var(--border);
    border-radius: 10px;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    color: var(--ink3);
  }

  .img-error a {
    color: var(--accent);
    font-size: 11px;
    word-break: break-all;
    text-decoration: none;
  }

  .img-error a:hover {
    text-decoration: underline;
  }


  .load-placeholder {
    font-size: 13px;
    color: var(--ink3);
    padding: 8px 0;
    font-family: var(--font-ui);
  }

  .load-error {
    font-size: 13px;
    color: var(--ink3);
    padding: 8px 0;
    font-style: italic;
  }
</style>
