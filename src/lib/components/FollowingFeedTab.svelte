<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Subscription } from 'rxjs';
  import type { Note } from '$lib/types';
  import {
    fetchFollowList,
    fetchUserReadRelays,
    fetchNotesFromAuthors
  } from '$lib/services/NostrClient';
  import { currentUser } from '$lib/stores/auth';
  import NotePreview from '$lib/components/NotePreview.svelte';
  import FeedList from '$lib/components/FeedList.svelte';
  import { collectObservable } from '$lib/utils/rxCollect';
  import { neventFor } from '$lib/utils/nostr';

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

  function handleClick(note: Note): void {
    onToggle(note.id, neventFor(note, readRelays));
  }
</script>

<FeedList
  loading={initLoading}
  loadingMore={loadMoreLoading}
  error={initError}
  empty={notes.length === 0}
  {reachedEnd}
  emptyMessage="表示できる投稿がありません"
  onLoadMore={loadMore}
>
  {#each notes as note (note.id)}
    <NotePreview {note} selected={selectedIds.has(note.id)} onClick={handleClick} />
  {/each}
</FeedList>
