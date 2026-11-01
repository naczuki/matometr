<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import { base } from '$app/paths';
  import { shareClients } from '$lib/stores/clientSettings';
  import { clientIconUrl, fillShareUrl, type ClientLink } from '$lib/utils/clientLinks';

  // Nos ボタンのシェア先選択。一覧は設定画面（/settings）で編集できる。
  export let open: boolean;
  export let text: string;

  const dispatch = createEventDispatcher<{ close: void }>();

  let boxEl: HTMLDivElement | null = null;
  let failedIcons: Set<string> = new Set();

  $: if (open) {
    tick().then(() => boxEl?.querySelector<HTMLElement>('.close-btn')?.focus());
  }

  function close(): void {
    dispatch('close');
  }

  function share(client: ClientLink): void {
    window.open(fillShareUrl(client.url, text), '_blank', 'noreferrer');
    close();
  }

  function onIconError(id: string): void {
    failedIcons = new Set([...failedIcons, id]);
  }
</script>

{#if open}
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="share-dialog-title"
    on:click|self={close}
    on:keydown={(e) => {
      if (e.key === 'Escape') close();
    }}
  >
    <div class="box" bind:this={boxEl}>
      <button class="close-btn" aria-label="閉じる" on:click={close}>
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

      <p class="title" id="share-dialog-title">シェアするクライアント</p>

      {#if $shareClients.length > 0}
        <div class="clients">
          {#each $shareClients as client (client.id)}
            {@const icon = clientIconUrl(client)}
            <button class="client-btn" on:click={() => share(client)}>
              {#if icon && !failedIcons.has(client.id)}
                <img
                  class="client-icon"
                  src={icon}
                  alt=""
                  width="22"
                  height="22"
                  on:error={() => onIconError(client.id)}
                />
              {:else}
                <span class="client-icon client-icon-fallback" aria-hidden="true"
                  >{client.name.trim().charAt(0).toUpperCase()}</span
                >
              {/if}
              <span class="client-name">{client.name}</span>
            </button>
          {/each}
        </div>
      {:else}
        <p class="empty">
          表示するシェア先がありません。設定で追加するか、表示をオンにしてください。
        </p>
      {/if}

      <div class="footer">
        <a href="{base}/settings" on:click={close}>シェア先を編集</a>
      </div>
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
    z-index: 200;
    padding: 16px;
  }

  .box {
    position: relative;
    background: var(--surface);
    border-radius: 18px;
    padding: 28px 20px 14px;
    max-width: 440px;
    width: 100%;
    box-shadow: var(--shadow-dialog-sm);
  }

  .close-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--bg);
    color: var(--ink2);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.12s;
  }

  .close-btn:hover {
    background: var(--accent-mid);
  }

  .title {
    font-family: var(--font-ui);
    font-size: 17px;
    font-weight: 800;
    color: var(--ink);
    text-align: center;
    margin: 0 0 18px;
  }

  .clients {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
  }

  .client-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
    padding: 9px 16px 9px 12px;
    border: 1.5px solid var(--border2);
    border-radius: 12px;
    background: var(--surface);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition:
      border-color 0.12s,
      background 0.12s;
  }

  .client-btn:hover {
    border-color: var(--accent);
    background: var(--accent-pale);
  }

  .client-icon {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    border-radius: 5px;
    object-fit: contain;
  }

  .client-icon-fallback {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-mid);
    color: var(--accent-dark);
    font-size: 12px;
    font-weight: 800;
  }

  .client-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty {
    font-size: 13px;
    color: var(--ink2);
    text-align: center;
    margin: 0;
  }

  .footer {
    margin-top: 18px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
    text-align: center;
    font-size: 12px;
    font-family: var(--font-ui);
  }

  .footer a {
    color: var(--ink3);
    font-weight: 600;
  }

  .footer a:hover {
    color: var(--accent);
  }
</style>
