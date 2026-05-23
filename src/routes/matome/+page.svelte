<script lang="ts">
  import { page } from '$app/stores';
  import MatomePage from '$lib/components/MatomePage.svelte';

  // /matome/?id=<naddr> 形式（新URL）。prerender された matome/index.html が
  // 200で返るのでクローラに OGP が確実に届く。
  $: naddr = $page.url.searchParams.get('id') ?? '';
</script>

<MatomePage {naddr} />
