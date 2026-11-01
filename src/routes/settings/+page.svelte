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
  import {
    checkRemoteOnSettings,
    clearSettingsMessages,
    disableSync,
    enableSync,
    loadPendingRemote,
    saveSettings,
    settingsSyncStatus
  } from '$lib/services/settingsSync';
  import {
    hasUnsavedChanges,
    sameSettingsData,
    type ClientSettingsData
  } from '$lib/utils/clientLinks';
  import { formatAbsoluteTime } from '$lib/utils/time';

  // 設定の変更は下書き（draft）に入れ、画面下の「保存」を押したときに反映する。
  // 他の端末との同期は、一番上のトグルで切り替える（切り替えた時点で効く）。

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
  $: syncOn = pubkey ? ($settingsSyncPrefs[pubkey]?.enabled ?? false) : false;
  $: record = pubkey ? $settingsSyncRecords[pubkey] : undefined;
  $: status = $settingsSyncStatus;

  $: dirty = !sameSettingsData(draft, $localSettings.data);
  // 同期オンで、前に送れなかった変更が残っていれば、保存で送り直せるようにする
  $: unsent = syncOn && hasUnsavedChanges($localSettings, record);
  $: canSave = !status.saveBusy && (dirty || unsent);

  // 設定画面を開いたとき・タブに戻ってきたときに、他の端末で保存されていないか確認する
  let checkedPubkey: string | null = null;
  $: if (pubkey && syncOn && pubkey !== checkedPubkey) {
    checkedPubkey = pubkey;
    void checkRemoteOnSettings(pubkey, dirty);
  }

  function handleVisibility(): void {
    if (document.visibilityState === 'visible' && pubkey && syncOn) {
      void checkRemoteOnSettings(pubkey, dirty);
    }
  }

  onMount(() => clearSettingsMessages());

  function handleToggle(e: Event & { currentTarget: HTMLInputElement }): void {
    if (!pubkey) return;
    const on = e.currentTarget.checked;
    // 表示は保存されている状態に戻し、処理が終わったら（同期オンになったら）切り替わるようにする
    e.currentTarget.checked = syncOn;
    if (on) void enableSync(pubkey);
    else disableSync(pubkey);
  }

  async function handleLoadPending(): Promise<void> {
    if (!pubkey) return;
    await loadPendingRemote(pubkey);
    // 読み込んだ設定で下書きも置き換える
    draft = get(localSettings).data;
  }

  function handleSave(): void {
    if (!canSave) return;
    void saveSettings(pubkey, draft);
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
<svelte:document on:visibilitychange={handleVisibility} />

<svelte:head>
  <title>設定 | まとめたー</title>
</svelte:head>

<div class="page">
  <h1 class="page-title">設定</h1>

  <section class="sync">
    <label class="switch-row" class:disabled={!pubkey || status.syncBusy}>
      <span class="switch-text">
        設定を他の端末と同期する{pubkey ? '' : '（ログインすると使えます）'}
      </span>
      <input
        class="switch"
        type="checkbox"
        role="switch"
        checked={syncOn}
        disabled={!pubkey || status.syncBusy}
        on:change={handleToggle}
      />
    </label>
    <p class="sync-note">追加の確認ダイアログが出ることがあります</p>

    {#if syncOn && status.pendingRemoteAt > 0}
      <div class="pending">
        <span class="pending-text">
          他の端末で保存した設定があります（{formatAbsoluteTime(status.pendingRemoteAt)} に保存）
        </span>
        <button class="btn-load" disabled={status.syncBusy} on:click={handleLoadPending}>
          読み込む
        </button>
      </div>
    {/if}

    {#if status.syncError}
      <p class="sync-error" role="alert">{status.syncError}</p>
    {/if}
  </section>

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
    >（16 進のイベント ID）が、その投稿の ID に置き換わります。<code>nostr:</code> で始まる
    URL（例：<code>{'nostr:{nevent}'}</code>）は、端末の Nostr アプリで開きます。
  </ClientLinkEditor>

  <div class="save-bar">
    {#if status.saveError}
      <p class="save-error" role="alert">{status.saveError}</p>
    {:else if status.saveMessage && !dirty}
      <p class="save-message" aria-live="polite">{status.saveMessage}</p>
    {/if}
    <button class="btn-save" disabled={!canSave} on:click={handleSave}>
      {status.saveBusy ? '保存中…' : '保存'}
    </button>
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

  /* 一番上の同期ブロック */
  .sync {
    background: var(--surface);
    border-radius: var(--radius-card);
    padding: 16px 18px;
    margin-bottom: 20px;
  }

  .switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    cursor: pointer;
  }

  .switch-row.disabled {
    cursor: not-allowed;
  }

  .switch-text {
    font-family: var(--font-ui);
    font-size: 15px;
    font-weight: 700;
    color: var(--ink);
  }

  .switch-row.disabled .switch-text {
    color: var(--ink3);
  }

  /* トグルスイッチ（チェックボックスを描き直す） */
  .switch {
    appearance: none;
    flex-shrink: 0;
    position: relative;
    width: 44px;
    height: 24px;
    margin: 0;
    border-radius: 12px;
    background: var(--border2);
    cursor: inherit;
    transition: background 0.15s;
  }

  .switch::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    transition: transform 0.15s;
  }

  .switch:checked {
    background: var(--accent);
  }

  .switch:checked::after {
    transform: translateX(20px);
  }

  .switch:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .switch:disabled {
    opacity: 0.5;
  }

  .sync-note {
    font-size: 12px;
    color: var(--ink3);
    margin: 4px 0 0;
  }

  .pending {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px 12px;
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--border);
  }

  .pending-text {
    font-size: 13px;
    font-weight: 600;
    color: var(--accent-dark);
    font-family: var(--font-ui);
  }

  .btn-load {
    flex-shrink: 0;
    padding: 7px 18px;
    border: 1.5px solid var(--accent);
    border-radius: var(--radius-btn);
    background: var(--accent-pale);
    color: var(--accent);
    font-size: 13px;
    font-weight: 700;
    font-family: var(--font-ui);
    cursor: pointer;
    transition: background 0.12s;
  }

  .btn-load:not(:disabled):hover {
    background: var(--accent-mid);
  }

  .btn-load:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .sync-error {
    font-size: 12px;
    color: #dc2626;
    margin: 10px 0 0;
  }

  /* 保存ボタン（ページの一番下） */
  .save-bar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    flex-wrap: wrap;
    background: var(--surface);
    border-radius: var(--radius-card);
    padding: 16px 18px;
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
    flex: 1;
    min-width: 0;
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
