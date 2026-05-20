<script lang="ts">
  import type { Tab } from '$lib/types';

  export let tab: Tab;
</script>

<div class="list">
  <p class="placeholder">「{tab}」タブのまとめ一覧 — 実装予定</p>
</div>

<style>
  .placeholder {
    color: var(--text-muted);
    text-align: center;
    padding: 3rem 1rem;
  }
</style>
