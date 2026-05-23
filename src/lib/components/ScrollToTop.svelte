<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  let visible = false;

  function onScroll(): void {
    visible = window.scrollY > 300;
  }

  function scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onMount(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  });
</script>

<button
  class="scroll-top"
  class:visible
  on:click={scrollToTop}
  aria-label="ページトップへ戻る"
  tabindex={visible ? 0 : -1}
>
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</button>

<style>
  .scroll-top {
    position: fixed;
    bottom: 24px;
    right: 20px;
    z-index: 200;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: none;
    background: var(--accent);
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 3px 12px rgba(245, 130, 31, 0.45);
    opacity: 0;
    pointer-events: none;
    transition:
      opacity 0.2s,
      transform 0.15s;
  }

  .scroll-top.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .scroll-top:hover {
    transform: scale(1.1);
  }

  .scroll-top svg {
    width: 20px;
    height: 20px;
  }
</style>
