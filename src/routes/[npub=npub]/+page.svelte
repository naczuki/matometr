<script lang="ts">
  import { page } from '$app/stores';
  import UserPage from '$lib/components/UserPage.svelte';

  $: npub = $page.params.npub ?? '';
</script>

<UserPage {npub} />
