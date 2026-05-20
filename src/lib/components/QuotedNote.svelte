<script lang="ts">
  import { onMount } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import type { Note } from '$lib/types';
  import { fetchNoteById } from '$lib/services/NostrClient';
  import { profiles, requestProfile } from '$lib/stores/profiles';
  import { avatarStyle } from '$lib/utils/avatar';

  export let eventId: string;

  let note: Note | null = null;
  let failed = false;

  onMount(() => {
    const sub = fetchNoteById(eventId).subscribe({
      next: (n) => { note = n; requestProfile(n.pubkey); },
      error: () => { failed = true; }
    });
    return () => sub.unsubscribe();
  });

  $: profile = note ? $profiles.get(note.pubkey) : undefined;
  $: authorName = profile?.displayName ?? profile?.name ?? shortNpub(note?.pubkey ?? '');
  $: authorStyle = note ? avatarStyle(note.pubkey) : { bg: '#e5e5e5', fg: '#737373', initial: '?' };
  $: picture = profile?.picture ?? null;

  let picFailed = false;
  $: picture, (picFailed = false);

  function shortNpub(pubkey: string): string {
    if (!pubkey) return '…';
    try {
      const npub = nip19.npubEncode(pubkey);
      return npub.slice(0, 8) + '…' + npub.slice(-4);
    } catch {
      return pubkey.slice(0, 8) + '…';
    }
  }

  function truncate(text: string, max = 140): string {
    const oneLiner = text.replace(/\n+/g, ' ');
    return oneLiner.length > max ? oneLiner.slice(0, max) + '…' : oneLiner;
  }
</script>

<div class="quoted">
  {#if failed}
    <span class="quoted-state">投稿を取得できませんでした</span>
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
      <span class="quoted-name">{authorName}</span>
    </div>
    <div class="quoted-content">{truncate(note.content)}</div>
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
    word-break: break-word;
  }

  .quoted-state {
    font-size: 12px;
    color: var(--ink3);
    font-style: italic;
    font-family: var(--font-ui);
  }
</style>
