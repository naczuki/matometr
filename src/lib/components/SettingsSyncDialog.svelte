<script lang="ts">
  import { tick } from 'svelte';
  import { localSettings } from '$lib/stores/clientSettings';
  import {
    acceptRemoteSettings,
    chooseLocalSettings,
    chooseRemoteSettings,
    closeSyncDialog,
    declineRemoteSettings,
    settingsSyncDialog
  } from '$lib/services/settingsSync';
  import { formatAbsoluteTime } from '$lib/utils/time';

  // 他の端末の設定についての確認（競合 / 初期状態の端末での読み込み）。どのページでも出る。

  $: dialog = $settingsSyncDialog;
  $: busy = dialog?.busy ?? false;
  $: localSavedAt =
    $localSettings.updatedAt > 0
      ? formatAbsoluteTime(Math.floor($localSettings.updatedAt / 1000))
      : '';
  $: remoteSavedAt = dialog ? formatAbsoluteTime(dialog.remoteCreatedAt) : '';

  let boxEl: HTMLDivElement | null = null;
  $: if (dialog) {
    tick().then(() => boxEl?.querySelector<HTMLElement>('.close-btn')?.focus());
  }
</script>

{#if dialog}
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="sync-dialog-title"
    on:click|self={closeSyncDialog}
    on:keydown={(e) => {
      if (e.key === 'Escape') closeSyncDialog();
    }}
  >
    <div class="box" bind:this={boxEl}>
      <button class="close-btn" aria-label="閉じる" disabled={busy} on:click={closeSyncDialog}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {#if dialog.type === 'conflict'}
        <p class="title" id="sync-dialog-title">他の設定データがあります。どちらを使いますか？</p>
        <div class="choices">
          <button class="btn-primary" disabled={busy} on:click={chooseLocalSettings}>
            この端末の設定{localSavedAt ? `（${localSavedAt} に保存）` : ''}
          </button>
          <button class="btn-secondary" disabled={busy} on:click={chooseRemoteSettings}>
            他の端末の設定（{remoteSavedAt} に保存）
          </button>
        </div>
      {:else}
        <p class="title" id="sync-dialog-title">
          他の端末で保存した設定があります。読み込みますか？
        </p>
        <div class="choices">
          <button class="btn-primary" disabled={busy} on:click={acceptRemoteSettings}>
            読み込む
          </button>
          <button class="btn-secondary" disabled={busy} on:click={declineRemoteSettings}>
            読み込まない
          </button>
        </div>
      {/if}

      {#if dialog.error}
        <p class="error" role="alert">{dialog.error}</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 300;
    padding: 16px;
  }

  .box {
    position: relative;
    background: var(--surface);
    border-radius: 18px;
    padding: 28px 20px 20px;
    max-width: 400px;
    width: 100%;
    box-shadow: var(--shadow-dialog-sm);
  }

  .close-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-btn);
    border: none;
    background: var(--bg);
    color: var(--ink2);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.12s;
  }

  .close-btn:not(:disabled):hover {
    background: var(--accent-mid);
  }

  .title {
    font-family: var(--font-ui);
    font-size: 16px;
    font-weight: 800;
    color: var(--ink);
    margin: 0 36px 18px 0;
    line-height: 1.6;
  }

  .choices {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .btn-primary,
  .btn-secondary {
    width: 100%;
    padding: 11px 16px;
    border-radius: var(--radius-btn);
    font-size: 14px;
    font-weight: 700;
    font-family: var(--font-ui);
    cursor: pointer;
    transition:
      background 0.12s,
      border-color 0.12s;
  }

  .btn-primary {
    border: none;
    background: var(--accent);
    color: #fff;
  }

  .btn-primary:not(:disabled):hover {
    background: var(--accent-dark);
  }

  .btn-secondary {
    border: 1.5px solid var(--border2);
    background: var(--surface);
    color: var(--ink2);
  }

  .btn-secondary:not(:disabled):hover {
    border-color: var(--ink2);
    background: var(--bg);
  }

  .btn-primary:disabled,
  .btn-secondary:disabled,
  .close-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error {
    font-size: 13px;
    color: #dc2626;
    margin: 12px 0 0;
  }
</style>
