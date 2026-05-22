<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Subscription } from 'rxjs';
  import type { Note } from '$lib/types';
  import { fetchTagSearch } from '$lib/services/NostrClient';
  import NotePreview from '$lib/components/NotePreview.svelte';
  import FeedList from '$lib/components/FeedList.svelte';
  import { neventFor } from '$lib/utils/nostr';

  export let selectedIds: Set<string>;
  export let onToggle: (eventId: string, nevent: string) => void;

  const TWO_WEEKS_SEC = 14 * 24 * 60 * 60;

  let keyword = '';
  let searchLoading = false;
  let loadMoreLoading = false;
  let searchError = '';
  let hasSearched = false;
  let reachedEnd = false;
  let notes: Note[] = [];
  let oldestAt: number | null = null;
  let activeSub: Subscription | null = null;

  const noteById = new Map<string, Note>();

  function getSince(): number {
    return Math.floor(Date.now() / 1000) - TWO_WEEKS_SEC;
  }

  function normalizedKeyword(): string {
    return keyword.replace(/^#+/, '').trim();
  }

  function addNotes(incoming: Note[]): number {
    let added = 0;
    for (const n of incoming) {
      if (!noteById.has(n.id)) {
        noteById.set(n.id, n);
        added++;
      }
    }
    if (added > 0) {
      notes = [...noteById.values()].sort((a, b) => b.createdAt - a.createdAt);
      oldestAt = notes[notes.length - 1]?.createdAt ?? oldestAt;
    }
    return added;
  }

  function doFetch(options: { until?: number }): Promise<number> {
    const kw = normalizedKeyword();
    return new Promise((resolve) => {
      const batch: Note[] = [];
      activeSub?.unsubscribe();
      activeSub = fetchTagSearch(kw, {
        until: options.until,
        since: getSince(),
        limit: 30
      }).subscribe({
        next: (n) => batch.push(n),
        complete: () => {
          const added = addNotes(batch);
          if (batch.length === 0 || added === 0) reachedEnd = true;
          resolve(added);
        },
        error: () => { reachedEnd = true; resolve(0); }
      });
    });
  }

  async function handleSearch(): Promise<void> {
    const kw = normalizedKeyword();
    if (!kw) {
      searchError = 'キーワードを入力してください';
      return;
    }
    searchError = '';
    searchLoading = true;
    hasSearched = true;
    reachedEnd = false;
    noteById.clear();
    notes = [];
    oldestAt = null;
    await doFetch({});
    searchLoading = false;
  }

  async function loadMore(): Promise<void> {
    if (loadMoreLoading || reachedEnd || oldestAt == null) return;
    loadMoreLoading = true;
    await doFetch({ until: oldestAt - 1 });
    loadMoreLoading = false;
  }

  onDestroy(() => activeSub?.unsubscribe());

  function handleClick(note: Note): void {
    onToggle(note.id, neventFor(note));
  }
</script>

<div class="search-area">
  <div class="search-row">
    <input
      class="search-input"
      type="text"
      bind:value={keyword}
      on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } }}
      placeholder="#タグ または キーワード"
    />
    <button class="search-btn" type="button" on:click={handleSearch} disabled={searchLoading}>
      {searchLoading ? '…' : '検索'}
    </button>
  </div>
  {#if searchError}
    <p class="search-error">{searchError}</p>
  {/if}
</div>

<FeedList
  loading={searchLoading}
  loadingMore={loadMoreLoading}
  error=""
  empty={!hasSearched || notes.length === 0}
  {reachedEnd}
  emptyMessage={!hasSearched ? 'キーワードを入力して検索してください' : '投稿が見つかりませんでした'}
  loadingMessage="検索中…"
  onLoadMore={loadMore}
>
  {#each notes as note (note.id)}
    <NotePreview {note} selected={selectedIds.has(note.id)} onClick={handleClick} />
  {/each}
</FeedList>

<style>
  .search-area {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }

  .search-row {
    display: flex;
    gap: 6px;
  }

  .search-input {
    flex: 1;
    min-width: 0;
    padding: 10px 12px;
    border: 1.5px solid var(--border2);
    border-radius: 10px;
    font-size: 14px;
    color: var(--ink);
    background: var(--bg);
    font-family: var(--font-body);
    box-sizing: border-box;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .search-btn {
    padding: 0 16px;
    background: var(--surface);
    border: 1.5px solid var(--accent-mid);
    border-radius: 10px;
    color: var(--accent-dark);
    font-family: var(--font-ui);
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .search-btn:hover:not(:disabled) {
    background: var(--accent-pale);
    border-color: var(--accent);
  }

  .search-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .search-error {
    margin: 4px 0 0;
    font-size: 12px;
    color: #dc2626;
  }

</style>
