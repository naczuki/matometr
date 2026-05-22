<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Subscription } from 'rxjs';
  import { fetchAllMatomeList } from '$lib/services/NostrClient';
  import { Matome } from '$lib/entities/Matome';
  import MatomeCard from '$lib/components/MatomeCard.svelte';
  import Spinner from '$lib/components/Spinner.svelte';
  import type { Tab } from '$lib/types';

  export let tab: Tab;

  let loading = true;
  let loadingMore = false;
  let hasMore = true;
  let matomes: Matome[] = [];
  let subs: Subscription[] = [];

  const rawMap = new Map<string, Matome>();

  function addMatome(m: Matome): void {
    const key = `${m.pubkey}:${m.dTag}`;
    const existing = rawMap.get(key);
    if (!existing || m.createdAt > existing.createdAt) {
      rawMap.set(key, m);
      matomes = [...rawMap.values()].sort((a, b) => b.createdAt - a.createdAt);
    }
  }

  function loadMore(): void {
    if (loadingMore || !hasMore || matomes.length === 0) return;
    loadingMore = true;
    const until = Math.min(...matomes.map((m) => m.createdAt)) - 1;
    const sizeBefore = rawMap.size;

    const s = fetchAllMatomeList(30, until).subscribe({
      next: addMatome,
      complete: () => {
        loadingMore = false;
        if (rawMap.size === sizeBefore) hasMore = false;
      },
      error: () => {
        loadingMore = false;
      }
    });
    subs = [...subs, s];
  }

  onMount(() => {
    const s = fetchAllMatomeList(30).subscribe({
      next: addMatome,
      complete: () => { loading = false; },
      error: () => { loading = false; }
    });
    subs = [s];
  });

  onDestroy(() => {
    subs.forEach((s) => s.unsubscribe());
  });

  $: items = tab === 'following' ? [] : matomes;
  $: showFollowingMsg = tab === 'following';
</script>

{#if loading}
  <div class="state-wrap">
    <Spinner />
    <div class="state-text">読み込み中…</div>
  </div>
{:else if showFollowingMsg}
  <div class="state-wrap">
    <div class="state-icon">👥</div>
    <div class="state-text">フォロー機能は準備中です</div>
  </div>
{:else if items.length === 0}
  <div class="state-wrap">
    <div class="state-icon">📋</div>
    <div class="state-text">まだまとめがありません</div>
  </div>
{:else}
  <div class="grid">
    {#each items as matome (matome.id)}
      <MatomeCard {matome} />
    {/each}
  </div>
  {#if hasMore}
    <div class="load-more-wrap">
      <button class="btn-load-more" on:click={loadMore} disabled={loadingMore}>
        {loadingMore ? '読み込み中…' : 'もっと見る'}
      </button>
    </div>
  {/if}
{/if}

<style>
  .grid {
    max-width: 720px;
    margin: 0 auto;
    padding: 16px 20px 48px;
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .state-wrap {
    max-width: 720px;
    margin: 48px auto;
    padding: 0 20px;
    text-align: center;
  }

  .state-icon {
    font-size: 40px;
    margin-bottom: 12px;
  }

  .state-text {
    font-size: 14px;
    color: var(--ink3);
    font-family: var(--font-ui);
  }

  .load-more-wrap {
    max-width: 720px;
    margin: 0 auto;
    padding: 0 20px 48px;
    display: flex;
    justify-content: center;
  }

  .btn-load-more {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 28px;
    border: 1.5px solid var(--border2);
    border-radius: var(--radius-btn);
    background: var(--surface);
    color: var(--ink2);
    font-size: 14px;
    font-weight: 600;
    font-family: var(--font-ui);
    cursor: pointer;
    transition: all 0.12s;
  }

  .btn-load-more:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-pale);
  }

  .btn-load-more:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
