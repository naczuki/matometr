<script lang="ts">
  import { onMount } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import type { Note } from '$lib/types';
  import { fetchNoteById } from '$lib/services/NostrClient';
  import { profiles, requestProfile } from '$lib/stores/profiles';
  import { avatarStyle } from '$lib/utils/avatar';
  import { timeAgo } from '$lib/utils/time';

  export let nevent: string;
  export let comment: string | null;
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
    <div class="note-content">{note.content}</div>
    {#if comment}
      <div class="editor-comment">
        <span class="editor-label">まとめコメント</span>
        {comment}
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
    white-space: pre-wrap;
    word-break: break-word;
  }

  .editor-comment {
    margin-top: 12px;
    padding: 10px 14px;
    background: var(--bg);
    border-radius: 10px;
    border: 1.5px solid var(--border);
    font-size: 13px;
    color: var(--ink2);
    line-height: 1.7;
  }

  .editor-label {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    color: var(--accent);
    background: var(--accent-mid);
    padding: 1px 8px;
    border-radius: var(--radius-btn);
    margin-right: 8px;
    margin-bottom: 4px;
    font-family: var(--font-ui);
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
