<svg class="spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <circle cx="12" cy="12" r="9" stroke="var(--border)" stroke-width="2.5" />
  <circle
    cx="12" cy="12" r="9"
    stroke="var(--accent)"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-dasharray="14 42"
  />
</svg>

<style>
  .spinner {
    width: 32px;
    height: 32px;
    animation: spin 0.75s linear infinite;
    display: block;
    margin: 0 auto 12px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
