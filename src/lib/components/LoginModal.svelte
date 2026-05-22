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
    <div class="modal-icon">📋</div>
    <h2 class="modal-title">まとめたーへようこそ</h2>
    <p class="modal-lead">
      まとめを作ったり、いいねしたりするには<br />
      <b>Nostrアカウント</b>でログインしてください
    </p>
    <button class="choice-card primary" on:click={() => dispatch('launch', { screen: 'welcome-login' })} disabled={launching}>
      <div class="choice-icon">{launching ? '…' : '✓'}</div>
      <div class="choice-body">
        <div class="choice-title">{launching ? '読み込み中…' : 'すでにアカウントを持っている'}</div>
        <div class="choice-desc">すでにNostrアカウントをお持ちの方はこちら</div>
      </div>
      <span class="choice-arrow">›</span>
    </button>
    <div class="modal-note">
      <b>Nostrってなに？</b><br />
      メールや電話番号を使わない、新しい仕組みのSNSの基盤です。アカウントひとつで色々なアプリで使えます。
    </div>
    <div class="modal-nostr-info">
      <p>まとめたーはNostrというSNSの投稿をまとめるサービスです。<br />ご利用にはNostrのアカウントが必要です。</p>
      <p>作者がふだん使っているNostrアプリ：<br />
        ・<a href="https://nostter.app" target="_blank" rel="noopener noreferrer">nostter（ブラウザですぐ使えます）↗</a>
      </p>
      <p>アカウントを作成後、『すでにアカウントをお持ちの方』からログインできます。</p>
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

  .modal-icon {
    width: 52px;
    height: 52px;
    background: var(--accent);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 26px;
    margin: 0 auto 14px;
    box-shadow: 0 6px 16px rgba(249, 115, 22, 0.3);
  }

  .modal-title {
    font-family: var(--font-ui);
    font-size: 19px;
    font-weight: 800;
    color: var(--ink);
    text-align: center;
    margin: 0 0 8px;
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

  .modal-note {
    background: var(--bg);
    border-radius: 10px;
    padding: 11px 14px;
    margin: 0 0 16px;
    font-size: 12px;
    color: var(--ink2);
    line-height: 1.65;
    border-left: 3px solid var(--accent);
  }

  .modal-note b {
    color: var(--accent-dark);
    display: block;
    margin-bottom: 3px;
  }

  .choice-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px;
    border-radius: 14px;
    border: 2px solid var(--border);
    background: var(--surface);
    cursor: pointer;
    transition: all 0.15s;
    margin: 0 0 10px;
    text-align: left;
    width: 100%;
  }

  .choice-card:hover {
    border-color: var(--accent);
    background: var(--accent-pale);
  }

  .choice-card.primary {
    border-color: var(--accent-mid);
    background: var(--accent-pale);
  }

  .choice-card.primary:hover {
    border-color: var(--accent);
    background: var(--accent-mid);
  }

  .choice-icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: var(--accent-mid);
    color: var(--accent-dark);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
    font-family: var(--font-ui);
    font-weight: 800;
  }

  .choice-card.primary .choice-icon {
    background: var(--accent);
    color: #fff;
  }

  .choice-body {
    flex: 1;
    min-width: 0;
  }

  .choice-title {
    font-family: var(--font-ui);
    font-size: 14px;
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 2px;
  }

  .choice-desc {
    font-size: 12px;
    color: var(--ink2);
    line-height: 1.5;
    margin: 0;
  }

  .choice-arrow {
    color: var(--ink3);
    font-size: 20px;
    flex-shrink: 0;
  }

  .modal-nostr-info {
    margin-top: 4px;
    padding: 12px 14px;
    background: var(--bg);
    border-radius: 10px;
    border-left: 3px solid var(--accent);
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
