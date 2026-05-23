<script lang="ts">
  import { onMount } from 'svelte';
  import { initAuth } from '$lib/stores/auth';
  import '../app.css';
  import Header from '$lib/components/Header.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import ScrollToTop from '$lib/components/ScrollToTop.svelte';

  onMount(() => {
    initAuth();
  });
</script>

<div class="app-wrapper">
  <Header />
  <main>
    <slot />
  </main>
  <Footer />
  <ScrollToTop />
</div>

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
