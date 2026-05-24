<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { StartScreens } from '@konemono/nostr-login/dist/types';

  export let launching: boolean = false;

  const dispatch = createEventDispatcher<{
    close: undefined;
    launch: { screen: StartScreens };
  }>();

  function handleOverlayClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) dispatch('close');
  }
</script>

<div
  class="modal-overlay"
  role="presentation"
  on:click={handleOverlayClick}
  on:keydown={(e) => e.key === 'Escape' && dispatch('close')}
>
  <div class="modal" role="dialog" aria-modal="true" aria-label="ログイン">
    <button class="modal-close" on:click={() => dispatch('close')} aria-label="閉じる">×</button>
    <h2 class="modal-title">まとめたーへようこそ</h2>
    <p class="modal-lead">
      まとめを作るには<br />
      <b>Nostrアカウント</b>でログインしてください
    </p>
    <button class="login-btn" on:click={() => dispatch('launch', { screen: 'welcome-login' })} disabled={launching}>
      <div class="login-btn-icon">
        {#if launching}
          <span class="login-btn-loading">…</span>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
        {/if}
      </div>
      <div class="login-btn-body">
        <div class="login-btn-title">{launching ? '読み込み中…' : 'Nostrでつづける'}</div>
        <div class="login-btn-desc">次の画面で認証</div>
      </div>
    </button>
    <div class="modal-note">
      <b>Nostrってなに？</b><br />
      メールや電話番号を使わない、新しい仕組みのSNSの基盤です。アカウントひとつで色々なアプリで使えます。
    </div>
    <div class="modal-nostr-info">
      <p>まとめたーはNostrというSNSの投稿をまとめるサービスです。<br />まとめの作成にはNostrのアカウントが必要です。（見るだけならログイン不要です）</p>
      <p>作者がふだん使っているNostrアプリ：<br />
        ・<a href="https://nostter.app" target="_blank" rel="noopener noreferrer">nostter（ブラウザですぐ使えます）↗</a>
      </p>
      <p>アカウントを作成後、上のボタンからログインできます。</p>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(28, 25, 23, 0.6);
    z-index: 9999;
    overflow-y: auto;
    padding: 24px 16px;
    -webkit-overflow-scrolling: touch;
  }

  .modal {
    background: var(--surface);
    border-radius: 20px;
    max-width: 440px;
    width: 100%;
    margin: 20px auto;
    padding: 24px 22px 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
    position: relative;
  }

  .modal-close {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--bg);
    border: none;
    font-size: 18px;
    color: var(--ink2);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .modal-close:hover {
    background: var(--accent-mid);
    color: var(--accent-dark);
  }

  .modal-title {
    font-family: var(--font-ui);
    font-size: 19px;
    font-weight: 800;
    color: var(--ink);
    text-align: center;
    margin: 28px 0 14px;
    line-height: 1.4;
  }

  .modal-lead {
    font-size: 13px;
    color: var(--ink2);
    text-align: center;
    line-height: 1.7;
    margin: 0 0 18px;
  }

  .modal-lead b {
    color: var(--accent-dark);
    font-weight: 700;
  }

  .login-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 11px;
    padding: 13px 16px;
    border-radius: 9999px;
    border: none;
    background: var(--accent);
    cursor: pointer;
    margin: 0 0 16px;
    width: 100%;
    box-shadow: 0 4px 14px rgba(249, 115, 22, 0.35);
    transition: all 0.15s;
  }

  .login-btn:hover {
    background: var(--accent-dark);
    box-shadow: 0 6px 18px rgba(249, 115, 22, 0.45);
    transform: translateY(-1px);
  }

  .login-btn:disabled {
    opacity: 0.6;
    cursor: default;
    transform: none;
    box-shadow: 0 4px 14px rgba(249, 115, 22, 0.25);
  }

  .login-btn-icon {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.22);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .login-btn-icon svg {
    width: 18px;
    height: 18px;
  }

  .login-btn-loading {
    font-family: var(--font-ui);
    font-weight: 800;
    font-size: 18px;
    line-height: 1;
  }

  .login-btn-body {
    text-align: left;
  }

  .login-btn-title {
    font-family: var(--font-ui);
    font-size: 15px;
    font-weight: 800;
    color: #fff;
    margin: 0 0 1px;
  }

  .login-btn-desc {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.85);
  }

  .modal-note {
    background: var(--bg);
    border-radius: 10px;
    padding: 11px 14px;
    margin: 0 0 10px;
    font-size: 12px;
    color: var(--ink2);
    line-height: 1.65;
  }

  .modal-note b {
    color: var(--ink);
    display: block;
    margin-bottom: 3px;
    font-weight: 700;
  }

  .modal-nostr-info {
    padding: 12px 14px;
    background: var(--bg);
    border-radius: 10px;
    font-size: 12px;
    color: var(--ink2);
    line-height: 1.7;
  }

  .modal-nostr-info p {
    margin: 0 0 8px;
  }

  .modal-nostr-info p:last-child {
    margin: 0;
  }

  .modal-nostr-info a {
    color: var(--accent);
    font-weight: 700;
    text-decoration: none;
  }

  .modal-nostr-info a:hover {
    text-decoration: underline;
  }
</style>
