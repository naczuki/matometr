<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { nip19 } from 'nostr-tools';
  import type { AddressPointer } from 'nostr-tools/nip19';
  import { fetchMatomeByAddress } from '$lib/services/NostrClient';
  import { shortNpubFromPubkey } from '$lib/utils/nostr';
  import type { Matome } from '$lib/entities/Matome';

  export let ref: string;

  let matome: Matome | null = null;
  let loading = true;
  let failed = false;
  let naddrStr = '';

  onMount(() => {
    try {
      const m = ref.match(/nostr:(naddr1[a-z0-9]+)/);
      if (!m) { failed = true; loading = false; return; }
      naddrStr = m[1];
      const decoded = nip19.decode(naddrStr);
      if (decoded.type !== 'naddr' || decoded.data.kind !== 30023) {
        failed = true; loading = false; return;
      }
      const pointer = decoded.data as AddressPointer;
      const sub = fetchMatomeByAddress(pointer).subscribe({
        next: (a) => { matome = a; },
        complete: () => { loading = false; },
        error: () => { failed = true; loading = false; }
      });
      return () => sub.unsubscribe();
    } catch {
      failed = true;
      loading = false;
    }
  });
</script>

{#if loading}
  <div class="naddr-card loading">読み込み中…</div>
{:else if failed || !matome}
  <a class="naddr-card error" href="{base}/matome/{naddrStr}">
    <span class="naddr-icon">📄</span>
    <span class="naddr-fallback">{ref}</span>
  </a>
{:else}
  <a class="naddr-card" href="{base}/matome/{naddrStr}">
    <span class="naddr-icon">📋</span>
    <div class="naddr-body">
      <div class="naddr-title">{matome.title}</div>
      {#if matome.summary}
        <div class="naddr-summary">{matome.summary}</div>
      {/if}
      <div class="naddr-meta">{shortNpubFromPubkey(matome.pubkey)}</div>
    </div>
    <span class="naddr-arrow">›</span>
  </a>
{/if}

<style>
  .naddr-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 12px;
    border: 1.5px solid var(--border);
    background: var(--surface);
    text-decoration: none;
    color: inherit;
    margin: 12px 0;
    transition: border-color 0.12s, background 0.12s;
  }

  a.naddr-card:hover {
    border-color: var(--accent-mid);
    background: var(--accent-pale);
  }

  .naddr-card.loading {
    color: var(--ink3);
    font-size: 13px;
  }

  .naddr-card.error {
    color: var(--ink3);
  }

  .naddr-fallback {
    font-size: 12px;
    word-break: break-all;
  }

  .naddr-icon {
    font-size: 20px;
    flex-shrink: 0;
  }

  .naddr-body {
    flex: 1;
    min-width: 0;
  }

  .naddr-title {
    font-family: var(--font-ui);
    font-size: 14px;
    font-weight: 700;
    color: var(--ink);
    margin-bottom: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .naddr-summary {
    font-size: 12px;
    color: var(--ink2);
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .naddr-meta {
    font-size: 11px;
    color: var(--ink3);
    font-family: monospace;
    margin-top: 4px;
  }

  .naddr-arrow {
    color: var(--ink3);
    font-size: 20px;
    flex-shrink: 0;
  }
</style>
