<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { beforeNavigate, goto } from '$app/navigation';
  import ClientLinkEditor from '$lib/components/ClientLinkEditor.svelte';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import { currentUser } from '$lib/stores/auth';
  import {
    localSettings,
    settingsSyncPrefs,
    settingsSyncRecords
  } from '$lib/stores/clientSettings';
  import { clearSaveMessage, saveSettings, settingsSaveStatus } from '$lib/services/settingsSync';
  import {
    hasUnsavedChanges,
    sameSettingsData,
    type ClientSettingsData
  } from '$lib/utils/clientLinks';

  // 設定の変更は下書き（draft）に入れ、画面下の「保存」を押したときに反映する。

  let draft: ClientSettingsData = get(localSettings).data;
  // 保存済みの設定が変わったら（他の端末の設定を読み込んだときなど）、
  // 下書きを編集していなければ追いかける。
  let lastSaved = draft;
  $: followSaved($localSettings.data);
  function followSaved(saved: ClientSettingsData): void {
    if (saved === lastSaved) return;
    if (sameSettingsData(draft, lastSaved)) draft = saved;
    lastSaved = saved;
  }

  $: pubkey = $currentUser?.pubkey ?? null;
  $: savedSync = pubkey ? ($settingsSyncPrefs[pubkey]?.enabled ?? false) : false;
  let syncChecked = false;
  let lastSavedSync: boolean | null = null;
  $: if (savedSync !== lastSavedSync) {
    syncChecked = savedSync;
    lastSavedSync = savedSync;
  }

  $: record = pubkey ? $settingsSyncRecords[pubkey] : undefined;
  $: draftChanged = !sameSettingsData(draft, $localSettings.data);
  $: syncChanged = syncChecked !== savedSync;
  // 同期オンで、前に同期できなかった変更が残っていれば、保存でやり直せるようにする
  $: syncPending = pubkey !== null && syncChecked && hasUnsavedChanges($localSettings, record);
  $: dirty = draftChanged || syncChanged;
  $: canSave = !$settingsSaveStatus.busy && (dirty || syncPending);

  onMount(() => clearSaveMessage());

  function handleSave(): void {
    if (!canSave) return;
    void saveSettings(pubkey, draft, syncChecked);
  }

  // 保存していない変更があるときは、ページを離れる前に確認する
  let allowNavigate = false;
  let pendingNavUrl: URL | null = null;
  let showLeaveConfirm = false;

  beforeNavigate(({ to, cancel }) => {
    if (allowNavigate || !dirty || !to) return;
    cancel();
    pendingNavUrl = to.url;
    showLeaveConfirm = true;
  });

  function handleBeforeUnload(e: BeforeUnloadEvent): string | void {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '保存していない変更があります';
      return '保存していない変更があります';
    }
  }

  function handleLeaveConfirm(): void {
    showLeaveConfirm = false;
    allowNavigate = true;
    if (pendingNavUrl) {
      const target = pendingNavUrl.pathname + pendingNavUrl.search + pendingNavUrl.hash;
      pendingNavUrl = null;
      void goto(target);
    }
  }
</script>

<svelte:window on:beforeunload={handleBeforeUnload} />

<svelte:head>
  <title>設定 | まとめたー</title>
</svelte:head>

<div class="page">
  <h1 class="page-title">設定</h1>

  <ClientLinkEditor
    kind="share"
    title="シェア先（Nos ボタン）"
    resetTitle="シェア先をデフォルトに戻しますか？"
    urlPlaceholder={'https://example.com/post?text={text}'}
    bind:data={draft}
  >
    まとめ画面の「Nos」ボタンで選べるクライアントです。URL の
    <code>{'{text}'}</code> が、シェアする文章（タイトル・まとめの URL など）に置き換わります。
  </ClientLinkEditor>

  <ClientLinkEditor
    kind="open"
    title="投稿メニューの「○○で開く」"
    resetTitle="「○○で開く」をデフォルトに戻しますか？"
    urlPlaceholder={'https://example.com/{nevent}'}
    bind:data={draft}
  >
    まとめ内の投稿の日時をタップしたときのメニューに出すクライアントです。URL の
    <code>{'{nevent}'}</code>（nevent1…）・<code>{'{note}'}</code>（note1…）・<code>{'{id}'}</code
    >（16 進のイベント ID）が、その投稿の ID に置き換わります。
  </ClientLinkEditor>

  <div class="save-bar">
    <div class="sync-option">
      <label class="sync-toggle" class:disabled={!pubkey}>
        <input type="checkbox" bind:checked={syncChecked} disabled={!pubkey} />
        他の端末と同期する{pubkey ? '' : '（ログインすると使えます）'}
      </label>
      <p class="sync-note">追加の確認ダイアログが出ることがあります</p>
    </div>
    <div class="save-action">
      {#if $settingsSaveStatus.error}
        <p class="save-error" role="alert">{$settingsSaveStatus.error}</p>
      {:else if $settingsSaveStatus.message && !dirty}
        <p class="save-message" aria-live="polite">{$settingsSaveStatus.message}</p>
      {/if}
      <button class="btn-save" disabled={!canSave} on:click={handleSave}>
        {$settingsSaveStatus.busy ? '保存中…' : '保存'}
      </button>
    </div>
  </div>
</div>

<ConfirmDialog
  open={showLeaveConfirm}
  title="保存していない変更があります。破棄して移動しますか？"
  confirmText="破棄して移動"
  cancelText="戻る"
  on:confirm={handleLeaveConfirm}
  on:cancel={() => {
    showLeaveConfirm = false;
    pendingNavUrl = null;
  }}
/>

<style>
  .page {
    max-width: 720px;
    margin: 0 auto;
    padding: 24px 16px 40px;
  }

  .page-title {
    font-family: var(--font-ui);
    font-size: 20px;
    font-weight: 800;
    color: var(--ink);
    margin: 0 0 20px;
  }

  /* 保存ボタンの帯（ページの一番下）。 */
  .save-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px 16px;
    flex-wrap: wrap;
    background: var(--surface);
    border-radius: var(--radius-card);
    padding: 16px 18px;
  }

  .sync-option {
    min-width: 0;
  }

  .sync-toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-ui);
    font-size: 14px;
    font-weight: 700;
    color: var(--ink);
    cursor: pointer;
  }

  .sync-toggle.disabled {
    color: var(--ink3);
    cursor: not-allowed;
  }

  .sync-toggle input {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
    cursor: inherit;
  }

  .sync-note {
    font-size: 12px;
    color: var(--ink3);
    margin: 2px 0 0 26px;
  }

  .save-action {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
    min-width: 0;
  }

  .save-message {
    font-size: 13px;
    color: var(--repost);
    margin: 0;
  }

  .save-error {
    font-size: 12px;
    color: #dc2626;
    margin: 0;
    max-width: 320px;
  }

  .btn-save {
    flex-shrink: 0;
    padding: 9px 28px;
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

  .btn-save:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
