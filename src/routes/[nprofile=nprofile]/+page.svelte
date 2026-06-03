<script lang="ts">
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { nip19 } from 'nostr-tools';
  import { onMount } from 'svelte';

  onMount(() => {
    try {
      const decoded = nip19.decode($page.params.nprofile);
      if (decoded.type !== 'nprofile') return;
      const npub = nip19.npubEncode(decoded.data.pubkey);
      goto(`${base}/${npub}`, { replaceState: true });
    } catch {
      // デコード失敗時はそのまま残る（UserPageが空表示）
    }
  });
</script>
