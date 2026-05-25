<script lang="ts">
  import { base } from '$app/paths';
  import { currentUser, logout } from '$lib/stores/auth';
  import type { StartScreens } from '@konemono/nostr-login/dist/types';
  import LoginModal from '$lib/components/LoginModal.svelte';

  let showLoginModal = false;
  let dropdownOpen = false;
  let launching = false;

  function handleLoginClick(): void {
    showLoginModal = true;
  }

  function hideLoginModal(): void {
    showLoginModal = false;
  }

  async function launchNostrLogin(screen: StartScreens): Promise<void> {
    launching = true;
    hideLoginModal();
    try {
      const { launch } = await import('@konemono/nostr-login');
      await launch(screen);
    } finally {
      launching = false;
    }
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
      <div class="logo-stack">
        <div class="logo-text">まとめたー</div>
        <span class="logo-sub">matometr</span>
      </div>
    </a>

    <div class="header-right">
      {#if $currentUser}
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
              <a class="dropdown-item" href="{base}/new" on:click={closeDropdown}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                ＋ まとめを作る
              </a>
              <div class="dropdown-divider" />
              <a class="dropdown-item" href="{base}/user/?id={$currentUser.npub}" on:click={closeDropdown}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                マイまとめ
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
  <LoginModal
    {launching}
    on:close={hideLoginModal}
    on:launch={(e) => launchNostrLogin(e.detail.screen)}
  />
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

  .logo-stack {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
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
    font-family: 'Josefin Sans', sans-serif;
    font-weight: 600;
    font-size: 11px;
    color: var(--ink3);
    letter-spacing: 0.12em;
    align-self: flex-end;
    line-height: 1.2;
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

  @media (max-width: 640px) {
    .user-name {
      display: none;
    }
  }
</style>
