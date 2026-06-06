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
  import { WatermarkPager } from '$lib/utils/watermarkPager';

  export let selectedIds: Set<string>;
  export let onToggle: (eventId: string, nevent: string) => void;
  export let matomePostPubkeys: Map<string, string> = new Map();

  let initLoading = true;
  let loadMoreLoading = false;
  let initError = '';
  let readRelays: string[] = [];
  let reachedEnd = false;
  let subs: Subscription[] = [];

  const reactedAtMap = new Map<string, number>();
  const noteById = new Map<string, Note>();

  const BATCH_SIZE = 30;
  const MAX_INNER_ITERATIONS = 10;
  const pager = new WatermarkPager({
    batchSize: BATCH_SIZE,
    maxInnerIterations: MAX_INNER_ITERATIONS
  });

  let displayNotes: Note[] = [];

  function normalizeRelay(r: string): string {
    return r.replace(/\/$/, '');
  }

  function activeRelays(): string[] {
    return pager.activeKeys(readRelays);
  }

  type Reaction = { eventId: string; reactedAt: number };

  function collectCandidatesAtOrAbove(T: number, displayedIds: Set<string>): Reaction[] {
    const out: Reaction[] = [];
    for (const [eventId, reactedAt] of reactedAtMap) {
      if (displayedIds.has(eventId)) continue;
      if (reactedAt >= T) out.push({ eventId, reactedAt });
    }
    return out;
  }

  function fetchOneRelay(pubkey: string, relay: string): Promise<Reaction[]> {
    const prev = pager.getCursor(relay);
    const until = pager.untilFor(relay);
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
          pager.finalize(
            relay,
            prev,
            reactions.map((r) => r.reactedAt)
          );
          resolve(reactions);
        },
        error: () => {
          pager.finalize(
            relay,
            prev,
            reactions.map((r) => r.reactedAt)
          );
          resolve(reactions);
        }
      });
      subs.push(sub);
    });
  }

  // 表示候補に絞った ID だけを取得する（リレー負荷を抑えるため、reactedAtMap 全体は取らない）。
  async function fetchNotesForNewIds(ids: string[]): Promise<void> {
    const idsToFetch = ids.filter((id) => !noteById.has(id));
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

    await Promise.all(readRelays.map((relay) => fetchOneRelay(user.pubkey, relay)));

    const T = pager.computeT(readRelays);
    if (T !== null) {
      const candidates = collectCandidatesAtOrAbove(T, new Set())
        .sort((a, b) => b.reactedAt - a.reactedAt)
        .slice(0, BATCH_SIZE);
      await fetchNotesForNewIds(candidates.map((c) => c.eventId));
      displayNotes = candidates
        .map((c) => noteById.get(c.eventId))
        .filter((n): n is Note => n !== undefined);
    } else {
      // T === null はどのリレーもリアクションを返さなかった場合 = reactedAtMap は空。
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

    readRelays = (await collectObservable<string[]>(fetchUserReadRelays(user.pubkey), [])).map(
      normalizeRelay
    );
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
    const { fetchedAny } = await pager.loadPage(
      readRelays,
      (relay) => fetchOneRelay(user.pubkey, relay).then(() => undefined),
      (T) => collectCandidatesAtOrAbove(T, displayedIds).length
    );

    if (!fetchedAny) {
      reachedEnd = true;
      loadMoreLoading = false;
      return;
    }

    const finalT = pager.computeT(readRelays);
    let candidates: Reaction[];
    if (finalT === null) {
      candidates = [...reactedAtMap.entries()]
        .filter(([id]) => !displayedIds.has(id))
        .map(([eventId, reactedAt]) => ({ eventId, reactedAt }))
        .sort((a, b) => b.reactedAt - a.reactedAt);
    } else {
      candidates = collectCandidatesAtOrAbove(finalT, displayedIds)
        .sort((a, b) => b.reactedAt - a.reactedAt)
        .slice(0, BATCH_SIZE);
    }

    // 採用が確定した候補 ID の note だけを取得する。
    await fetchNotesForNewIds(candidates.map((c) => c.eventId));

    const adopted = candidates
      .map((c) => noteById.get(c.eventId))
      .filter((n): n is Note => n !== undefined);

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
    <NotePreview
      {note}
      selected={selectedIds.has(note.id)}
      onClick={handleClick}
      {matomePostPubkeys}
    />
  {/each}
</FeedList>
