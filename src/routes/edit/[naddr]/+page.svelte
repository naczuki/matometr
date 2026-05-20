<script lang="ts">
  import { page } from '$app/stores';

  $: naddr = $page.params.naddr;
</script>

<svelte:head>
  <title>まとめを編集 | まとめたー</title>
</svelte:head>

<p class="placeholder">まとめ編集ページ（{naddr}）— 実装予定</p>

<style>
  .placeholder {
    color: var(--text-muted);
    text-align: center;
    padding: 3rem 1rem;
  }
</style>
