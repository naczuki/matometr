<script lang="ts">
  import { base } from '$app/paths';
  import MatomeList from '$lib/components/MatomeList.svelte';
  import { currentUser } from '$lib/stores/currentUser';
  import type { Tab } from '$lib/types';

  let activeTab: Tab = 'recent';

  function handleLoginClick(): void {
    document.dispatchEvent(new CustomEvent('nlLaunch', { detail: 'welcome-login' }));
  }
</script>

<svelte:head>
  <title>まとめたー — Nostr キュレーション</title>
  <meta name="description" content="Nostrの投稿を集めて、コメントを添えて公開できるキュレーションサイト" />
</svelte:head>

{#if !$currentUser}
  <div class="banner-wrap">
    <div class="banner">
      <div class="banner-text">
        <b>ログインするとまとめを作れます</b><br />
        拡張機能・Nostr Connect・nsecに対応しています
      </div>
      <div class="banner-actions">
        <button class="btn-login-sm" on:click={handleLoginClick}>ログイン / 新規登録</button>
      </div>
    </div>
  </div>
{/if}

<div class="tab-bar">
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
  <a href="{base}/new" class="btn-create">＋ まとめを作る</a>
</div>

<MatomeList tab={activeTab} />

<style>
  .banner-wrap {
    max-width: 960px;
    margin: 0 auto;
    padding: 16px 20px 0;
  }

  .banner {
    background: var(--surface);
    border: 1.5px solid var(--accent-mid);
    border-radius: var(--radius-card);
    padding: 16px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  .banner-text {
    font-size: 14px;
    color: var(--ink2);
  }

  .banner-text b {
    color: var(--ink);
  }

  .banner-actions {
    display: flex;
    gap: 8px;
  }

  .btn-login-sm {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-btn);
    padding: 7px 18px;
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.12s;
    white-space: nowrap;
  }

  .btn-login-sm:hover {
    background: var(--accent-dark);
  }

  .tab-bar {
    max-width: 960px;
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

  .tab:hover {
    color: var(--ink2);
    background: var(--surface);
  }

  .tab.active {
    background: var(--surface);
    color: var(--accent);
    font-weight: 700;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
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
