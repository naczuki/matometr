<script lang="ts">
  import '../app.css';
  import Header from '$lib/components/Header.svelte';
  import Footer from '$lib/components/Footer.svelte';
</script>

<div class="app-wrapper">
  <Header />
  <main>
    <slot />
  </main>
  <Footer />
</div>

<style>
  .app-wrapper {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  main {
    flex: 1;
    max-width: 720px;
    width: 100%;
    margin: 0 auto;
    padding: 1rem;
  }
</style>
