<script lang="ts">
  import { onDestroy } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import type { Subscription } from 'rxjs';
  import type { Note } from '$lib/types';
  import { fetchTagSearch } from '$lib/services/NostrClient';
  import Spinner from '$lib/components/Spinner.svelte';
  import NotePreview from '$lib/components/NotePreview.svelte';

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

  function neventFor(note: Note): string {
    return `nostr:${nip19.neventEncode({ id: note.id, author: note.pubkey })}`;
  }

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

{#if searchLoading}
  <div class="state">
    <Spinner />
    <div class="state-text">検索中…</div>
  </div>
{:else if !hasSearched}
  <div class="state">
    <div class="state-text">キーワードを入力して検索してください</div>
  </div>
{:else if notes.length === 0}
  <div class="state">
    <div class="state-text">投稿が見つかりませんでした</div>
  </div>
{:else}
  <div class="feed">
    {#each notes as note (note.id)}
      <NotePreview {note} selected={selectedIds.has(note.id)} onClick={handleClick} />
    {/each}

    {#if !reachedEnd}
      <button class="load-more" on:click={loadMore} disabled={loadMoreLoading}>
        {loadMoreLoading ? '読み込み中…' : 'もっと読み込む'}
      </button>
    {/if}
  </div>
{/if}

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

  .state {
    text-align: center;
    padding: 32px 16px;
  }

  .state-text {
    font-size: 13px;
    color: var(--ink3);
    font-family: var(--font-ui);
  }

  .feed {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 16px;
  }

  .load-more {
    background: var(--surface);
    border: 1.5px dashed var(--accent-mid);
    color: var(--accent-dark);
    font-family: var(--font-ui);
    font-weight: 700;
    font-size: 13px;
    padding: 10px 20px;
    border-radius: 999px;
    cursor: pointer;
    align-self: center;
    margin: 8px auto 0;
    transition: all 0.12s;
  }

  .load-more:hover:not(:disabled) {
    border-color: var(--accent);
    background: var(--accent-pale);
  }

  .load-more:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
