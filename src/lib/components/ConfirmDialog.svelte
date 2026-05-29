<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';

  export let open: boolean;
  export let title: string;
  export let note: string = '';
  export let confirmText: string = 'はい';
  export let cancelText: string = 'いいえ';

  const dispatch = createEventDispatcher<{ confirm: void; cancel: void }>();

  let confirmBtn: HTMLButtonElement | null = null;

  $: if (open) {
    tick().then(() => confirmBtn?.focus());
  }

  function handleConfirm(): void {
    dispatch('confirm');
  }

  function handleCancel(): void {
    dispatch('cancel');
  }
</script>

{#if open}
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    class="dialog-overlay"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    on:click|self={handleCancel}
    on:keydown={(e) => { if (e.key === 'Escape') handleCancel(); }}
  >
    <div class="dialog-box">
      <p class="dialog-title">{title}</p>
      {#if note}
        <p class="dialog-note">{note}</p>
      {/if}
      <div class="dialog-actions">
        <button class="dialog-btn-cancel" on:click={handleCancel}>{cancelText}</button>
        <button
          class="dialog-btn-confirm"
          bind:this={confirmBtn}
          on:click={handleConfirm}
        >{confirmText}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    padding: 16px;
  }

  .dialog-box {
    background: var(--surface);
    border-radius: 18px;
    padding: 28px 24px 20px;
    max-width: 360px;
    width: 100%;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  }

  .dialog-title {
    font-family: var(--font-ui);
    font-size: 17px;
    font-weight: 800;
    color: var(--ink);
    margin: 0 0 8px;
  }

  .dialog-note {
    font-size: 13px;
    color: var(--ink3);
    margin: 0 0 16px;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .dialog-btn-cancel {
    padding: 9px 18px;
    border: 1.5px solid var(--border2);
    border-radius: var(--radius-btn);
    background: var(--surface);
    color: var(--ink2);
    font-size: 14px;
    font-weight: 600;
    font-family: var(--font-ui);
    cursor: pointer;
    transition: border-color 0.12s;
  }

  .dialog-btn-cancel:hover {
    border-color: var(--ink2);
  }

  .dialog-btn-confirm {
    padding: 9px 18px;
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

  .dialog-btn-confirm:hover {
    background: var(--accent-dark);
  }
</style>
