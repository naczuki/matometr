<script lang="ts">
  import { page } from '$app/stores';
  import UserPage from '$lib/components/UserPage.svelte';

  // /user/?id=<npub> 形式（新URL）。prerender された user/index.html が
  // 200で返るのでクローラに OGP が確実に届く。
  $: npub = $page.url.searchParams.get('id') ?? '';
</script>

<UserPage {npub} />
