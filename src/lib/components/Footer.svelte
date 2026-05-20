<footer>
  <div class="inner">
    <span>© 2025 まとめたー</span>
    <nav>
      <a href="/guide">使い方</a>
      <a href="/settings">設定</a>
    </nav>
  </div>
</footer>

<style>
  footer {
    border-top: 1.5px solid var(--border);
    padding: 1rem;
    margin-top: 2rem;
  }

  .inner {
    max-width: 720px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.8rem;
    color: var(--text-faint);
    font-family: var(--font-ui);
  }

  nav {
    display: flex;
    gap: 1rem;
  }

  nav a {
    color: var(--text-faint);
    text-decoration: none;
  }

  nav a:hover {
    color: var(--text-muted);
  }
</style>
