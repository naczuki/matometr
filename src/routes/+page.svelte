<script lang="ts">
  import { base } from '$app/paths';
  import MatomeList from '$lib/components/MatomeList.svelte';
  import { currentUser } from '$lib/stores/auth';
</script>

<svelte:head>
  <title>まとめたー - matometr</title>
  <meta name="description" content="Nostrの投稿を集めて、コメントを添えて公開できるキュレーションサイト" />
</svelte:head>

<div class="tab-bar">
  <div class="tab-label">
    <span class="label-text">新着順</span>
    <span class="label-line" aria-hidden="true"></span>
  </div>
  {#if $currentUser}
    <a href="{base}/new" class="btn-create">＋ まとめを作る</a>
  {/if}
</div>

<MatomeList tab="recent" />

<style>
  .tab-bar {
    max-width: 720px;
    margin: 0 auto;
    padding: 0 20px 8px;
    height: 48px;
    display: flex;
    align-items: flex-end;
    gap: 12px;
  }

  .tab-label {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    flex: 1;
  }

  .label-text {
    font-size: 13px;
    font-weight: 500;
    color: #bbb;
    white-space: nowrap;
    line-height: 1;
    font-family: var(--font-ui);
  }

  .label-line {
    flex: 1;
    height: 0.5px;
    background: #ddd;
    margin-bottom: 1px;
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
