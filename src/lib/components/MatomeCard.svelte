<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { nip19 } from 'nostr-tools';
  import type { Matome } from '$lib/entities/Matome';
  import { timeAgo } from '$lib/utils/time';
  import Avatar from '$lib/components/Avatar.svelte';
  import { profiles, requestProfile } from '$lib/stores/profiles';

  export let matome: Matome;

  onMount(() => {
    requestProfile(matome.pubkey);
  });

  $: profile = $profiles.get(matome.pubkey);

  $: displayName = profile?.displayName ?? profile?.name ?? fallbackNpub(matome.pubkey);
  $: picture = profile?.picture ?? null;

  $: preview = (() => {
    if (matome.summary) return matome.summary;
    const block = matome.blocks.find((b) => b.type === 'paragraph' || b.type === 'comment');
    return block?.content ?? '';
  })();

  $: firstTag = matome.tags[0] ?? '';
  $: elapsed = timeAgo(matome.createdAt);

  function fallbackNpub(pubkey: string): string {
    try {
      return nip19.npubEncode(pubkey).slice(0, 12) + '…';
    } catch {
      return pubkey.slice(0, 8) + '…';
    }
  }
</script>

<a href="{base}/matome/?id={matome.naddr}" class="card">
  <div class="author">
    <Avatar pubkey={matome.pubkey} {picture} size={28} />
    <span class="author-name">{displayName}</span>
    <span class="time"><span class="time-label">更新</span>{elapsed}</span>
  </div>
  <div class="title">{matome.title}</div>
  {#if preview}
    <div class="preview">{preview}</div>
  {/if}
  <div class="footer">
    <span class="count">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>{matome.postCount}件
    </span>
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

  .author-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--ink2);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .time {
    font-size: 12px;
    color: var(--ink3);
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .time-label {
    font-size: 12px;
    font-weight: 400;
  }

  .title {
    font-family: var(--font-ui);
    font-size: 16px;
    font-weight: 700;
    color: var(--ink);
    line-height: 1.5;
    margin-bottom: 10px;
    overflow-wrap: break-word;
  }

  .preview {
    font-size: 14px;
    color: var(--ink2);
    line-height: 1.6;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: 12px;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .footer {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .count {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--ink3);
    background: var(--bg);
    padding: 3px 10px;
    border-radius: var(--radius-btn);
    border: 1px solid var(--border2);
    font-family: var(--font-ui);
  }

  .count svg {
    flex-shrink: 0;
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
