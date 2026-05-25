<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Subscription } from 'rxjs';
  import type { Note } from '$lib/types';
  import {
    fetchFavoriteReactionsWithRelay,
    fetchUserReadRelays,
    fetchNotesByIds
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
  let readRelays: string[] = [];
  let reachedEnd = false;
  let subs: Subscription[] = [];

  const reactedAtMap = new Map<string, number>();
  const noteById = new Map<string, Note>();
  const cursors = new Map<string, number>();
  const exhaustedRelays = new Set<string>();

  const BATCH_SIZE = 30;
  const MAX_INNER_ITERATIONS = 10;

  let displayNotes: Note[] = [];

  function normalizeRelay(r: string): string {
    return r.replace(/\/$/, '');
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

  type Reaction = { eventId: string; reactedAt: number };

  function collectCandidatesAtOrAbove(
    T: number,
    displayedIds: Set<string>
  ): Reaction[] {
    const out: Reaction[] = [];
    for (const [eventId, reactedAt] of reactedAtMap) {
      if (displayedIds.has(eventId)) continue;
      if (reactedAt >= T) out.push({ eventId, reactedAt });
    }
    return out;
  }

  function fetchOneRelay(
    pubkey: string,
    relay: string
  ): Promise<Reaction[]> {
    const cursor = cursors.get(relay);
    const until = cursor !== undefined ? cursor - 1 : undefined;
    return new Promise((resolve) => {
      const reactions: Reaction[] = [];
      const sub = fetchFavoriteReactionsWithRelay(pubkey, {
        until,
        limit: BATCH_SIZE,
        relays: [relay]
      }).subscribe({
        next: ({ eventId, reactedAt }) => {
          reactions.push({ eventId, reactedAt });
          const cur = reactedAtMap.get(eventId);
          if (cur == null || reactedAt > cur) reactedAtMap.set(eventId, reactedAt);
        },
        complete: () => {
          if (reactions.length === 0) {
            exhaustedRelays.add(relay);
          } else {
            const oldest = Math.min(...reactions.map((r) => r.reactedAt));
            cursors.set(relay, oldest);
          }
          resolve(reactions);
        },
        error: () => {
          if (reactions.length === 0) {
            exhaustedRelays.add(relay);
          }
          resolve(reactions);
        }
      });
      subs.push(sub);
    });
  }

  async function fetchNotesForNewIds(): Promise<void> {
    const idsToFetch = [...reactedAtMap.keys()].filter((id) => !noteById.has(id));
    if (idsToFetch.length === 0) return;

    await new Promise<void>((resolve) => {
      const sub = fetchNotesByIds(idsToFetch, { relays: readRelays }).subscribe({
        next: (n) => {
          noteById.set(n.id, n);
        },
        complete: () => resolve(),
        error: () => resolve()
      });
      subs.push(sub);
    });
  }

  function rebuildDisplay(): void {
    displayNotes = [...noteById.values()].sort((a, b) => {
      const ra = reactedAtMap.get(a.id) ?? 0;
      const rb = reactedAtMap.get(b.id) ?? 0;
      return rb - ra;
    });
  }

  async function initialLoad(): Promise<void> {
    const user = $currentUser;
    if (!user) return;

    await Promise.all(
      readRelays.map((relay) => fetchOneRelay(user.pubkey, relay))
    );

    const T = computeT();
    if (T !== null) {
      const candidates = collectCandidatesAtOrAbove(T, new Set())
        .sort((a, b) => b.reactedAt - a.reactedAt)
        .slice(0, BATCH_SIZE);
      const candidateIds = new Set(candidates.map((c) => c.eventId));
      const trimmed = new Map<string, number>();
      for (const [id, at] of reactedAtMap) {
        if (candidateIds.has(id)) trimmed.set(id, at);
      }
      await fetchNotesForNewIds();
      displayNotes = candidates
        .map((c) => noteById.get(c.eventId))
        .filter((n): n is Note => n !== undefined);
    } else {
      await fetchNotesForNewIds();
      rebuildDisplay();
    }

    reachedEnd = activeRelays().length === 0;
  }

  onMount(async () => {
    const user = $currentUser;
    if (!user) {
      initError = 'ログインが必要です';
      initLoading = false;
      return;
    }

    readRelays = (
      await collectObservable<string[]>(fetchUserReadRelays(user.pubkey), [])
    ).map(normalizeRelay);
    if (readRelays.length === 0) {
      readRelays = DEFAULT_RELAYS.map(normalizeRelay);
    }

    await initialLoad();
    if (displayNotes.length === 0 && activeRelays().length === 0) {
      reachedEnd = true;
    }
    initLoading = false;
  });

  onDestroy(() => {
    subs.forEach((s) => s.unsubscribe());
  });

  async function loadMore(): Promise<void> {
    if (loadMoreLoading || reachedEnd) return;
    loadMoreLoading = true;

    const user = $currentUser;
    if (!user) {
      loadMoreLoading = false;
      return;
    }

    const displayedIds = new Set(displayNotes.map((n) => n.id));
    const active = activeRelays();

    if (active.length === 0) {
      reachedEnd = true;
      loadMoreLoading = false;
      return;
    }

    await Promise.all(active.map((r) => fetchOneRelay(user.pubkey, r)));

    for (let iter = 0; iter < MAX_INNER_ITERATIONS; iter++) {
      const T = computeT();
      if (T === null) break;

      const candidates = collectCandidatesAtOrAbove(T, displayedIds);
      if (candidates.length >= BATCH_SIZE) break;

      const slowRelays = activeRelays().filter((r) => cursors.get(r) === T);
      if (slowRelays.length === 0) break;
      await Promise.all(slowRelays.map((r) => fetchOneRelay(user.pubkey, r)));
    }

    await fetchNotesForNewIds();

    const finalT = computeT();
    let adopted: Note[];
    if (finalT === null) {
      adopted = [...noteById.values()]
        .filter((n) => !displayedIds.has(n.id))
        .sort((a, b) => {
          const ra = reactedAtMap.get(a.id) ?? 0;
          const rb = reactedAtMap.get(b.id) ?? 0;
          return rb - ra;
        });
    } else {
      const candidates = collectCandidatesAtOrAbove(finalT, displayedIds)
        .sort((a, b) => b.reactedAt - a.reactedAt)
        .slice(0, BATCH_SIZE);
      adopted = candidates
        .map((c) => noteById.get(c.eventId))
        .filter((n): n is Note => n !== undefined);
    }

    if (adopted.length > 0) {
      displayNotes = [...displayNotes, ...adopted].sort((a, b) => {
        const ra = reactedAtMap.get(a.id) ?? 0;
        const rb = reactedAtMap.get(b.id) ?? 0;
        return rb - ra;
      });
    }

    const displayedSet = new Set(displayNotes.map((x) => x.id));
    const hasUndisplayed = [...reactedAtMap.keys()].some(
      (id) => !displayedSet.has(id) && noteById.has(id)
    );
    reachedEnd = activeRelays().length === 0 && !hasUndisplayed;
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
  empty={displayNotes.length === 0}
  {reachedEnd}
  emptyMessage="お気に入りの投稿が見つかりません"
  onLoadMore={loadMore}
>
  {#each displayNotes as note (note.id)}
    <NotePreview {note} selected={selectedIds.has(note.id)} onClick={handleClick} />
  {/each}
</FeedList>
