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
  import { DEFAULT_RELAYS } from '$lib/stores/relays';
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
  let subs: Subscription[] = [];

  const noteById = new Map<string, Note>();
  const cursors = new Map<string, number>();
  const exhaustedRelays = new Set<string>();

  const BATCH_SIZE = 30;
  const MAX_INNER_ITERATIONS = 10;

  function normalizeRelay(r: string): string {
    return r.replace(/\/$/, '');
  }

  function addNotes(incoming: Note[]): void {
    for (const n of incoming) {
      noteById.set(n.id, n);
    }
  }

  function rebuildNotes(): void {
    notes = [...noteById.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  function activeRelays(): string[] {
    return readRelays.filter((r) => !exhaustedRelays.has(r));
  }

  function computeT(): number | null {
    let max: number | null = null;
    for (const r of activeRelays()) {
      const c = cursors.get(r);
      if (c === undefined) continue;
      if (max === null || c > max) max = c;
    }
    return max;
  }

  function collectCandidatesAtOrAbove(T: number, displayedIds: Set<string>): Note[] {
    const out: Note[] = [];
    for (const n of noteById.values()) {
      if (displayedIds.has(n.id)) continue;
      if (n.createdAt >= T) out.push(n);
    }
    return out;
  }

  function fetchOne(relay: string): Promise<void> {
    const cursor = cursors.get(relay);
    const until = cursor !== undefined ? cursor - 1 : undefined;
    return new Promise((resolve) => {
      const events: Note[] = [];
      const sub = fetchNotesFromAuthorsWithRelay(authors, {
        until,
        limit: BATCH_SIZE,
        relays: [relay]
      }).subscribe({
        next: ({ note }) => {
          noteById.set(note.id, note);
          events.push(note);
        },
        complete: () => {
          if (events.length === 0) {
            exhaustedRelays.add(relay);
          } else {
            const oldest = Math.min(...events.map((n) => n.createdAt));
            cursors.set(relay, oldest);
          }
          resolve();
        },
        error: () => {
          if (events.length === 0) {
            exhaustedRelays.add(relay);
          } else {
            const oldest = Math.min(...events.map((n) => n.createdAt));
            cursors.set(relay, oldest);
          }
          resolve();
        }
      });
      subs.push(sub);
    });
  }

  async function initialLoad(): Promise<void> {
    const byRelay = new Map<string, Note[]>();
    for (const relay of readRelays) byRelay.set(relay, []);

    await new Promise<void>((resolve) => {
      let pending = readRelays.length;
      if (pending === 0) {
        resolve();
        return;
      }

      for (const relay of readRelays) {
        const sub = fetchNotesFromAuthorsWithRelay(authors, {
          limit: BATCH_SIZE,
          relays: [relay]
        }).subscribe({
          next: ({ note, relay: from }) => {
            noteById.set(note.id, note);
            const normalized = normalizeRelay(from);
            if (!byRelay.has(normalized)) byRelay.set(normalized, []);
            byRelay.get(normalized)!.push(note);
          },
          complete: () => {
            if (--pending === 0) resolve();
          },
          error: () => {
            if (--pending === 0) resolve();
          }
        });
        subs.push(sub);
      }
    });

    for (const [relay, relayNotes] of byRelay) {
      if (relayNotes.length === 0) {
        exhaustedRelays.add(relay);
      } else {
        const oldest = Math.min(...relayNotes.map((n) => n.createdAt));
        cursors.set(relay, oldest);
      }
    }

    rebuildNotes();
    reachedEnd = activeRelays().length === 0;
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
    readRelays = relays.map(normalizeRelay);
    if (readRelays.length === 0) {
      readRelays = DEFAULT_RELAYS.map(normalizeRelay);
    }

    await initialLoad();
    initLoading = false;
  });

  onDestroy(() => {
    subs.forEach((s) => s.unsubscribe());
  });

  async function loadMore(): Promise<void> {
    if (loadMoreLoading || reachedEnd) return;
    loadMoreLoading = true;

    const displayedIds = new Set(notes.map((n) => n.id));
    const active = activeRelays();

    if (active.length === 0) {
      reachedEnd = true;
      loadMoreLoading = false;
      return;
    }

    await Promise.all(active.map((r) => fetchOne(r)));

    for (let iter = 0; iter < MAX_INNER_ITERATIONS; iter++) {
      const T = computeT();
      if (T === null) break;

      const candidates = collectCandidatesAtOrAbove(T, displayedIds);
      if (candidates.length >= BATCH_SIZE) break;

      const slowRelays = activeRelays().filter((r) => cursors.get(r) === T);
      if (slowRelays.length === 0) break;
      await Promise.all(slowRelays.map((r) => fetchOne(r)));
    }

    const finalT = computeT();
    let adopted: Note[];
    if (finalT === null) {
      adopted = [...noteById.values()]
        .filter((n) => !displayedIds.has(n.id))
        .sort((a, b) => b.createdAt - a.createdAt);
    } else {
      adopted = collectCandidatesAtOrAbove(finalT, displayedIds)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, BATCH_SIZE);
    }

    if (adopted.length > 0) {
      notes = [...notes, ...adopted];
    }

    const remainingUndisplayed = [...noteById.values()].filter(
      (n) => !new Set(notes.map((x) => x.id)).has(n.id)
    );
    reachedEnd = activeRelays().length === 0 && remainingUndisplayed.length === 0;
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
