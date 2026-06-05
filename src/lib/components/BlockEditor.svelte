<script lang="ts">
  import { tick } from 'svelte';
  import { sortableAction } from '$lib/actions/sortable';
  import { fetchNotesByIds } from '$lib/services/NostrClient';
  import { parseNostrInput, eventIdFromNevent, resolveReplyParentId } from '$lib/utils/nostr';
  import { renderInlineMarkdown } from '$lib/utils/markdown';
  import type { EditorBlock, NoteEditorBlock, Note } from '$lib/types';
  import QuotedNote from '$lib/components/QuotedNote.svelte';
  import AddNoteModal from '$lib/components/AddNoteModal.svelte';
  import GapInserter, { type InsertType } from '$lib/components/GapInserter.svelte';

  export let blocks: EditorBlock[] = [];

  let showAddModal = false;
  let sortLoading = false;
  let sortError = '';
  let sortMenuOpen = false;
  let notesCache = new Map<string, Note>();
  let pendingInsertIndex: number | null = null;
  let openGapId: string | null = null;
  let editingComments = new Set<string>();

  function startEditingComment(id: string): void {
    editingComments.add(id);
    editingComments = editingComments;
    focusBlockInput(id, 'comment');
  }

  function stopEditingComment(id: string): void {
    editingComments.delete(id);
    editingComments = editingComments;
  }

  $: noteCount = blocks.filter((b) => b.type === 'nevent' && b.nevent).length;

  function setOpenGapId(id: string | null): void {
    openGapId = id;
  }

  async function focusBlockInput(blockId: string, type: 'comment' | 'heading'): Promise<void> {
    await tick();
    const sel =
      type === 'comment'
        ? `textarea[data-block-id="${blockId}"]`
        : `input[data-block-id="${blockId}"]`;
    const el = document.querySelector(sel) as HTMLElement | null;
    el?.focus();
  }

  function insertInlineBlock(afterIndex: number, type: 'comment' | 'heading'): void {
    const newBlock: EditorBlock =
      type === 'comment'
        ? { id: crypto.randomUUID(), type: 'comment', text: '' }
        : { id: crypto.randomUUID(), type: 'heading', text: '' };
    const insertPos = afterIndex + 1;
    blocks = [...blocks.slice(0, insertPos), newBlock, ...blocks.slice(insertPos)];
    if (type === 'comment') {
      editingComments.add(newBlock.id);
      editingComments = editingComments;
    }
    focusBlockInput(newBlock.id, type);
  }

  function openAddModalAt(afterIndex: number): void {
    pendingInsertIndex = afterIndex;
    showAddModal = true;
  }

  function handleGapInsert(afterIndex: number, type: InsertType): void {
    if (type === 'post') openAddModalAt(afterIndex);
    else insertInlineBlock(afterIndex, type);
  }

  function handleModalAdd(e: CustomEvent<{ nevents: string[] }>): void {
    const newBlocks: EditorBlock[] = e.detail.nevents.map((nevent) => ({
      id: crypto.randomUUID(),
      type: 'nevent',
      nevent
    }));
    const base = pendingInsertIndex ?? blocks.length - 1;
    const insertPos = base + 1;
    blocks = [...blocks.slice(0, insertPos), ...newBlocks, ...blocks.slice(insertPos)];
    pendingInsertIndex = null;
    showAddModal = false;
  }

  function handleModalClose(): void {
    pendingInsertIndex = null;
    showAddModal = false;
  }

  function addPostFromBottom(): void {
    openAddModalAt(blocks.length - 1);
  }

  function addCommentFromBottom(): void {
    insertInlineBlock(blocks.length - 1, 'comment');
  }

  function addHeadingFromBottom(): void {
    insertInlineBlock(blocks.length - 1, 'heading');
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

  function createdAtOf(id: string | null): number {
    return id ? (notesCache.get(id)?.createdAt ?? 0) : 0;
  }

  async function sortByTime(mode: 'simple' | 'reply'): Promise<void> {
    sortMenuOpen = false;
    if (sortLoading) return;

    const hasNonNevent = blocks.some((b) => b.type === 'comment' || b.type === 'heading');
    if (hasNonNevent) {
      const ok = window.confirm('コメントや見出しの位置がリセットされます。続けますか？');
      if (!ok) return;
    }

    const sortableBlocks = blocks.filter(
      (b): b is NoteEditorBlock => b.type === 'nevent' && !!b.nevent
    );
    const otherBlocks = blocks.filter((b) => b.type !== 'nevent' || !b.nevent);

    const allIds = sortableBlocks
      .map((b) => eventIdFromNevent(b.nevent))
      .filter((id): id is string => id !== null);

    if (allIds.length === 0) return;

    const uncachedIds = allIds.filter((id) => !notesCache.has(id));
    if (uncachedIds.length > 0) {
      sortLoading = true;
      sortError = '';
      await new Promise<void>((resolve) => {
        fetchNotesByIds(uncachedIds).subscribe({
          next: (n) => notesCache.set(n.id, n),
          complete: resolve,
          error: () => {
            sortError = '一部の投稿の日時を取得できませんでした。';
            resolve();
          }
        });
        setTimeout(resolve, 10_000);
      });
      sortLoading = false;
    }

    const sorted = mode === 'reply' ? sortRepliesAware(sortableBlocks) : sortSimple(sortableBlocks);

    blocks = [...sorted, ...otherBlocks];
  }

  // 全ポストをフラットに時刻昇順。
  function sortSimple(items: NoteEditorBlock[]): NoteEditorBlock[] {
    return [...items].sort(
      (a, b) => createdAtOf(eventIdFromNevent(a.nevent)) - createdAtOf(eventIdFromNevent(b.nevent))
    );
  }

  // ルートを時刻昇順に並べ、各ルートの直下に（孫以降も含め）返信を時刻順でぶら下げる。
  function sortRepliesAware(items: NoteEditorBlock[]): NoteEditorBlock[] {
    const idOf = new Map<NoteEditorBlock, string | null>();
    for (const b of items) idOf.set(b, eventIdFromNevent(b.nevent));
    const inSet = new Set([...idOf.values()].filter((id): id is string => id !== null));

    // 親が inSet 内である限り上りつめ、所属ルート id を求める。
    function rootOf(id: string | null): string | null {
      let cur = id;
      const seen = new Set<string>();
      while (cur && inSet.has(cur)) {
        const note = notesCache.get(cur);
        const parent = note ? resolveReplyParentId(note) : null;
        if (!parent || !inSet.has(parent) || seen.has(parent)) break;
        seen.add(cur);
        cur = parent;
      }
      return cur;
    }

    // ルートごとにグループ化。
    const groups = new Map<string, NoteEditorBlock[]>();
    const rootless: NoteEditorBlock[] = [];
    for (const b of items) {
      const root = rootOf(idOf.get(b) ?? null);
      if (root === null) {
        rootless.push(b);
        continue;
      }
      const g = groups.get(root);
      if (g) g.push(b);
      else groups.set(root, [b]);
    }

    const byTime = (a: NoteEditorBlock, b: NoteEditorBlock): number =>
      createdAtOf(idOf.get(a) ?? null) - createdAtOf(idOf.get(b) ?? null);

    // ルートを時刻昇順に並べ、各グループ内も時刻昇順（ルートが最古で先頭になる）。
    const orderedRoots = [...groups.keys()].sort((a, b) => createdAtOf(a) - createdAtOf(b));
    const result: NoteEditorBlock[] = [];
    for (const root of orderedRoots) {
      result.push(...(groups.get(root) ?? []).sort(byTime));
    }
    // id 解決不能なブロックは末尾へ（時刻順）。
    result.push(...rootless.sort(byTime));
    return result;
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

<svelte:window on:click={() => (sortMenuOpen = false)} />

<section class="blocks-section">
  <div class="blocks-header">
    <span class="blocks-label">まとめの中身</span>
    {#if noteCount > 0}
      <span class="blocks-badge">{noteCount}件の投稿</span>
    {/if}
    {#if noteCount >= 1}
      <div class="sort-wrap">
        <button
          class="btn-sort-time"
          type="button"
          disabled={sortLoading}
          aria-haspopup="menu"
          aria-expanded={sortMenuOpen}
          on:click|stopPropagation={() => (sortMenuOpen = !sortMenuOpen)}
        >
          {sortLoading ? '取得中…' : '時系列に並べる'}
          <svg
            class="sort-chevron"
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {#if sortMenuOpen}
          <div class="sort-dropdown" role="menu">
            <button
              class="sort-dropdown-item"
              type="button"
              role="menuitem"
              on:click={() => sortByTime('simple')}
            >
              <span class="sort-item-title">時刻順（単純）</span>
              <span class="sort-item-desc">全ポストを時刻昇順に並べます</span>
            </button>
            <button
              class="sort-dropdown-item"
              type="button"
              role="menuitem"
              on:click={() => sortByTime('reply')}
            >
              <span class="sort-item-title">リプライ考慮</span>
              <span class="sort-item-desc">返信を元の投稿の下にまとめます</span>
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
  {#if sortError}
    <p class="sort-error">{sortError}</p>
  {/if}

  {#if blocks.length === 0}
    <div class="empty-state">下のボタンで投稿・コメント・見出しを追加できます</div>
  {:else}
    <div class="block-list" use:sortableAction={{ onSort: handleSort }}>
      {#each blocks as block, i (block.id)}
        <div class="block-wrapper">
          <GapInserter
            afterIndex={i - 1}
            openId={openGapId}
            setOpenId={setOpenGapId}
            onInsert={handleGapInsert}
          />
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
                {#if editingComments.has(block.id) || !block.text.trim()}
                  <textarea
                    class="comment-textarea"
                    data-block-id={block.id}
                    placeholder="コメントを入力…"
                    value={block.text}
                    on:input={(e) => updateText(block.id, e.currentTarget.value)}
                    on:blur={() => stopEditingComment(block.id)}
                    rows={3}
                  ></textarea>
                {:else}
                  <div
                    class="comment-preview"
                    on:click={() => startEditingComment(block.id)}
                    on:keydown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') startEditingComment(block.id);
                    }}
                    role="button"
                    tabindex="0"
                    title="クリックで編集"
                  >
                    <div class="comment-preview-body block-comment-md">
                      <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized via DOMPurify in renderInlineMarkdown -->
                      {@html renderInlineMarkdown(block.text)}
                    </div>
                    <span class="comment-preview-hint">クリックで編集</span>
                  </div>
                {/if}
              {:else if block.type === 'heading'}
                <span class="block-type-label">見出し</span>
                <input
                  class="heading-input"
                  data-block-id={block.id}
                  type="text"
                  placeholder="見出しを入力…"
                  value={block.text}
                  on:input={(e) => updateText(block.id, e.currentTarget.value)}
                />
              {/if}
            </div>

            <button class="delete-btn" on:click={() => deleteBlock(block.id)} aria-label="削除"
              >×</button
            >
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <div class="add-buttons">
    <button class="add-btn" on:click={addPostFromBottom}>＋ 投稿を追加</button>
    <button class="add-btn" on:click={addCommentFromBottom}>＋ コメントを追加</button>
    <button class="add-btn" on:click={addHeadingFromBottom}>＋ 見出しを追加</button>
  </div>
</section>

<AddNoteModal open={showAddModal} on:add={handleModalAdd} on:close={handleModalClose} />

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

  .sort-wrap {
    margin-left: auto;
    flex-shrink: 0;
    position: relative;
  }

  .btn-sort-time {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 700;
    font-family: var(--font-ui);
    color: var(--accent-dark);
    background: var(--accent-pale);
    border: 1.5px solid var(--accent-mid);
    border-radius: 999px;
    padding: 3px 12px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.12s;
  }

  .sort-chevron {
    flex-shrink: 0;
  }

  .sort-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 50;
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: 12px;
    box-shadow: var(--shadow-popover);
    padding: 4px;
    min-width: 220px;
  }

  .sort-dropdown-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    text-align: left;
    padding: 8px 12px;
    border: none;
    background: transparent;
    border-radius: 8px;
    cursor: pointer;
    font-family: var(--font-ui);
    transition: background 0.1s;
  }

  .sort-dropdown-item:hover {
    background: var(--accent-pale);
  }

  .sort-item-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--ink);
  }

  .sort-item-desc {
    font-size: 11px;
    color: var(--ink3);
  }

  .btn-sort-time:hover:not(:disabled) {
    background: var(--accent-mid);
    border-color: var(--accent);
  }

  .btn-sort-time:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  .sort-error {
    font-size: 12px;
    color: #dc2626;
    margin: 0 0 8px;
    font-family: var(--font-ui);
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
    margin-bottom: 12px;
  }

  .block-wrapper {
    display: flex;
    flex-direction: column;
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
    box-shadow: var(--shadow-dialog-sm);
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

  .comment-preview {
    position: relative;
    border: 1.5px solid var(--border2);
    border-radius: 10px;
    padding: 8px 10px;
    background: var(--accent-pale);
    cursor: text;
    transition: border-color 0.12s;
  }

  .comment-preview:hover {
    border-color: var(--accent-mid);
  }

  .comment-preview:focus-visible {
    outline: none;
    border-color: var(--accent);
  }

  .comment-preview-body {
    font-size: 14px;
    color: var(--ink2);
    line-height: 1.75;
    word-break: break-word;
  }

  :global(.comment-preview-body p) {
    margin: 0.3em 0;
  }

  :global(.comment-preview-body p:first-child) {
    margin-top: 0;
  }

  :global(.comment-preview-body p:last-child) {
    margin-bottom: 0;
  }

  :global(.comment-preview-body strong) {
    font-weight: 700;
    color: var(--ink);
  }

  :global(.comment-preview-body em) {
    font-style: italic;
  }

  :global(.comment-preview-body a) {
    color: var(--accent);
    text-decoration: underline;
    word-break: break-all;
  }

  :global(.comment-preview-body code) {
    font-family: monospace;
    font-size: 0.9em;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 5px;
  }

  :global(.comment-preview-body ul),
  :global(.comment-preview-body ol) {
    padding-left: 1.5em;
    margin: 0.3em 0;
  }

  :global(.comment-preview-body h1),
  :global(.comment-preview-body h2),
  :global(.comment-preview-body h3),
  :global(.comment-preview-body h4) {
    font-family: var(--font-ui);
    line-height: 1.4;
    margin: 0.5em 0 0.3em;
  }

  :global(.comment-preview-body h1) {
    font-size: 16px;
    font-weight: 800;
    color: var(--ink);
  }
  :global(.comment-preview-body h2) {
    font-size: 14px;
    font-weight: 800;
    color: var(--ink);
  }
  :global(.comment-preview-body h3) {
    font-size: 14px;
    font-weight: 700;
    color: var(--ink);
  }
  :global(.comment-preview-body h4) {
    font-size: 14px;
    font-weight: 700;
    color: var(--ink2);
  }

  :global(.comment-preview-body blockquote) {
    margin: 6px 0;
    padding: 6px 12px;
    border-left: 3px solid var(--accent);
    background: var(--bg);
    border-radius: 4px;
    color: var(--ink3);
    font-size: 13px;
  }

  :global(.comment-preview-body pre) {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 10px;
    overflow-x: auto;
    font-size: 12px;
    line-height: 1.5;
    margin: 6px 0;
  }

  :global(.comment-preview-body pre code) {
    background: none;
    border: none;
    padding: 0;
  }

  .comment-preview-hint {
    display: block;
    text-align: right;
    font-size: 10px;
    color: var(--ink3);
    margin-top: 4px;
    opacity: 0;
    transition: opacity 0.12s;
  }

  .comment-preview:hover .comment-preview-hint {
    opacity: 1;
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
