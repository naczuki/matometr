<script lang="ts" context="module">
  export type InsertType = 'post' | 'comment' | 'heading';
</script>

<script lang="ts">
  import { onDestroy } from 'svelte';

  export let afterIndex: number;
  export let openId: string | null;
  export let setOpenId: (id: string | null) => void;
  export let onInsert: (afterIndex: number, type: InsertType) => void;

  const id = `gap-${afterIndex}`;
  $: open = openId === id;

  let hovering = false;
  let containerEl: HTMLDivElement | null = null;

  $: expanded = open || hovering;

  function handlePointerEnter(e: PointerEvent): void {
    if (e.pointerType === 'mouse') hovering = true;
  }

  function handlePointerLeave(e: PointerEvent): void {
    if (e.pointerType === 'mouse') hovering = false;
  }

  function handleToggle(): void {
    setOpenId(open ? null : id);
  }

  function choose(type: InsertType): void {
    onInsert(afterIndex, type);
    setOpenId(null);
    hovering = false;
  }

  let docListener: ((e: PointerEvent) => void) | null = null;

  function attachOutsideListener(): void {
    if (docListener) return;
    docListener = (e: PointerEvent) => {
      if (containerEl && !containerEl.contains(e.target as Node)) {
        setOpenId(null);
      }
    };
    document.addEventListener('pointerdown', docListener);
  }

  function detachOutsideListener(): void {
    if (!docListener) return;
    document.removeEventListener('pointerdown', docListener);
    docListener = null;
  }

  $: if (open) attachOutsideListener();
  $: if (!open) detachOutsideListener();

  onDestroy(() => detachOutsideListener());
</script>

<div
  class="gap"
  class:expanded
  bind:this={containerEl}
  on:pointerenter={handlePointerEnter}
  on:pointerleave={handlePointerLeave}
>
  <span class="line" aria-hidden="true"></span>

  <button
    type="button"
    class="plus"
    class:expanded
    aria-label="ここに挿入"
    aria-expanded={expanded}
    on:click={handleToggle}>+</button
  >

  <div class="chips" class:expanded>
    <button type="button" class="chip" on:click={() => choose('post')}>＋投稿</button>
    <button type="button" class="chip" on:click={() => choose('comment')}>＋コメント</button>
    <button type="button" class="chip" on:click={() => choose('heading')}>＋見出し</button>
  </div>
</div>

<style>
  .gap {
    position: relative;
    height: 28px;
    display: flex;
    align-items: center;
    margin: 2px 0;
  }

  .line {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 1px;
    background: var(--border);
    pointer-events: none;
  }

  .plus {
    position: relative;
    margin-left: 12px;
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1.5px solid var(--border2);
    background: var(--surface);
    color: var(--ink3);
    font-size: 16px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    transition:
      transform 0.18s cubic-bezier(0.22, 1, 0.36, 1),
      background-color 0.15s,
      border-color 0.15s,
      color 0.15s;
  }

  .plus.expanded {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    transform: rotate(45deg);
  }

  .plus:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .chips {
    position: relative;
    display: flex;
    gap: 6px;
    align-items: center;
    margin-left: 0;
    max-width: 0;
    opacity: 0;
    overflow: hidden;
    transition:
      max-width 0.25s cubic-bezier(0.22, 1, 0.36, 1),
      opacity 0.2s,
      margin-left 0.2s;
  }

  .chips.expanded {
    margin-left: 8px;
    max-width: 420px;
    opacity: 1;
  }

  .chip {
    white-space: nowrap;
    flex-shrink: 0;
    border: 1.5px solid var(--accent-mid);
    border-radius: 999px;
    background: var(--surface);
    padding: 4px 12px;
    color: var(--accent-dark);
    font-size: 12px;
    font-weight: 700;
    font-family: var(--font-ui);
    cursor: pointer;
    transition:
      background-color 0.12s,
      border-color 0.12s;
  }

  .chip:hover {
    background: var(--accent-pale);
    border-color: var(--accent);
  }

  .chip:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  @media (hover: none), (pointer: coarse) {
    .gap:hover .plus:not(.expanded) {
      background: var(--surface);
      border-color: var(--border2);
      color: var(--ink3);
    }
  }
</style>
