<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import type { Subscription } from 'rxjs';
  import type { Note } from '$lib/types';
  import {
    fetchFollowList,
    fetchUserReadRelays,
    fetchNotesFromAuthors
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
  let notes: Note[] = [];
  let authors: string[] = [];
  let readRelays: string[] = [];
  let oldestAt: number | null = null;
  let reachedEnd = false;
  let activeSub: Subscription | null = null;

  const noteById = new Map<string, Note>();

  function addNotes(incoming: Note[]): void {
    let added = false;
    for (const n of incoming) {
      if (!noteById.has(n.id)) {
        noteById.set(n.id, n);
        added = true;
      }
    }
    if (added) {
      notes = [...noteById.values()].sort((a, b) => b.createdAt - a.createdAt);
      oldestAt = notes[notes.length - 1]?.createdAt ?? oldestAt;
    }
  }

  function startFetch(until?: number): Promise<void> {
    return new Promise((resolve) => {
      const batch: Note[] = [];
      activeSub?.unsubscribe();
      activeSub = fetchNotesFromAuthors(authors, {
        until,
        limit: 30,
        relays: readRelays
      }).subscribe({
        next: (n) => batch.push(n),
        complete: () => {
          addNotes(batch);
          if (batch.length === 0) reachedEnd = true;
          resolve();
        },
        error: () => resolve()
      });
    });
  }

  onMount(async () => {
    const user = $currentUser;
    if (!user) {
      initError = 'ログインが必要です';
      initLoading = false;
      return;
    }

    const [follows, relays] = await Promise.all([
      collectObservable<string[]>(fetchFollowList(user.pubkey), []),
      collectObservable<string[]>(fetchUserReadRelays(user.pubkey), [])
    ]);

    if (follows.length === 0) {
      initError = 'フォロー中のユーザーが見つかりません';
      initLoading = false;
      return;
    }

    authors = follows;
    readRelays = relays;
    await startFetch();
    initLoading = false;
  });

  onDestroy(() => activeSub?.unsubscribe());

  async function loadMore(): Promise<void> {
    if (loadMoreLoading || reachedEnd || oldestAt == null) return;
    loadMoreLoading = true;
    await startFetch(oldestAt - 1);
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
{:else if notes.length === 0}
  <div class="state">
    <div class="state-text">表示できる投稿がありません</div>
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
