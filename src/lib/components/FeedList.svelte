<script lang="ts">
  import Spinner from '$lib/components/Spinner.svelte';

  export let loading: boolean = false;
  export let loadingMore: boolean = false;
  export let error: string = '';
  export let empty: boolean = false;
  export let reachedEnd: boolean = false;
  export let emptyMessage: string = '投稿が見つかりませんでした';
  export let loadingMessage: string = '読み込み中…';
  export let onLoadMore: (() => void) | null = null;
</script>

{#if loading}
  <div class="state">
    <Spinner />
    <div class="state-text">{loadingMessage}</div>
  </div>
{:else if error}
  <div class="state">
    <div class="state-text">{error}</div>
  </div>
{:else if empty}
  <div class="state">
    <div class="state-text">{emptyMessage}</div>
  </div>
{:else}
  <div class="feed">
    <slot />
    {#if !reachedEnd && onLoadMore}
      <button class="load-more" on:click={onLoadMore} disabled={loadingMore}>
        {loadingMore ? '読み込み中…' : 'もっと読み込む'}
      </button>
    {/if}
  </div>
{/if}

<style>
  .state {
    text-align: center;
    padding: 40px 16px;
  }

  .state-text {
    font-size: 13px;
    color: var(--ink3);
    font-family: var(--font-ui);
  }

  .feed {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 16px;
  }

  .load-more {
    background: var(--surface);
    border: 1.5px dashed var(--accent-mid);
    color: var(--accent-dark);
    font-family: var(--font-ui);
    font-weight: 700;
    font-size: 13px;
    padding: 10px 20px;
    border-radius: 999px;
    cursor: pointer;
    align-self: center;
    margin: 8px auto 0;
    transition: all 0.12s;
  }

  .load-more:hover:not(:disabled) {
    border-color: var(--accent);
    background: var(--accent-pale);
  }

  .load-more:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
