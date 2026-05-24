<script lang="ts">
  import { page } from '$app/stores';
  import UserPage from '$lib/components/UserPage.svelte';

  // 旧URL /user/<npub>/ は GH Pages では 404 になるが、404.html フォールバックで
  // SPA が起動し、このルートにマッチして描画される（リダイレクトなし）。
  $: npub = $page.params.npub ?? '';
</script>

<UserPage {npub} />
