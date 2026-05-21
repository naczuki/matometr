<script lang="ts">
  import { sortableAction } from '$lib/actions/sortable';
  import { fetchNotesByIds } from '$lib/services/NostrClient';
  import { parseNostrInput, eventIdFromNevent } from '$lib/utils/nostr';
  import type { EditorBlock, NoteEditorBlock } from '$lib/types';
  import QuotedNote from '$lib/components/QuotedNote.svelte';
  import AddNoteModal from '$lib/components/AddNoteModal.svelte';

  export let blocks: EditorBlock[] = [];

  let showAddModal = false;
  let sortLoading = false;
  let lastSortOrder: 'asc' | 'desc' | null = null;
  let createdAtCache = new Map<string, number>();

  $: noteCount = blocks.filter((b) => b.type === 'nevent' && b.nevent).length;

  function handleModalAdd(e: CustomEvent<{ nevents: string[] }>): void {
    const newBlocks: EditorBlock[] = e.detail.nevents.map((nevent) => ({
      id: crypto.randomUUID(),
      type: 'nevent',
      nevent
    }));
    blocks = [...blocks, ...newBlocks];
    showAddModal = false;
  }

  function addComment(): void {
    blocks = [...blocks, { id: crypto.randomUUID(), type: 'comment', text: '' }];
  }

  function addHeading(): void {
    blocks = [...blocks, { id: crypto.randomUUID(), type: 'heading', text: '' }];
  }

  function deleteBlock(id: string): void {
    blocks = blocks.filter((b) => b.id !== id);
  }

  function handleSort(oldIndex: number, newIndex: number): void {
    const updated = [...blocks];
    const [moved] = updated.splice(oldIndex, 1);
    updated.splice(newIndex, 0, moved);
    blocks = updated;
  }

  async function sortByTime(order: 'asc' | 'desc'): Promise<void> {
    if (sortLoading) return;

    const hasNonNevent = blocks.some(b => b.type === 'comment' || b.type === 'heading');
    if (hasNonNevent) {
      const ok = window.confirm('コメントや見出しの位置がリセットされます。続けますか？');
      if (!ok) return;
    }

    const sortableBlocks = blocks.filter((b): b is NoteEditorBlock => b.type === 'nevent' && !!b.nevent);
    const otherBlocks = blocks.filter(b => {
      if (b.type !== 'nevent') return true;
      return !b.nevent;
    });

    const allIds = sortableBlocks
      .map(b => eventIdFromNevent(b.nevent))
      .filter((id): id is string => id !== null);

    if (allIds.length === 0) return;

    const uncachedIds = allIds.filter(id => !createdAtCache.has(id));
    if (uncachedIds.length > 0) {
      sortLoading = true;
      await new Promise<void>((resolve) => {
        fetchNotesByIds(uncachedIds).subscribe({
          next: (n) => createdAtCache.set(n.id, n.createdAt),
          complete: resolve,
          error: resolve
        });
        setTimeout(resolve, 10_000);
      });
      sortLoading = false;
    }

    const sorted = [...sortableBlocks].sort((a, b) => {
      const idA = eventIdFromNevent(a.nevent) ?? '';
      const idB = eventIdFromNevent(b.nevent) ?? '';
      const tA = createdAtCache.get(idA) ?? 0;
      const tB = createdAtCache.get(idB) ?? 0;
      return order === 'asc' ? tA - tB : tB - tA;
    });

    blocks = order === 'asc'
      ? [...sorted, ...otherBlocks]
      : [...otherBlocks, ...sorted];

    lastSortOrder = order;
  }

  function handleNoteInput(id: string, raw: string): void {
    const parsed = parseNostrInput(raw);
    if (parsed) {
      blocks = blocks.map((b) => (b.id === id ? { ...b, nevent: parsed } : b));
    }
  }

  function clearNote(id: string): void {
    blocks = blocks.map((b) => (b.id === id ? { ...b, nevent: '' } : b));
  }

  function updateText(id: string, text: string): void {
    blocks = blocks.map((b) =>
      b.id === id && (b.type === 'comment' || b.type === 'heading') ? { ...b, text } : b
    );
  }
</script>

<section class="blocks-section">
  <div class="blocks-header">
    <span class="blocks-label">まとめの中身</span>
    {#if noteCount > 0}
      <span class="blocks-badge">{noteCount}件の投稿</span>
    {/if}
    {#if noteCount >= 1}
      <!-- svelte-ignore a11y-interactive-supports-focus -->
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <div
        class="sort-segment"
        class:disabled={sortLoading}
        role="button"
        aria-label="並び順を切り替え"
        on:click={() => !sortLoading && sortByTime(lastSortOrder === 'asc' ? 'desc' : 'asc')}
      >
        <span class="sort-seg-opt" class:active={lastSortOrder === 'desc'}>新しい順</span>
        <span class="sort-seg-opt" class:active={lastSortOrder === 'asc'}>古い順</span>
      </div>
    {/if}
  </div>

  {#if blocks.length === 0}
    <div class="empty-state">下のボタンで投稿・コメント・見出しを追加できます</div>
  {:else}
    <div
      class="block-list"
      use:sortableAction={{ onSort: handleSort }}
    >
      {#each blocks as block (block.id)}
        <div
          class="block-card"
          class:is-heading={block.type === 'heading'}
          class:is-comment={block.type === 'comment'}
        >
          <div class="drag-handle" aria-hidden="true">⋮⋮</div>

          <div class="block-body">
            {#if block.type === 'nevent'}
              {#if block.nevent}
                {@const eventId = eventIdFromNevent(block.nevent)}
                {#if eventId}
                  <QuotedNote {eventId} showDate={true} />
                {:else}
                  <p class="parse-error">この投稿は表示できません</p>
                {/if}
                <button class="change-btn" on:click={() => clearNote(block.id)}>
                  別の投稿に変更
                </button>
              {:else}
                <p class="paste-label">投稿の URL を貼り付け</p>
                <input
                  class="paste-input"
                  type="text"
                  placeholder="投稿の URL / nevent1 / note1 を貼り付け"
                  on:input={(e) => handleNoteInput(block.id, e.currentTarget.value)}
                />
              {/if}
            {:else if block.type === 'comment'}
              <span class="block-type-label">コメント</span>
              <textarea
                class="comment-textarea"
                placeholder="コメントを入力…"
                value={block.text}
                on:input={(e) => updateText(block.id, e.currentTarget.value)}
                rows={3}
              ></textarea>
            {:else if block.type === 'heading'}
              <span class="block-type-label">見出し</span>
              <input
                class="heading-input"
                type="text"
                placeholder="見出しを入力…"
                value={block.text}
                on:input={(e) => updateText(block.id, e.currentTarget.value)}
              />
            {/if}
          </div>

          <button class="delete-btn" on:click={() => deleteBlock(block.id)} aria-label="削除">×</button>
        </div>
      {/each}
    </div>
  {/if}

  <div class="add-buttons">
    <button class="add-btn" on:click={() => (showAddModal = true)}>＋ 投稿を追加</button>
    <button class="add-btn" on:click={addComment}>＋ コメントを追加</button>
    <button class="add-btn" on:click={addHeading}>＋ 見出しを追加</button>
  </div>
</section>

<AddNoteModal
  open={showAddModal}
  on:add={handleModalAdd}
  on:close={() => (showAddModal = false)}
/>

<style>
  .blocks-section {
    margin-bottom: 20px;
  }

  .blocks-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .blocks-label {
    font-family: var(--font-ui);
    font-size: 14px;
    font-weight: 700;
    color: var(--ink2);
  }

  .blocks-badge {
    font-size: 12px;
    font-weight: 700;
    background: var(--accent-mid);
    color: var(--accent-dark);
    border-radius: 999px;
    padding: 2px 10px;
  }

  .sort-segment {
    margin-left: auto;
    display: flex;
    background: var(--bg);
    border: 1.5px solid var(--border2);
    border-radius: 999px;
    padding: 2px;
    gap: 2px;
    flex-shrink: 0;
    cursor: pointer;
    user-select: none;
    transition: opacity 0.12s;
  }

  .sort-segment.disabled {
    opacity: 0.5;
    cursor: wait;
  }

  .sort-seg-opt {
    padding: 3px 10px;
    border-radius: 999px;
    background: transparent;
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    transition: background 0.12s, color 0.12s;
    pointer-events: none;
  }

  .sort-seg-opt.active {
    background: var(--accent);
    color: #fff;
  }

  .empty-state {
    border: 2px dashed var(--border2);
    border-radius: 14px;
    padding: 32px 20px;
    text-align: center;
    color: var(--ink3);
    font-size: 14px;
    margin-bottom: 12px;
  }

  .block-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
  }

  .block-card {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: 14px;
    padding: 10px 10px 10px 8px;
  }

  .block-card.is-heading {
    background: var(--accent-pale);
    border-style: dashed;
    border-color: var(--accent-mid);
  }

  .block-card.is-comment {
    border-left: 3px solid var(--accent-mid);
  }

  .drag-handle {
    flex-shrink: 0;
    padding: 4px 2px;
    color: var(--ink3);
    font-size: 14px;
    line-height: 1;
    user-select: none;
    letter-spacing: -2px;
  }

  :global(.sortable-ghost) {
    opacity: 0.4;
    background: var(--accent-pale);
    border-color: var(--accent-mid) !important;
  }

  :global(.sortable-chosen) {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .block-body {
    flex: 1;
    min-width: 0;
  }

  .block-type-label {
    display: block;
    font-size: 10px;
    font-weight: 700;
    color: var(--ink3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 5px;
  }

  .paste-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--ink3);
    margin: 0 0 6px;
  }

  .paste-input {
    width: 100%;
    border: 1.5px solid var(--border2);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
    color: var(--ink);
    background: var(--surface);
    font-family: var(--font-body);
    box-sizing: border-box;
    transition: border-color 0.12s;
  }

  .paste-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .change-btn {
    font-size: 11px;
    color: var(--ink3);
    background: none;
    border: none;
    padding: 4px 0 0;
    cursor: pointer;
    text-decoration: underline;
    display: block;
  }

  .parse-error {
    font-size: 13px;
    color: var(--ink3);
    margin: 0 0 4px;
  }

  .comment-textarea {
    width: 100%;
    border: 1.5px solid var(--border2);
    border-radius: 10px;
    padding: 8px 10px;
    font-size: 14px;
    color: var(--ink);
    background: var(--bg);
    font-family: var(--font-body);
    resize: vertical;
    box-sizing: border-box;
    transition: border-color 0.12s;
  }

  .comment-textarea:focus {
    outline: none;
    border-color: var(--accent);
  }

  .heading-input {
    width: 100%;
    border: none;
    border-bottom: 2px solid var(--accent-mid);
    padding: 4px 0;
    font-size: 17px;
    font-weight: 800;
    color: var(--ink);
    background: transparent;
    font-family: var(--font-ui);
    box-sizing: border-box;
  }

  .heading-input:focus {
    outline: none;
    border-bottom-color: var(--accent);
  }

  .delete-btn {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1px solid var(--border2);
    background: var(--bg);
    color: var(--ink3);
    font-size: 15px;
    cursor: pointer;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    line-height: 1;
    transition: all 0.1s;
  }

  .delete-btn:hover {
    border-color: #dc2626;
    color: #dc2626;
    background: #fff5f5;
  }

  .add-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .add-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 8px 16px;
    border: 2px dashed var(--accent-mid);
    border-radius: 999px;
    background: transparent;
    color: var(--accent-dark);
    font-size: 13px;
    font-weight: 700;
    font-family: var(--font-ui);
    cursor: pointer;
    transition: all 0.12s;
  }

  .add-btn:hover {
    border-color: var(--accent);
    background: var(--accent-pale);
  }
</style>
