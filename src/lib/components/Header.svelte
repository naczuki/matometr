<script lang="ts">
  import { currentUser } from '$lib/stores/currentUser';

  function handleLoginClick(): void {
    document.dispatchEvent(
      new CustomEvent('nlLaunch', {
        detail: 'welcome-login'
      })
    );
  }

  function handleLogout(): void {
    document.dispatchEvent(new CustomEvent('nlLogout'));
    currentUser.set(null);
  }
</script>

<header>
  <div class="inner">
    <a href="/" class="logo">まとめたー</a>
    <nav>
      <a href="/guide">使い方</a>
      {#if $currentUser}
        <a href="/new" class="btn-primary">作成</a>
        <a href="/user/{$currentUser.npub}" class="avatar-link">
          {#if $currentUser.picture}
            <img src={$currentUser.picture} alt={$currentUser.name ?? '自分'} class="avatar" />
          {:else}
            <span class="avatar-placeholder">{($currentUser.name ?? '?')[0]}</span>
          {/if}
        </a>
        <button on:click={handleLogout} class="btn-ghost">ログアウト</button>
      {:else}
        <button on:click={handleLoginClick} class="btn-primary">ログイン</button>
      {/if}
    </nav>
  </div>
</header>

<style>
  header {
    background: var(--surface);
    border-bottom: 1.5px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .inner {
    max-width: 720px;
    margin: 0 auto;
    padding: 0.75rem 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .logo {
    font-family: var(--font-ui);
    font-weight: 800;
    font-size: 1.25rem;
    color: var(--accent);
    text-decoration: none;
  }

  nav {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  nav a {
    color: var(--text-muted);
    text-decoration: none;
    font-family: var(--font-ui);
    font-weight: 500;
    font-size: 0.875rem;
  }

  nav a:hover {
    color: var(--text);
  }

  .btn-primary {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-btn);
    padding: 0.4rem 1rem;
    font-family: var(--font-ui);
    font-weight: 700;
    font-size: 0.875rem;
    cursor: pointer;
    text-decoration: none;
    display: inline-block;
    transition: background 0.15s;
  }

  .btn-primary:hover {
    background: var(--accent-dark);
    color: #fff;
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-muted);
    border: 1.5px solid var(--border);
    border-radius: var(--radius-btn);
    padding: 0.4rem 1rem;
    font-family: var(--font-ui);
    font-weight: 500;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-ghost:hover {
    background: var(--border);
    color: var(--text);
  }

  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
  }

  .avatar-placeholder {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.875rem;
  }

  .avatar-link {
    display: flex;
    align-items: center;
  }
</style>
