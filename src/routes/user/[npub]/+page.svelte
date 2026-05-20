<script lang="ts">
  import { page } from '$app/stores';

  $: npub = $page.params.npub;
</script>

<svelte:head>
  <title>ユーザーページ | まとめたー</title>
</svelte:head>

<p class="placeholder">ユーザーページ（{npub}）— 実装予定</p>

<style>
  .placeholder {
    color: var(--text-muted);
    text-align: center;
    padding: 3rem 1rem;
  }
</style>
