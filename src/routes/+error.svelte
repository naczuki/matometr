<script lang="ts">
  import { page } from '$app/stores';
  import { base } from '$app/paths';

  $: status = $page.status;
  $: message = $page.error?.message ?? '';

  function reload(): void {
    location.reload();
  }
</script>

<svelte:head>
  <title>エラー | まとめたー</title>
</svelte:head>

<div class="error-wrap">
  <div class="error-icon">⚠️</div>
  <div class="error-title">
    {#if status === 404}
      ページが見つかりませんでした
    {:else}
      読み込みに失敗しました
    {/if}
  </div>
  <p class="error-text">
    {#if status === 404}
      お探しのページは存在しないか、移動された可能性があります。
    {:else}
      一時的な不具合が発生しました。少し待ってから再読み込みしてください。
    {/if}
  </p>
  {#if message && status !== 404}
    <p class="error-detail">{message}</p>
  {/if}
  <div class="error-actions">
    {#if status !== 404}
      <button class="error-btn" on:click={reload}>再読み込み</button>
    {/if}
    <a href="{base}/" class="error-link">トップへ戻る</a>
  </div>
</div>

<style>
  .error-wrap {
    max-width: 480px;
    margin: 64px auto;
    padding: 0 20px;
    text-align: center;
  }

  .error-icon {
    font-size: 44px;
    margin-bottom: 12px;
  }

  .error-title {
    font-family: var(--font-ui);
    font-size: 18px;
    font-weight: 800;
    color: var(--ink);
    margin-bottom: 8px;
  }

  .error-text {
    font-size: 14px;
    color: var(--ink3);
    line-height: 1.7;
    margin: 0 0 8px;
  }

  .error-detail {
    font-size: 12px;
    color: var(--ink3);
    font-family: monospace;
    word-break: break-all;
    margin: 0 0 16px;
  }

  .error-actions {
    display: flex;
    gap: 10px;
    justify-content: center;
    align-items: center;
    margin-top: 16px;
    flex-wrap: wrap;
  }

  .error-btn {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-btn);
    padding: 9px 20px;
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.12s;
  }

  .error-btn:hover {
    background: var(--accent-dark);
  }

  .error-link {
    color: var(--accent);
    font-size: 13px;
    font-weight: 700;
    text-decoration: none;
  }

  .error-link:hover {
    text-decoration: underline;
  }
</style>
