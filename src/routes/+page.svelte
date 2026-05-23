<script lang="ts">
  import { base } from '$app/paths';
  import MatomeList from '$lib/components/MatomeList.svelte';

  let listRef: MatomeList | undefined;
  let refreshing = false;

  async function handleRefresh(): Promise<void> {
    if (refreshing || !listRef) return;
    refreshing = true;
    await listRef.refresh();
    refreshing = false;
  }
</script>

<svelte:head>
  <title>まとめたー - matometr</title>
  <meta name="description" content="Nostrの投稿を集めて、コメントを添えて公開できるキュレーションサイト" />
</svelte:head>

<div class="tab-bar">
  <div class="tabs">
    <button
      class="tab active"
      class:loading={refreshing}
      on:click={handleRefresh}
      disabled={refreshing}
      aria-busy={refreshing}
    >
      {#if refreshing}
        <span class="btn-spinner" aria-hidden="true"></span>
      {/if}
      更新
    </button>
  </div>
  <a href="{base}/new" class="btn-create">＋ まとめを作る</a>
</div>

<MatomeList tab="recent" bind:this={listRef} />

<style>
  .tab-bar {
    max-width: 720px;
    margin: 0 auto;
    padding: 20px 20px 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }

  .tabs {
    display: flex;
    gap: 4px;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 20px;
    border-radius: var(--radius-btn);
    font-size: 13px;
    font-weight: 500;
    color: var(--ink3);
    cursor: pointer;
    font-family: var(--font-ui);
    transition: all 0.12s;
    border: none;
    background: transparent;
  }

  .tab:hover:not(:disabled) {
    color: var(--ink2);
    background: var(--surface);
  }

  .tab.active {
    background: var(--surface);
    color: var(--accent);
    font-weight: 700;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
  }

  .tab.active.loading {
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.12);
    opacity: 0.75;
    cursor: not-allowed;
  }

  .btn-spinner {
    display: inline-block;
    width: 11px;
    height: 11px;
    border: 2px solid var(--accent);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .btn-create {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-btn);
    padding: 8px 20px;
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    text-decoration: none;
    transition: background 0.12s;
    white-space: nowrap;
  }

  .btn-create:hover {
    background: var(--accent-dark);
  }
</style>
