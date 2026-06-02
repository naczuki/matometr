<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { StartScreens } from '@konemono/nostr-login/dist/types';
  import { nostrExtension } from '$lib/stores/auth';

  export let launching: boolean = false;

  let busy = false;

  const dispatch = createEventDispatcher<{
    close: undefined;
    launch: { screen: StartScreens };
  }>();

  function handleOverlayClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) dispatch('close');
  }

  async function handleExtension(): Promise<void> {
    if (!$nostrExtension) return;
    busy = true;
    try {
      const pubkey: string = await $nostrExtension.getPublicKey();
      if (!pubkey) return;
      const { setAuth } = await import('@konemono/nostr-login');
      await setAuth({ type: 'login', method: 'extension', pubkey });
      dispatch('close');
    } catch {
      // silent — button will remain enabled for retry
    } finally {
      busy = false;
    }
  }

</script>

<div
  class="overlay"
  role="presentation"
  on:click={handleOverlayClick}
  on:keydown={(e) => e.key === 'Escape' && dispatch('close')}
>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="ログイン">

    <!-- ブラウザ拡張機能 -->
    <div class="section">
      <button
        class="method-btn"
        on:click={handleExtension}
        disabled={!$nostrExtension || launching || busy}
      >
        <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5A2.5 2.5 0 0 0 10.5 1a2.5 2.5 0 0 0-2.5 2.5V5H4a2 2 0 0 0-2 2v3.8h1.5A2.7 2.7 0 0 1 6.2 13.5 2.7 2.7 0 0 1 3.5 16.2H2V20a2 2 0 0 0 2 2h3.8v-1.5A2.7 2.7 0 0 1 10.5 18a2.7 2.7 0 0 1 2.7 2.5V22H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 2.5-2.5 2.5 2.5 0 0 0-2.5-2.5z"/>
        </svg>
        ブラウザ拡張機能
      </button>
    </div>

    <div class="sep"><span>or</span></div>

    <!-- リモートサイナー（モバイル / NIP-46 同端末起動） -->
    <div class="section">
      <button
        class="method-btn"
        on:click={() => dispatch('launch', { screen: 'connect' })}
        disabled={launching || busy}
      >
        <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
        </svg>
        リモートサイナー
      </button>
    </div>

    <div class="sep"><span>or</span></div>

    <!-- QR / bunker:// -->
    <div class="section">
      <button
        class="method-btn secondary"
        on:click={() => dispatch('launch', { screen: 'connection-string' })}
        disabled={launching || busy}
      >
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/><rect x="18" y="18" width="3" height="3"/>
          <rect x="14" y="14" width="3" height="3"/>
        </svg>
        QRコードで接続
      </button>
      <button
        class="method-btn secondary"
        on:click={() => dispatch('launch', { screen: 'login-bunker-url' })}
        disabled={launching || busy}
      >
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        bunker://で接続
      </button>
    </div>

    <div class="sep"><span>or</span></div>

    <!-- 秘密鍵 -->
    <div class="section">
      <button
        class="method-btn secondary"
        on:click={() => dispatch('launch', { screen: 'login-nsec' })}
        disabled={launching || busy}
      >
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="7.5" cy="15.5" r="5.5"/>
          <path d="M21 2l-9.6 9.6"/><path d="M15.5 7.5l3 3"/><path d="M18 5l2 2"/>
        </svg>
        秘密鍵
      </button>
    </div>

    <button class="close-btn" on:click={() => dispatch('close')} aria-label="閉じる">×</button>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 10000;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  .sheet {
    background: var(--surface);
    border-radius: 18px 18px 0 0;
    width: 100%;
    max-width: 540px;
    padding: 24px 20px 16px;
    box-shadow: 0 -4px 32px rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    gap: 0;
    max-height: 92dvh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .method-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    padding: 14px 16px;
    border: none;
    border-radius: 9999px;
    background: var(--accent);
    color: #fff;
    font-size: 15px;
    font-weight: 700;
    font-family: var(--font-ui);
    cursor: pointer;
    transition: background 0.12s, opacity 0.12s, box-shadow 0.12s;
    line-height: 1;
    box-shadow: 0 4px 14px rgba(249, 115, 22, 0.35);
  }

  .method-btn:hover:not(:disabled) {
    background: var(--accent-dark);
    box-shadow: 0 6px 18px rgba(249, 115, 22, 0.45);
  }

  .method-btn:disabled {
    opacity: 0.55;
    cursor: default;
    box-shadow: none;
  }

  .method-btn.secondary {
    background: var(--accent-mid);
    color: var(--accent-dark);
    box-shadow: none;
  }

  .method-btn.secondary:hover:not(:disabled) {
    background: var(--accent-pale);
    box-shadow: none;
  }

  .btn-icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .sep {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 14px 0;
    color: var(--ink3, #9ca3af);
    font-size: 12px;
  }

  .sep::before,
  .sep::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border, #e5e7eb);
  }

  .close-btn {
    margin: 16px auto 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1.5px solid var(--border, #e5e7eb);
    background: transparent;
    font-size: 18px;
    color: var(--ink2, #4b5563);
    cursor: pointer;
    transition: background 0.1s;
    line-height: 1;
  }

  .close-btn:hover {
    background: var(--bg, #f3f4f6);
  }

  @media (min-width: 541px) {
    .overlay {
      align-items: center;
    }

    .sheet {
      border-radius: 18px;
      max-height: 88dvh;
    }
  }
</style>
