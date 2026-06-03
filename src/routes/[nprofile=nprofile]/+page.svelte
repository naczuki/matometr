<script lang="ts">
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { nip19 } from 'nostr-tools';
  import type { ProfilePointer } from 'nostr-tools/nip19';
  import { onMount } from 'svelte';

  onMount(() => {
    try {
      const nprofileParam = $page.params.nprofile;
      if (!nprofileParam) return;

      const decoded = nip19.decode(nprofileParam) as { type: string; data: unknown };
      if (decoded.type !== 'nprofile') return;
      const pointer = decoded.data as ProfilePointer;
      const npub = nip19.npubEncode(pointer.pubkey);
      goto(`${base}/${npub}`, { replaceState: true });
    } catch {
      // デコード失敗時はそのまま残る（UserPageが空表示）
    }
  });
</script>
