<script lang="ts">
  import MatomeList from '$lib/components/MatomeList.svelte';

  type Tab = 'recent' | 'trending' | 'following';
  let activeTab: Tab = 'recent';
</script>

<svelte:head>
  <title>まとめたー</title>
  <meta name="description" content="Nostrのキュレーションサイト" />
</svelte:head>

<div class="tabs">
  <button
    class="tab"
    class:active={activeTab === 'recent'}
    on:click={() => (activeTab = 'recent')}
  >
    新着
  </button>
  <button
    class="tab"
    class:active={activeTab === 'trending'}
    on:click={() => (activeTab = 'trending')}
  >
    話題
  </button>
  <button
    class="tab"
    class:active={activeTab === 'following'}
    on:click={() => (activeTab = 'following')}
  >
    フォロー中
  </button>
</div>

<MatomeList tab={activeTab} />

<style>
  .tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    border-bottom: 1.5px solid var(--border);
    padding-bottom: 0.5rem;
  }

  .tab {
    font-family: var(--font-ui);
    font-weight: 700;
    padding: 0.5rem 1rem;
    border-radius: var(--radius-btn);
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .tab:hover {
    background: var(--border);
    color: var(--text);
  }

  .tab.active {
    background: var(--accent);
    color: #fff;
  }
</style>
