<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { nip19 } from 'nostr-tools';
  import type { Matome } from '$lib/entities/Matome';
  import { avatarStyle } from '$lib/utils/avatar';
  import { timeAgo } from '$lib/utils/time';
  import { profiles, requestProfile } from '$lib/stores/profiles';

  export let matome: Matome;

  onMount(() => {
    requestProfile(matome.pubkey);
  });

  $: profile = $profiles.get(matome.pubkey);

  $: displayName = profile?.displayName ?? profile?.name ?? fallbackNpub(matome.pubkey);
  $: picture = profile?.picture ?? null;

  $: style = avatarStyle(matome.pubkey);

  $: preview = (() => {
    if (matome.summary) return matome.summary;
    const block = matome.blocks.find((b) => b.type === 'paragraph' || b.type === 'comment');
    return block?.content ?? '';
  })();

  $: firstTag = matome.tags[0] ?? '';
  $: elapsed = timeAgo(matome.createdAt);

  let imgFailed = false;
  $: picture, (imgFailed = false);

  function fallbackNpub(pubkey: string): string {
    try {
      return nip19.npubEncode(pubkey).slice(0, 12) + '…';
    } catch {
      return pubkey.slice(0, 8) + '…';
    }
  }
</script>

<a href="{base}/matome/{matome.naddr}" class="card">
  <div class="author">
    <div class="avatar" style="background:{style.bg};color:{style.fg};">
      {#if picture && !imgFailed}
        <img src={picture} alt="" on:error={() => (imgFailed = true)} />
      {:else}
        {style.initial}
      {/if}
    </div>
    <span class="author-name">{displayName}</span>
    <span class="time">{elapsed}</span>
  </div>
  <div class="title">{matome.title}</div>
  {#if preview}
    <div class="preview">{preview}</div>
  {/if}
  <div class="footer">
    <span class="count">{matome.postCount}件の投稿</span>
    {#if firstTag}
      <span class="tag">#{firstTag}</span>
    {/if}
    {#if matome.isNosli}
      <span class="nosli-badge">nosli</span>
    {/if}
  </div>
</a>

<style>
  .card {
    display: block;
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: var(--radius-card);
    padding: 18px;
    cursor: pointer;
    transition:
      box-shadow 0.15s,
      border-color 0.15s,
      transform 0.12s;
    text-decoration: none;
    color: inherit;
  }

  .card:hover {
    box-shadow: 0 6px 20px rgba(249, 115, 22, 0.1);
    border-color: var(--accent-mid);
    transform: translateY(-2px);
  }

  .author {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 700;
    overflow: hidden;
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }

  .author-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--ink2);
  }

  .time {
    font-size: 11px;
    color: var(--ink3);
    margin-left: auto;
  }

  .title {
    font-family: var(--font-ui);
    font-size: 15px;
    font-weight: 700;
    color: var(--ink);
    line-height: 1.5;
    margin-bottom: 10px;
  }

  .preview {
    font-size: 12px;
    color: var(--ink2);
    line-height: 1.6;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: 12px;
  }

  .footer {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .count {
    font-size: 11px;
    color: var(--ink3);
    background: var(--bg);
    padding: 3px 10px;
    border-radius: var(--radius-btn);
    border: 1px solid var(--border2);
    font-family: var(--font-ui);
  }

  .tag {
    font-size: 11px;
    color: var(--accent-dark);
    background: var(--accent-mid);
    padding: 3px 10px;
    border-radius: var(--radius-btn);
    font-family: var(--font-ui);
    font-weight: 500;
  }

  .nosli-badge {
    font-size: 11px;
    color: var(--ink3);
    background: var(--bg);
    padding: 3px 10px;
    border-radius: var(--radius-btn);
    border: 1px solid var(--border2);
    font-family: var(--font-ui);
    font-style: italic;
  }
</style>
