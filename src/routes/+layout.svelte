<script lang="ts">
  import { onMount } from 'svelte';
  import { initAuth, currentUser } from '$lib/stores/auth';
  import { syncOnOpen, clearSettingsSyncStatus } from '$lib/services/settingsSync';
  import SettingsSyncDialog from '$lib/components/SettingsSyncDialog.svelte';
  import '../app.css';
  import Header from '$lib/components/Header.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import ScrollToTop from '$lib/components/ScrollToTop.svelte';

  onMount(() => {
    initAuth();
  });

  // まとめたーを開いたとき・ログインしたとき（アカウントが変わったとき）に、
  // 他の端末で保存した設定を確認する（同期オンなら新しい方を読み込み、同期オフの初期状態の端末なら
  // 同期するかをダイアログで聞く）
  let syncedPubkey: string | null = null;
  $: {
    const pubkey = $currentUser?.pubkey ?? null;
    if (pubkey !== syncedPubkey) {
      syncedPubkey = pubkey;
      clearSettingsSyncStatus();
      if (pubkey) void syncOnOpen(pubkey);
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
<SettingsSyncDialog />

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
