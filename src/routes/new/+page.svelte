<script lang="ts">
  import { nip19 } from 'nostr-tools';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import QuotedNote from '$lib/components/QuotedNote.svelte';
  import AddNoteModal from '$lib/components/AddNoteModal.svelte';
  import { currentUser } from '$lib/stores/auth';
  import { publishMatome, fetchNotesByIds } from '$lib/services/NostrClient';
  import { DEFAULT_RELAYS_JP } from '$lib/stores/relays';
  import { sortableAction } from '$lib/actions/sortable';
  import type { EditorBlock, NoteEditorBlock } from '$lib/types';

  let title = '';
  let summary = '';
  let blocks: EditorBlock[] = [];
  let showAddModal = false;

  function openAddModal(): void {
    showAddModal = true;
  }

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

  let sortLoading = false;
  let lastSortOrder: 'asc' | 'desc' | null = null;

  async function sortByTime(): Promise<void> {
    const hasNonNevent = blocks.some(b => b.type === 'comment' || b.type === 'heading');
    if (hasNonNevent) {
      const ok = window.confirm('コメントや見出しの位置がリセットされます。続けますか？');
      if (!ok) return;
    }

    const nextOrder: 'asc' | 'desc' = lastSortOrder === 'asc' ? 'desc' : 'asc';
    const sortableBlocks = blocks.filter((b): b is NoteEditorBlock => b.type === 'nevent' && !!b.nevent);
    const otherBlocks = blocks.filter(b => {
      if (b.type !== 'nevent') return true;
      return !b.nevent;
    });

    const idsToFetch = sortableBlocks
      .map(b => eventIdFromNevent(b.nevent))
      .filter((id): id is string => id !== null);

    if (idsToFetch.length === 0) return;

    sortLoading = true;
    const createdAtMap = new Map<string, number>();
    await new Promise<void>((resolve) => {
      fetchNotesByIds(idsToFetch).subscribe({
        next: (n) => createdAtMap.set(n.id, n.createdAt),
        complete: resolve,
        error: resolve
      });
      setTimeout(resolve, 10_000);
    });
    sortLoading = false;

    const sorted = [...sortableBlocks].sort((a, b) => {
      const idA = eventIdFromNevent(a.nevent) ?? '';
      const idB = eventIdFromNevent(b.nevent) ?? '';
      const tA = createdAtMap.get(idA) ?? 0;
      const tB = createdAtMap.get(idB) ?? 0;
      return nextOrder === 'asc' ? tA - tB : tB - tA;
    });

    blocks = nextOrder === 'asc'
      ? [...sorted, ...otherBlocks]
      : [...otherBlocks, ...sorted];

    lastSortOrder = nextOrder;
  }

  function parseNostrInput(raw: string): string | null {
    const m = raw.trim().match(/(nevent1[a-z0-9]+|note1[a-z0-9]+)/);
    if (!m) return null;
    try {
      const decoded = nip19.decode(m[1]);
      if (decoded.type === 'nevent') return `nostr:${m[1]}`;
      if (decoded.type === 'note') {
        const nevent = nip19.neventEncode({ id: decoded.data, relays: [DEFAULT_RELAYS_JP[0]] });
        return `nostr:${nevent}`;
      }
    } catch { /* 無効な bech32 */ }
    return null;
  }

  function eventIdFromNevent(neventStr: string): string | null {
    const m = neventStr.match(/nostr:(nevent1[a-z0-9]+)/);
    if (!m) return null;
    try {
      const decoded = nip19.decode(m[1]);
      if (decoded.type === 'nevent') return decoded.data.id;
    } catch { /* ignore */ }
    return null;
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

  $: noteCount = blocks.filter((b) => b.type === 'nevent' && b.nevent).length;
  $: canPublish = title.trim().length > 0 && noteCount > 0;

  let publishing = false;
  let publishError = '';

  async function handlePublish(): Promise<void> {
    if (!canPublish || publishing) return;
    publishing = true;
    publishError = '';
    try {
      const naddr = await publishMatome({ title: title.trim(), summary: summary.trim(), blocks });
      await goto(`${base}/matome/${naddr}`);
    } catch (e) {
      publishError = e instanceof Error ? e.message : '公開に失敗しました';
    } finally {
      publishing = false;
    }
  }
</script>

<svelte:head>
  <title>まとめを作成 | まとめたー</title>
</svelte:head>

{#if !$currentUser}
  <div class="gate">
    <p class="gate-msg">まとめを作成するにはログインが必要です。</p>
    <a href="{base}/" class="btn-back">トップへ戻る</a>
  </div>
{:else}
  <div class="page">
    <h1 class="page-title">まとめを作る</h1>

    <!-- メタ情報 -->
    <section class="card">
      <div class="field">
        <label class="field-label" for="title">タイトル</label>
        <input
          id="title"
          class="field-input"
          type="text"
          placeholder="まとめのタイトルを入力"
          bind:value={title}
          maxlength={120}
        />
      </div>
      <div class="field">
        <label class="field-label" for="summary">説明（省略可）</label>
        <textarea
          id="summary"
          class="field-textarea"
          placeholder="このまとめについて簡単に説明してください"
          bind:value={summary}
          rows={3}
        ></textarea>
      </div>
    </section>

    <!-- ブロックエディタ -->
    <section class="blocks-section">
      <div class="blocks-header">
        <span class="blocks-label">まとめの中身</span>
        {#if noteCount > 0}
          <span class="blocks-badge">{noteCount}件の投稿</span>
        {/if}
        {#if noteCount >= 1}
          <button class="sort-btn" type="button" on:click={sortByTime} disabled={sortLoading}>
            {sortLoading ? '…' : lastSortOrder === 'asc' ? '↑ 古い順' : lastSortOrder === 'desc' ? '↓ 新しい順' : '↕ 時系列に並べる'}
          </button>
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
              <!-- ドラッグハンドル -->
              <div class="drag-handle" aria-hidden="true">⋮⋮</div>

              <!-- コンテンツ -->
              <div class="block-body">
                {#if block.type === 'nevent'}
                  {#if block.nevent}
                    {@const eventId = eventIdFromNevent(block.nevent)}
                    {#if eventId}
                      <QuotedNote {eventId} />
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

              <!-- 削除 -->
              <button class="delete-btn" on:click={() => deleteBlock(block.id)} aria-label="削除">×</button>
            </div>
          {/each}
        </div>
      {/if}

      <!-- 追加ボタン -->
      <div class="add-buttons">
        <button class="add-btn" on:click={openAddModal}>＋ 投稿を追加</button>
        <button class="add-btn" on:click={addComment}>＋ コメントを追加</button>
        <button class="add-btn" on:click={addHeading}>＋ 見出しを追加</button>
      </div>
    </section>

    <!-- アクション -->
    {#if publishError}
      <p class="publish-error">{publishError}</p>
    {/if}
    <div class="action-bar">
      <a href="{base}/" class="btn-cancel">キャンセル</a>
      <button
        class="btn-publish"
        disabled={!canPublish || publishing}
        on:click={handlePublish}
      >
        {publishing ? '公開中…' : '公開する'}
      </button>
    </div>
  </div>

  <AddNoteModal
    open={showAddModal}
    on:add={handleModalAdd}
    on:close={() => (showAddModal = false)}
  />
{/if}

<style>
  .gate {
    text-align: center;
    padding: 60px 20px;
  }

  .gate-msg {
    color: var(--ink2);
    margin-bottom: 16px;
  }

  .btn-back {
    color: var(--accent);
    font-weight: 700;
    text-decoration: none;
  }

  /* ページ */
  .page {
    max-width: 720px;
    margin: 0 auto;
    padding: 24px 16px 80px;
  }

  .page-title {
    font-family: var(--font-ui);
    font-size: 22px;
    font-weight: 800;
    color: var(--ink);
    margin: 0 0 20px;
  }

  /* カード */
  .card {
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: 16px;
    padding: 18px;
    margin-bottom: 20px;
  }

  /* フィールド */
  .field + .field {
    margin-top: 14px;
  }

  .field-label {
    display: block;
    font-size: 11px;
    font-weight: 700;
    color: var(--ink3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 6px;
  }

  .field-input,
  .field-textarea {
    width: 100%;
    border: 1.5px solid var(--border2);
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 15px;
    color: var(--ink);
    background: var(--bg);
    font-family: var(--font-body);
    box-sizing: border-box;
    transition: border-color 0.12s;
    resize: vertical;
  }

  .field-input:focus,
  .field-textarea:focus {
    outline: none;
    border-color: var(--accent);
  }

  /* ブロックセクション */
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

  .sort-btn {
    margin-left: auto;
    background: var(--surface);
    border: 1.5px solid var(--border2);
    border-radius: 999px;
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 700;
    padding: 4px 12px;
    cursor: pointer;
    transition: all 0.12s;
    white-space: nowrap;
  }

  .sort-btn:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }

  .sort-btn:disabled {
    opacity: 0.5;
    cursor: wait;
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

  /* ブロックリスト */
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

  /* ドラッグハンドル（視覚的なアフォーダンス） */
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

  /* ブロック本体 */
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

  /* note ブロック */
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

  /* コメント */
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

  /* 見出し */
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

  /* 削除ボタン */
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

  /* 追加ボタン */
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

  /* エラー */
  .publish-error {
    font-size: 13px;
    color: #dc2626;
    background: #fff5f5;
    border: 1px solid #fecaca;
    border-radius: 10px;
    padding: 10px 14px;
    margin-bottom: 12px;
  }

  /* アクションバー */
  .action-bar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }

  .btn-cancel {
    padding: 10px 20px;
    border: 1.5px solid var(--border2);
    border-radius: var(--radius-btn);
    background: var(--surface);
    color: var(--ink2);
    font-size: 14px;
    font-weight: 600;
    font-family: var(--font-ui);
    cursor: pointer;
    text-decoration: none;
    transition: all 0.12s;
  }

  .btn-cancel:hover {
    border-color: var(--ink2);
    background: var(--bg);
  }

  .btn-publish {
    padding: 10px 24px;
    border: none;
    border-radius: var(--radius-btn);
    background: var(--accent);
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    font-family: var(--font-ui);
    cursor: pointer;
    transition: background 0.12s;
  }

  .btn-publish:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-publish:not(:disabled):hover {
    background: var(--accent-dark);
  }
</style>
