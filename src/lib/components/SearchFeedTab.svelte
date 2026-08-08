<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Subscription } from 'rxjs';
  import { finalize } from 'rxjs';
  import type { Note } from '$lib/types';
  import { fetchTagSearchOneRelay } from '$lib/services/NostrClient';
  import { DEFAULT_RELAYS, SEARCH_RELAYS } from '$lib/stores/relays';
  import NotePreview from '$lib/components/NotePreview.svelte';
  import FeedList from '$lib/components/FeedList.svelte';
  import { neventFor } from '$lib/utils/nostr';

  export let selectedIds: Set<string>;
  export let onToggle: (eventId: string, nevent: string) => void;
  export let matomePostPubkeys: Map<string, string> = new Map();

  let keyword = '';
  let searchLoading = false;
  let loadMoreLoading = false;
  let searchError = '';
  let hasSearched = false;
  let reachedEnd = false;
  let notes: Note[] = [];
  let subs: Subscription[] = [];

  const BATCH_SIZE = 30;
  const MAX_INNER_ITERATIONS = 10;

  const noteById = new Map<string, Note>();
  // 各取得ソース = (mode, relay)。タグ検索は通常リレー、全文検索は検索リレーに対して行う。
  // ソースごとに独立した until カーソルを持ち、watermark 方式でページングする。これにより
  // 1 つのリレー／検索方式に引っ張られて期間がごっそり抜ける問題を防ぐ。
  type Source = { mode: 'tag' | 'search'; relay: string };
  let sources: Source[] = [];
  const cursors = new Map<string, number>();
  const exhausted = new Set<string>();

  function sid(s: Source): string {
    return `${s.mode} ${s.relay}`;
  }

  function buildSources(): Source[] {
    const tag: Source[] = DEFAULT_RELAYS.map((relay) => ({ mode: 'tag' as const, relay }));
    const search: Source[] = SEARCH_RELAYS.map((relay) => ({ mode: 'search' as const, relay }));
    return [...tag, ...search];
  }

  function activeSources(): Source[] {
    return sources.filter((s) => !exhausted.has(sid(s)));
  }

  function computeT(): number | null {
    let max: number | null = null;
    for (const s of activeSources()) {
      const c = cursors.get(sid(s));
      if (c === undefined) continue;
      if (max === null || c > max) max = c;
    }
    return max;
  }

  function candidatesAtOrAbove(T: number, displayedIds: Set<string>): Note[] {
    const out: Note[] = [];
    for (const n of noteById.values()) {
      if (displayedIds.has(n.id)) continue;
      if (n.createdAt >= T) out.push(n);
    }
    return out;
  }

  function normalizedKeyword(): string {
    return keyword.replace(/^#+/, '').trim();
  }

  /** 1 ソース（1 リレー × 1 検索方式）を 1 ページ取得し、カーソル／枯渇を更新する。 */
  function fetchOne(kw: string, s: Source): Promise<void> {
    const key = sid(s);
    const cursor = cursors.get(key);
    // until は包含なので、境界（前ページ最古と同じ秒）のイベントを取りこぼさないよう
    // cursor をそのまま使う。重複は noteById と newCount で吸収する。
    const until = cursor;
    return new Promise((resolve) => {
      const got: Note[] = [];
      let newCount = 0;
      const sub = fetchTagSearchOneRelay(kw, s.mode, s.relay, {
        until,
        limit: BATCH_SIZE
      })
        // 再検索時の unsubscribe でも必ず resolve し、待ち中の loadMore を固まらせない
        .pipe(finalize(resolve))
        .subscribe({
          next: ({ note }) => {
            if (!noteById.has(note.id)) newCount++;
            noteById.set(note.id, note);
            got.push(note);
          },
          complete: () => settlePage(key, cursor, got, newCount, false),
          error: () => settlePage(key, cursor, got, newCount, true)
        });
      subs.push(sub);
    });
  }

  function settlePage(
    key: string,
    prevCursor: number | undefined,
    got: Note[],
    newCount: number,
    errored: boolean
  ): void {
    if (got.length === 0) {
      // 一時的なエラーで 0 件のときは枯渇にせず、次の loadMore で再試行する
      if (!errored) exhausted.add(key);
      return;
    }
    const oldest = Math.min(...got.map((n) => n.createdAt));
    if (prevCursor === undefined || oldest < prevCursor) {
      cursors.set(key, oldest);
      return;
    }
    // カーソルが進まなかった場合：境界の再送だけなら枯渇。フルページなら同一秒に
    // limit 超が集中しているか until を無視するリレーなので、1 秒戻して前進を強制する。
    if (newCount === 0) {
      if (got.length >= BATCH_SIZE && prevCursor !== undefined) {
        cursors.set(key, prevCursor - 1);
      } else {
        exhausted.add(key);
      }
    }
    // newCount > 0 で oldest >= prevCursor のときはカーソル据え置きで続行
    // （次ページが全て重複になった時点で上の分岐に入る）
  }

  function refreshNotes(): void {
    const T = computeT();
    if (T === null) {
      notes = [...noteById.values()].sort((a, b) => b.createdAt - a.createdAt);
    } else {
      const displayed = new Set(notes.map((n) => n.id));
      const adopted = candidatesAtOrAbove(T, displayed).sort((a, b) => b.createdAt - a.createdAt);
      notes = [...notes, ...adopted].sort((a, b) => b.createdAt - a.createdAt);
    }
  }

  // 再検索のたびに進める世代番号。実行中の loadMore が古い世代の続きを
  // 新しい検索の状態に書き込まないよう、await のたびに照合して中断する。
  let searchGeneration = 0;

  async function handleSearch(): Promise<void> {
    const kw = normalizedKeyword();
    if (!kw) {
      searchError = 'キーワードを入力してください';
      return;
    }
    searchGeneration++;
    const gen = searchGeneration;
    searchError = '';
    searchLoading = true;
    hasSearched = true;
    reachedEnd = false;
    noteById.clear();
    notes = [];
    cursors.clear();
    exhausted.clear();
    subs.forEach((s) => s.unsubscribe());
    subs = [];
    sources = buildSources();

    await Promise.all(activeSources().map((s) => fetchOne(kw, s)));
    if (gen !== searchGeneration) return;
    refreshNotes();
    reachedEnd = activeSources().length === 0;
    searchLoading = false;
  }

  async function loadMore(): Promise<void> {
    if (loadMoreLoading || reachedEnd) return;
    const kw = normalizedKeyword();
    if (!kw) return;
    const gen = searchGeneration;
    loadMoreLoading = true;

    const displayedIds = new Set(notes.map((n) => n.id));
    const active = activeSources();
    if (active.length === 0) {
      reachedEnd = true;
      loadMoreLoading = false;
      return;
    }

    await Promise.all(active.map((s) => fetchOne(kw, s)));
    if (gen !== searchGeneration) {
      loadMoreLoading = false;
      return;
    }

    // 表示に足る候補（>= watermark）が BATCH_SIZE 集まるまで、遅れているソースを追加取得する。
    for (let iter = 0; iter < MAX_INNER_ITERATIONS; iter++) {
      const T = computeT();
      if (T === null) break;
      if (candidatesAtOrAbove(T, displayedIds).length >= BATCH_SIZE) break;
      const slow = activeSources().filter((s) => cursors.get(sid(s)) === T);
      if (slow.length === 0) break;
      await Promise.all(slow.map((s) => fetchOne(kw, s)));
      if (gen !== searchGeneration) {
        loadMoreLoading = false;
        return;
      }
    }

    refreshNotes();

    const displayedSet = new Set(notes.map((n) => n.id));
    const hasUndisplayed = [...noteById.values()].some((n) => !displayedSet.has(n.id));
    reachedEnd = activeSources().length === 0 && !hasUndisplayed;
    loadMoreLoading = false;
  }

  onDestroy(() => subs.forEach((s) => s.unsubscribe()));

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
      on:keydown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSearch();
        }
      }}
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
  emptyMessage={!hasSearched
    ? 'キーワードを入力して検索してください'
    : '投稿が見つかりませんでした'}
  loadingMessage="検索中…"
  onLoadMore={loadMore}
>
  {#each notes as note (note.id)}
    <NotePreview
      {note}
      selected={selectedIds.has(note.id)}
      onClick={handleClick}
      {matomePostPubkeys}
    />
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
    /* テキストボックスはシャドウを持たず、暖色の枠線だけで示す。 */
    border: 1.5px solid var(--border-warm);
    border-radius: var(--radius-card);
    font-size: 14px;
    color: var(--ink);
    background: var(--surface);
    font-family: var(--font-body);
    box-sizing: border-box;
  }

  .search-input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 0;
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
