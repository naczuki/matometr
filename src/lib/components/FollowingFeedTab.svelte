<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Subscription } from 'rxjs';
  import type { Note } from '$lib/types';
  import {
    fetchFollowList,
    fetchUserReadRelays,
    fetchNotesFromAuthorsWithRelay
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
  let reachedEnd = false;
  let activeSubs: Subscription[] = [];
  const relayCursors = new Map<string, number>();
  const exhaustedRelays = new Set<string>();

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
    }
  }

  function startFetch(): Promise<void> {
    const targetRelays = readRelays.filter((r) => !exhaustedRelays.has(r));
    if (targetRelays.length === 0) {
      reachedEnd = true;
      return Promise.resolve();
    }

    activeSubs.forEach((s) => s.unsubscribe());
    activeSubs = [];

    return Promise.all(
      targetRelays.map(
        (relay) =>
          new Promise<void>((resolve) => {
            const batch: Note[] = [];
            const cursor = relayCursors.get(relay);
            const until = cursor !== undefined ? cursor - 1 : undefined;
            const sub = fetchNotesFromAuthorsWithRelay(authors, {
              until,
              limit: 30,
              relays: [relay]
            }).subscribe({
              next: ({ note }) => batch.push(note),
              complete: () => {
                addNotes(batch);
                if (batch.length === 0) exhaustedRelays.add(relay);
                else relayCursors.set(relay, Math.min(...batch.map((n) => n.createdAt)));
                resolve();
              },
              error: () => resolve()
            });
            activeSubs.push(sub);
          })
      )
    ).then(() => {
      reachedEnd = targetRelays.every((r) => exhaustedRelays.has(r));
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

  onDestroy(() => activeSubs.forEach((s) => s.unsubscribe()));

  async function loadMore(): Promise<void> {
    if (loadMoreLoading || reachedEnd) return;
    loadMoreLoading = true;
    await startFetch();
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
