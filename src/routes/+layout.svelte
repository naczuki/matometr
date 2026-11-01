<script lang="ts">
  import { onMount } from 'svelte';
  import { initAuth, currentUser } from '$lib/stores/auth';
  import { autoPullSettings, clearSettingsSyncStatus } from '$lib/services/settingsSync';
  import '../app.css';
  import Header from '$lib/components/Header.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import ScrollToTop from '$lib/components/ScrollToTop.svelte';

  onMount(() => {
    initAuth();
  });

  // ログインしたら（アカウントが変わったら）、Nostr に保存した設定を確認して新しければ読み込む
  let syncedPubkey: string | null = null;
  $: {
    const pubkey = $currentUser?.pubkey ?? null;
    if (pubkey !== syncedPubkey) {
      syncedPubkey = pubkey;
      clearSettingsSyncStatus();
      if (pubkey) void autoPullSettings(pubkey);
    }
  }
</script>

<div class="app-wrapper">
  <Header />
  <main>
    <slot />
  </main>
  <Footer />
</div>
<ScrollToTop />

<style>
  .app-wrapper {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  main {
    flex: 1;
  }
</style>
