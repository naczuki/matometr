<script lang="ts">
  import { base } from '$app/paths';
  import { currentUser, logout } from '$lib/stores/auth';

  let showLoginModal = false;
  let dropdownOpen = false;

  function handleLoginClick(): void {
    showLoginModal = true;
  }

  function hideLoginModal(): void {
    showLoginModal = false;
  }

  function launchNostrLogin(screen: string): void {
    hideLoginModal();
    document.dispatchEvent(new CustomEvent('nlLaunch', { detail: screen }));
  }

  function toggleDropdown(): void {
    dropdownOpen = !dropdownOpen;
  }

  function closeDropdown(): void {
    dropdownOpen = false;
  }

  function handleLogout(): void {
    logout();
    closeDropdown();
  }

  function handleOverlayClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) hideLoginModal();
  }

  function handleWindowClick(e: MouseEvent): void {
    if (!(e.target as Element).closest('.dropdown-wrap')) {
      dropdownOpen = false;
    }
  }
</script>

<svelte:window on:click={handleWindowClick} />


<header>
  <div class="inner">
    <a href="{base}/" class="logo">
      <div class="logo-icon">📋</div>
      <div>
        <div class="logo-text">まとめたー</div>
        <div class="logo-sub">matometr · Nostr キュレーション</div>
      </div>
    </a>

    <div class="header-right">
      {#if $currentUser}
        <a href="{base}/new" class="btn-new-matome">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          まとめを作る
        </a>
        <div class="dropdown-wrap">
          <button class="user-avatar-btn" on:click={toggleDropdown}>
            <div class="user-avatar">
              {#if $currentUser.picture}
                <img src={$currentUser.picture} alt={$currentUser.name ?? ''} />
              {:else}
                {($currentUser.name ?? $currentUser.pubkey)[0].toUpperCase()}
              {/if}
            </div>
            <span class="user-name">
              {$currentUser.displayName ?? $currentUser.name ?? $currentUser.npub.slice(0, 10) + '…'}
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="chevron">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {#if dropdownOpen}
            <div class="dropdown">
              <a class="dropdown-item" href="{base}/user/{$currentUser.npub}" on:click={closeDropdown}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                マイまとめ
              </a>
              <a class="dropdown-item" href="{base}/settings" on:click={closeDropdown}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                設定
              </a>
              <div class="dropdown-divider" />
              <button class="dropdown-item danger" on:click={handleLogout}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                ログアウト
              </button>
            </div>
          {/if}
        </div>
      {:else}
        <button class="btn-login" on:click={handleLoginClick}>ログイン</button>
      {/if}
    </div>
  </div>
</header>

{#if showLoginModal}
  <div
    class="modal-overlay"
    role="presentation"
    on:click={handleOverlayClick}
    on:keydown={(e) => e.key === 'Escape' && hideLoginModal()}
  >
    <div class="modal" role="dialog" aria-modal="true" aria-label="ログイン">
      <button class="modal-close" on:click={hideLoginModal} aria-label="閉じる">×</button>
      <div class="modal-icon">📋</div>
      <h2 class="modal-title">まとめたーへようこそ</h2>
      <p class="modal-lead">
        まとめを作ったり、いいねしたりするには<br />
        <b>Nostrアカウント</b>でログインしてください
      </p>
      <div class="modal-note">
        <b>Nostrってなに？</b><br />
        メールや電話番号を使わない、新しい仕組みのSNSの基盤です。アカウントひとつで色々なアプリで使えます。
      </div>
      <button class="choice-card primary" on:click={() => launchNostrLogin('welcome-login')}>
        <div class="choice-icon">✓</div>
        <div class="choice-body">
          <div class="choice-title">すでにアカウントを持っている</div>
          <div class="choice-desc">他のNostrアプリ（Damus・Amethystなど）を使ったことがある方</div>
        </div>
        <span class="choice-arrow">›</span>
      </button>
      <button class="choice-card" on:click={() => launchNostrLogin('welcome-signup')}>
        <div class="choice-icon">＋</div>
        <div class="choice-body">
          <div class="choice-title">はじめて使う（新規登録）</div>
          <div class="choice-desc">Nostrのアカウントをこれから作ります。1分くらいで完了します</div>
        </div>
        <span class="choice-arrow">›</span>
      </button>
      <div class="modal-foot">
        <p class="modal-help">
          操作に困ったら <a href="{base}/guide">使い方ガイド</a> をご覧ください
        </p>
      </div>
    </div>
  </div>
{/if}

<style>
  header {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: 0 1px 8px rgba(249, 115, 22, 0.06);
  }

  .inner {
    max-width: 960px;
    margin: 0 auto;
    padding: 0 20px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
  }

  .logo-icon {
    width: 38px;
    height: 38px;
    background: var(--accent);
    border-radius: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(249, 115, 22, 0.35);
  }

  .logo-text {
    font-family: var(--font-ui);
    font-weight: 800;
    font-size: 22px;
    color: var(--accent);
    letter-spacing: -0.02em;
    line-height: 1;
  }

  .logo-sub {
    font-size: 11px;
    color: var(--ink3);
    line-height: 1;
    margin-top: 3px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .btn-login {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-btn);
    padding: 8px 20px;
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.12s;
  }

  .btn-login:hover {
    background: var(--accent-dark);
  }

  .btn-new-matome {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-btn);
    padding: 8px 16px;
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.12s;
    display: flex;
    align-items: center;
    gap: 5px;
    text-decoration: none;
  }

  .btn-new-matome:hover {
    background: var(--accent-dark);
  }

  .user-avatar-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface);
    border: 1.5px solid var(--border2);
    border-radius: var(--radius-btn);
    padding: 4px 12px 4px 4px;
    cursor: pointer;
    transition: all 0.12s;
    font-family: var(--font-ui);
  }

  .user-avatar-btn:hover {
    border-color: var(--accent-mid);
    background: var(--accent-pale);
  }

  .user-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--accent-mid);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    color: var(--accent-dark);
    flex-shrink: 0;
    overflow: hidden;
  }

  .user-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }

  .user-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--ink);
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chevron {
    color: var(--ink3);
  }

  /* Dropdown */
  .dropdown-wrap {
    position: relative;
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: 14px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    padding: 6px;
    min-width: 180px;
    z-index: 200;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 500;
    color: var(--ink2);
    cursor: pointer;
    transition: background 0.1s;
    font-family: var(--font-ui);
    text-decoration: none;
    border: none;
    background: transparent;
    width: 100%;
    text-align: left;
  }

  .dropdown-item:hover {
    background: var(--bg);
  }

  .dropdown-item.danger {
    color: #dc2626;
  }

  .dropdown-item.danger:hover {
    background: #fff5f5;
  }

  .dropdown-divider {
    height: 1px;
    background: var(--border);
    margin: 4px 0;
  }

  /* Login modal */
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

  .modal-foot {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
    text-align: center;
  }

  .modal-help {
    font-size: 12px;
    color: var(--ink3);
    margin: 0;
  }

  .modal-help a {
    color: var(--accent);
    font-weight: 700;
    text-decoration: none;
  }

  @media (max-width: 640px) {
    .user-name {
      display: none;
    }
  }
</style>
