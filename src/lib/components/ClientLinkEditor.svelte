<script lang="ts">
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import {
    clientLinks,
    addClient,
    updateClient,
    removeClient,
    resetClients
  } from '$lib/stores/clientSettings';
  import {
    NAME_MAX_LENGTH,
    validateName,
    validateUrl,
    type ClientLinkKind
  } from '$lib/utils/clientLinks';

  // 設定画面の 1 セクション（シェア先 / 「○○で開く」）。変更はその場で保存する。
  export let kind: ClientLinkKind;
  export let title: string;
  export let resetTitle: string;
  export let urlPlaceholder: string;

  $: list = $clientLinks[kind];

  let newName = '';
  let newUrl = '';
  let addError = '';
  let showResetConfirm = false;

  function handleAdd(): void {
    const error = validateName(newName) ?? validateUrl(kind, newUrl);
    if (error) {
      addError = error;
      return;
    }
    addClient(kind, newName, newUrl);
    newName = '';
    newUrl = '';
    addError = '';
  }

  function handleReset(): void {
    resetClients(kind);
    showResetConfirm = false;
  }

  function rowLabel(name: string): string {
    return name.trim() || '名前なし';
  }
</script>

<section class="section">
  <div class="section-head">
    <h2 class="section-title">{title}</h2>
    <button class="btn-reset" on:click={() => (showResetConfirm = true)}>デフォルトに戻す</button>
  </div>
  <div class="section-desc"><slot /></div>

  {#if list.length === 0}
    <p class="empty">登録されているクライアントはありません。</p>
  {:else}
    <ul class="rows">
      {#each list as client (client.id)}
        {@const nameError = validateName(client.name)}
        {@const urlError = validateUrl(kind, client.url)}
        <li class="row" class:disabled={!client.enabled}>
          <label class="toggle" title="メニューに表示">
            <input
              type="checkbox"
              checked={client.enabled}
              aria-label="{rowLabel(client.name)}をメニューに表示"
              on:change={(e) => updateClient(kind, client.id, { enabled: e.currentTarget.checked })}
            />
            <span class="toggle-text">表示</span>
          </label>

          <div class="row-fields">
            <input
              class="field-input name-input"
              class:invalid={nameError}
              type="text"
              autocomplete="off"
              maxlength={NAME_MAX_LENGTH}
              placeholder="クライアント名"
              aria-label="{rowLabel(client.name)}のクライアント名"
              value={client.name}
              on:input={(e) => updateClient(kind, client.id, { name: e.currentTarget.value })}
            />
            <input
              class="field-input url-input"
              class:invalid={urlError}
              type="url"
              autocomplete="off"
              spellcheck="false"
              placeholder={urlPlaceholder}
              aria-label="{rowLabel(client.name)}のURL"
              value={client.url}
              on:input={(e) => updateClient(kind, client.id, { url: e.currentTarget.value })}
            />
            {#if nameError || urlError}
              <p class="row-error">
                {nameError ?? urlError}{client.enabled ? '（直すまでメニューには出ません）' : ''}
              </p>
            {/if}
          </div>

          <button
            class="btn-delete"
            title="削除"
            aria-label="{rowLabel(client.name)}を削除"
            on:click={() => removeClient(kind, client.id)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <form class="add-form" on:submit|preventDefault={handleAdd}>
    <p class="add-title">追加する</p>
    <div class="add-fields">
      <input
        class="field-input name-input"
        type="text"
        autocomplete="off"
        maxlength={NAME_MAX_LENGTH}
        placeholder="クライアント名"
        aria-label="追加するクライアント名"
        bind:value={newName}
        on:input={() => (addError = '')}
      />
      <input
        class="field-input url-input"
        type="url"
        autocomplete="off"
        spellcheck="false"
        placeholder={urlPlaceholder}
        aria-label="追加するクライアントのURL"
        bind:value={newUrl}
        on:input={() => (addError = '')}
      />
      <button class="btn-add" type="submit">追加</button>
    </div>
    {#if addError}
      <p class="row-error">{addError}</p>
    {/if}
  </form>
</section>

<ConfirmDialog
  open={showResetConfirm}
  title={resetTitle}
  note="追加・編集・削除した内容は元に戻せません。"
  confirmText="戻す"
  cancelText="やめる"
  on:confirm={handleReset}
  on:cancel={() => (showResetConfirm = false)}
/>

<style>
  .section {
    background: var(--surface);
    border-radius: var(--radius-card);
    padding: 18px;
    margin-bottom: 20px;
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 6px;
  }

  .section-title {
    font-family: var(--font-ui);
    font-size: 16px;
    font-weight: 800;
    color: var(--ink);
    margin: 0;
  }

  .section-desc {
    font-size: 13px;
    color: var(--ink2);
    line-height: 1.7;
    margin-bottom: 14px;
  }

  .section-desc :global(code) {
    font-size: 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0 4px;
  }

  .btn-reset {
    flex-shrink: 0;
    padding: 6px 14px;
    border: 1.5px solid var(--border2);
    border-radius: var(--radius-btn);
    background: var(--surface);
    color: var(--ink2);
    font-size: 12px;
    font-weight: 600;
    font-family: var(--font-ui);
    cursor: pointer;
    transition: all 0.12s;
  }

  .btn-reset:hover {
    border-color: var(--ink2);
    background: var(--bg);
  }

  .empty {
    font-size: 13px;
    color: var(--ink3);
    margin: 0 0 14px;
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 0;
    border-top: 1px solid var(--border);
  }

  .row:first-child {
    border-top: none;
    padding-top: 0;
  }

  .row.disabled .row-fields {
    opacity: 0.55;
  }

  .toggle {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding-top: 6px;
    flex-shrink: 0;
    cursor: pointer;
  }

  .toggle input {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
    cursor: pointer;
  }

  .toggle-text {
    font-size: 10px;
    font-weight: 700;
    color: var(--ink3);
    font-family: var(--font-ui);
  }

  .row-fields {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 9rem) minmax(0, 1fr);
    gap: 8px;
  }

  .field-input {
    width: 100%;
    min-width: 0;
    border: 1.5px solid var(--border-warm);
    border-radius: var(--radius-card);
    padding: 8px 10px;
    font-size: 14px;
    color: var(--ink);
    background: var(--surface);
    font-family: var(--font-body);
    box-sizing: border-box;
  }

  .url-input {
    font-size: 13px;
  }

  .field-input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 0;
  }

  .field-input.invalid {
    border-color: #f87171;
  }

  .row-error {
    grid-column: 1 / -1;
    font-size: 12px;
    color: #dc2626;
    margin: 0;
  }

  .btn-delete {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--ink3);
    cursor: pointer;
    transition: all 0.12s;
  }

  .btn-delete:hover {
    color: #dc2626;
    background: var(--bg);
  }

  .add-form {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px dashed var(--border2);
  }

  .add-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--ink3);
    letter-spacing: 0.06em;
    margin: 0 0 6px;
    font-family: var(--font-ui);
  }

  .add-fields {
    display: grid;
    grid-template-columns: minmax(0, 9rem) minmax(0, 1fr) auto;
    gap: 8px;
  }

  .add-form .row-error {
    margin-top: 6px;
  }

  .btn-add {
    padding: 8px 18px;
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

  .btn-add:hover {
    background: var(--accent-dark);
  }

  @media (max-width: 560px) {
    .row-fields {
      grid-template-columns: minmax(0, 1fr);
    }

    .add-fields {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .add-fields .name-input {
      grid-column: 1 / -1;
    }
  }
</style>
