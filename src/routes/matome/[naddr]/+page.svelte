<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';

  // 旧URL /matome/<naddr> を新URL /matome/?id=<naddr> へ転送（履歴は置換）
  onMount(() => {
    goto(`${base}/matome/?id=${$page.params.naddr}`, { replaceState: true });
  });
</script>

<p style="padding:48px 16px;text-align:center;color:#737373;font-size:14px;">移動しています…</p>
