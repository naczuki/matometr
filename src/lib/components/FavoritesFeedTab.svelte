<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import type { Subscription } from 'rxjs';
  import type { Note } from '$lib/types';
  import {
    fetchFavoriteReactions,
    fetchUserReadRelays,
    fetchNotesByIds
  } from '$lib/services/NostrClient';
  import { currentUser } from '$lib/stores/auth';
  import Spinner from '$lib/components/Spinner.svelte';
  import NotePreview from '$lib/components/NotePreview.svelte';
  import { collectObservable } from '$lib/utils/rxCollect';

  export let selectedIds: Set<string>;
  export let onToggle: (eventId: string, nevent: string) => void;

  let initLoading = true;
  let loadMoreLoading = false;
  let initError = '';
  let readRelays: string[] = [];
  let oldestReactionAt: number | null = null;
  let reachedEnd = false;
  let activeSub: Subscription | null = null;

  /** eventId -> 最新リアクション時刻 */
  const reactedAtMap = new Map<string, number>();
  /** eventId -> Note */
  const noteById = new Map<string, Note>();

  let displayNotes: Note[] = [];

  function rebuildDisplay(): void {
    displayNotes = [...noteById.values()].sort((a, b) => {
      const ra = reactedAtMap.get(a.id) ?? 0;
      const rb = reactedAtMap.get(b.id) ?? 0;
      return rb - ra;
    });
  }

  async function loadBatch(until?: number): Promise<number> {
    const user = $currentUser;
    if (!user) return 0;

    const reactions: { eventId: string; reactedAt: number }[] = [];
    let oldest = until ?? Infinity;

    await new Promise<void>((resolve) => {
      activeSub?.unsubscribe();
      activeSub = fetchFavoriteReactions(user.pubkey, {
        until,
        limit: 30,
        relays: readRelays
      }).subscribe({
        next: (r) => {
          reactions.push(r);
          if (r.reactedAt < oldest) oldest = r.reactedAt;
        },
        complete: () => resolve(),
        error: () => resolve()
      });
    });

    if (reactions.length === 0) return 0;

    oldestReactionAt = oldest === Infinity ? null : oldest;

    const idsToFetch = new Set<string>();
    for (const r of reactions) {
      const cur = reactedAtMap.get(r.eventId);
      if (cur == null || r.reactedAt > cur) reactedAtMap.set(r.eventId, r.reactedAt);
      if (!noteById.has(r.eventId)) idsToFetch.add(r.eventId);
    }

    if (idsToFetch.size > 0) {
      await new Promise<void>((resolve) => {
        activeSub?.unsubscribe();
        activeSub = fetchNotesByIds([...idsToFetch], { relays: readRelays }).subscribe({
          next: (n) => { noteById.set(n.id, n); },
          complete: () => resolve(),
          error: () => resolve()
        });
      });
    }

    rebuildDisplay();
    return reactions.length;
  }

  onMount(async () => {
    const user = $currentUser;
    if (!user) {
      initError = 'ログインが必要です';
      initLoading = false;
      return;
    }

    readRelays = await collectObservable<string[]>(fetchUserReadRelays(user.pubkey), []);

    const count = await loadBatch();
    if (count === 0) reachedEnd = true;
    initLoading = false;
  });

  onDestroy(() => activeSub?.unsubscribe());

  async function loadMore(): Promise<void> {
    if (loadMoreLoading || reachedEnd || oldestReactionAt == null) return;
    loadMoreLoading = true;
    const count = await loadBatch(oldestReactionAt - 1);
    if (count === 0) reachedEnd = true;
    loadMoreLoading = false;
  }

  function neventFor(note: Note): string {
    const relays = readRelays.length > 0 ? readRelays.slice(0, 1) : undefined;
    return `nostr:${nip19.neventEncode({ id: note.id, relays, author: note.pubkey })}`;
  }

  function handleClick(note: Note): void {
    onToggle(note.id, neventFor(note));
  }
</script>

{#if initLoading}
  <div class="state">
    <Spinner />
    <div class="state-text">読み込み中…</div>
  </div>
{:else if initError}
  <div class="state">
    <div class="state-text">{initError}</div>
  </div>
{:else if displayNotes.length === 0}
  <div class="state">
    <div class="state-text">お気に入りの投稿が見つかりません</div>
  </div>
{:else}
  <div class="feed">
    {#each displayNotes as note (note.id)}
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
  .state {
    text-align: center;
    padding: 40px 16px;
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
