<script lang="ts">
  import { page } from '$app/stores';
  import MatomePage from '$lib/components/MatomePage.svelte';

  $: naddr = $page.params.naddr ?? '';
</script>

<MatomePage {naddr} />
