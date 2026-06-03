<script lang="ts">
  import { page } from '$app/stores';
  import UserPage from '$lib/components/UserPage.svelte';

  // 正規ルート。Cloudflare Workers が /user/<npub> を200で返し（OGP動的注入つき）、
  // SPA が起動してこのルートにマッチし描画する。
  $: npub = $page.params.npub ?? '';
</script>

<UserPage {npub} />
