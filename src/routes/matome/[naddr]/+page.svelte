<script lang="ts">
  import { page } from '$app/stores';
  import MatomePage from '$lib/components/MatomePage.svelte';

  // 正規ルート。Cloudflare Workers が /matome/<naddr> を200で返し（OGP動的注入つき）、
  // SPA が起動してこのルートにマッチし描画する。
  $: naddr = $page.params.naddr ?? '';
</script>

<MatomePage {naddr} />
