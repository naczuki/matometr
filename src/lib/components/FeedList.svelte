<script lang="ts">
  import { onDestroy } from 'svelte';
  import Spinner from '$lib/components/Spinner.svelte';

  export let loading: boolean = false;
  export let loadingMore: boolean = false;
  export let error: string = '';
  export let empty: boolean = false;
  export let reachedEnd: boolean = false;
  export let emptyMessage: string = '投稿が見つかりませんでした';
  export let loadingMessage: string = '読み込み中…';
  export let onLoadMore: (() => void) | null = null;

  let sentinel: HTMLDivElement | undefined;
  let observer: IntersectionObserver | undefined;

  function setupObserver(node: HTMLDivElement): void {
    sentinel = node;
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && onLoadMore && !loadingMore && !reachedEnd) {
          onLoadMore();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(node);
  }

  $: if (sentinel && observer && !loadingMore && !reachedEnd && onLoadMore) {
    observer.unobserve(sentinel);
    observer.observe(sentinel);
  }

  onDestroy(() => {
    observer?.disconnect();
  });
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
      <div class="sentinel" use:setupObserver>
        {#if loadingMore}
          <Spinner />
        {/if}
      </div>
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

  .sentinel {
    display: flex;
    justify-content: center;
    padding: 16px 0;
    min-height: 1px;
  }
</style>
