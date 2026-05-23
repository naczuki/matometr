<script lang="ts">
  import { page } from '$app/stores';
  import MatomePage from '$lib/components/MatomePage.svelte';

  // 旧URL /matome/<naddr>/ は GH Pages では 404 になるが、404.html フォールバックで
  // SPA が起動し、このルートにマッチして描画される（リダイレクトなし）。
  $: naddr = $page.params.naddr ?? '';
</script>

<MatomePage {naddr} />
