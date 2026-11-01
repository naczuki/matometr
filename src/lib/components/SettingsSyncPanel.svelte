<script lang="ts">
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import { currentUser } from '$lib/stores/auth';
  import { localSettings, settingsSyncRecords } from '$lib/stores/clientSettings';
  import {
    loadSettingsFromNostr,
    saveSettingsToNostr,
    settingsSyncStatus,
    useLocalSettings,
    useRemoteSettings
  } from '$lib/services/settingsSync';
  import { hasUnsavedChanges } from '$lib/utils/clientLinks';
  import { formatAbsoluteTime } from '$lib/utils/time';

  // 設定画面上部の「Nostr で同期」。保存はボタンで、読み込みはログイン時に自動＋ボタンで行う。
  // 他の端末の保存とこの端末の未保存の変更が競合したら、どちらを使うか選んでもらう。

  $: pubkey = $currentUser?.pubkey ?? null;
  $: record = pubkey ? $settingsSyncRecords[pubkey] : undefined;
  $: unsaved = hasUnsavedChanges($localSettings, record);
  $: busy = $settingsSyncStatus.busy;
  $: conflict = $settingsSyncStatus.conflict;
  // 競合時のボタンに出す保存日時。この端末は最後に設定を変えた時刻、他の端末は Nostr の created_at。
  $: localSavedAt =
    $localSettings.updatedAt > 0
      ? formatAbsoluteTime(Math.floor($localSettings.updatedAt / 1000))
      : '';
  $: remoteSavedAt = conflict ? formatAbsoluteTime(conflict.remoteCreatedAt) : '';
  // 結果の表示は、その後に設定を変えたら消す（「保存しました」が未保存の変更と並ばないように）
  $: current = $settingsSyncStatus.at === $localSettings.updatedAt;

  let showLoadConfirm = false;

  function handleSave(): void {
    if (pubkey) void saveSettingsToNostr(pubkey);
  }

  function handleLoadClick(): void {
    if (unsaved) {
      showLoadConfirm = true;
    } else if (pubkey) {
      void loadSettingsFromNostr(pubkey);
    }
  }

  function handleLoadConfirm(): void {
    showLoadConfirm = false;
    if (pubkey) void loadSettingsFromNostr(pubkey);
  }

  function handleUseLocal(): void {
    if (pubkey) void useLocalSettings(pubkey);
  }

  function handleUseRemote(): void {
    if (pubkey) void useRemoteSettings(pubkey);
  }
</script>

<section class="sync">
  <h2 class="sync-title">Nostr で同期</h2>

  {#if !pubkey}
    <p class="sync-desc">
      ログインすると、この設定を暗号化して Nostr に保存し、ほかの端末やブラウザと同期できます。
    </p>
  {:else}
    <p class="sync-desc">
      設定を暗号化（NIP-44）して Nostr
      に保存します（kind:30078）。別の端末で保存した設定は、ログインしたときに読み込みます。保存・読み込みのときに、署名や暗号化の確認が出ることがあります。
    </p>

    <p class="sync-state" class:pending={(unsaved || conflict) && !busy}>
      {#if busy === 'load'}
        Nostr の設定を確認しています…
      {:else if busy === 'save'}
        Nostr に保存しています…
      {:else if conflict}
        他の設定データがあります。どちらを使いますか？
      {:else if unsaved}
        この端末に、Nostr へ保存していない変更があります。
      {:else if record}
        Nostr と同期済みです（{formatAbsoluteTime(record.remoteCreatedAt)} に保存された設定）。
      {:else}
        まだ Nostr に保存していません。
      {/if}
    </p>

    <div class="sync-actions">
      {#if conflict}
        <button class="btn-save" disabled={busy !== null} on:click={handleUseLocal}>
          この端末の設定{localSavedAt ? `（${localSavedAt} に保存）` : ''}
        </button>
        <button class="btn-load" disabled={busy !== null} on:click={handleUseRemote}>
          他の端末の設定（{remoteSavedAt} に保存）
        </button>
      {:else}
        <button class="btn-save" disabled={!unsaved || busy !== null} on:click={handleSave}>
          Nostr に保存
        </button>
        <button class="btn-load" disabled={busy !== null} on:click={handleLoadClick}>
          Nostr から読み込む
        </button>
      {/if}
    </div>

    {#if current && $settingsSyncStatus.error}
      <p class="sync-error" role="alert">{$settingsSyncStatus.error}</p>
    {:else if current && $settingsSyncStatus.message}
      <p class="sync-message" aria-live="polite">{$settingsSyncStatus.message}</p>
    {/if}
  {/if}
</section>

<ConfirmDialog
  open={showLoadConfirm}
  title="Nostr の設定を読み込みますか？"
  note="この端末の、Nostr へ保存していない変更は上書きされます。"
  confirmText="読み込む"
  cancelText="やめる"
  on:confirm={handleLoadConfirm}
  on:cancel={() => (showLoadConfirm = false)}
/>

<style>
  .sync {
    background: var(--surface);
    border-radius: var(--radius-card);
    padding: 18px;
    margin-bottom: 20px;
  }

  .sync-title {
    font-family: var(--font-ui);
    font-size: 16px;
    font-weight: 800;
    color: var(--ink);
    margin: 0 0 6px;
  }

  .sync-desc {
    font-size: 13px;
    color: var(--ink2);
    line-height: 1.7;
    margin: 0;
  }

  .sync-state {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink2);
    font-family: var(--font-ui);
    margin: 14px 0 10px;
  }

  .sync-state.pending {
    color: var(--accent-dark);
  }

  .sync-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .btn-save {
    padding: 8px 20px;
    border: none;
    border-radius: var(--radius-btn);
    background: var(--accent);
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    font-family: var(--font-ui);
    cursor: pointer;
    transition: background 0.12s;
  }

  .btn-save:not(:disabled):hover {
    background: var(--accent-dark);
  }

  .btn-load {
    padding: 8px 18px;
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

  .btn-load:not(:disabled):hover {
    border-color: var(--ink2);
    background: var(--bg);
  }

  .btn-save:disabled,
  .btn-load:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .sync-message {
    font-size: 13px;
    color: var(--repost);
    margin: 10px 0 0;
  }

  .sync-error {
    font-size: 13px;
    color: #dc2626;
    margin: 10px 0 0;
  }
</style>
