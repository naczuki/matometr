<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Subscription } from 'rxjs';
  import { fetchMatomeListWithRelay, fetchNosliListWithRelay } from '$lib/services/NostrClient';
  import { Matome } from '$lib/entities/Matome';
  import MatomeCard from '$lib/components/MatomeCard.svelte';
  import Spinner from '$lib/components/Spinner.svelte';
  import type { Tab } from '$lib/types';
  import { DEFAULT_RELAYS } from '$lib/stores/relays';

  // rx-nostr の EventPacket.from はスラッシュなしで返るため正規化
  const RELAYS: string[] = DEFAULT_RELAYS.map((r) => r.replace(/\/$/, ''));

  export let tab: Tab;

  let loading = true;
  let loadingMore = false;
  let hasMore = true;
  let matomes: Matome[] = [];
  let subs: Subscription[] = [];

  const rawMap = new Map<string, Matome>();
  const nosliCursors = new Map<string, number>();
  const matometrCursors = new Map<string, number>();
  const exhaustedNosli = new Set<string>();
  const exhaustedMatometr = new Set<string>();

  // 30日以上のギャップがあれば ascending-relay の末尾と判断し、
  // ギャップ直前のイベントを cursor にする。
  // 例）nos.lol が 2023-12-17 → 2023-04-08（8ヶ月飛び）を返した場合、
  //     cursor = 2023-12-17 となり、次の until=2023-12-16 で正しく潜れる。
  const GAP_THRESHOLD_S = 30 * 24 * 3600;

  function computeCursorFromBuffer(timestamps: number[]): number | undefined {
    if (timestamps.length === 0) return undefined;
    const desc = [...timestamps].sort((a, b) => b - a);
    let maxGap = 0;
    let splitIdx = desc.length - 1;
    for (let i = 0; i < desc.length - 1; i++) {
      const gap = desc[i] - desc[i + 1];
      if (gap > maxGap) { maxGap = gap; splitIdx = i; }
    }
    return maxGap > GAP_THRESHOLD_S ? desc[splitIdx] : desc[desc.length - 1];
  }

  function addMatome(m: Matome): void {
    const key = `${m.pubkey}:${m.dTag}`;
    const existing = rawMap.get(key);
    if (!existing || m.createdAt > existing.createdAt) {
      rawMap.set(key, m);
      matomes = [...rawMap.values()].sort((a, b) => b.createdAt - a.createdAt);
    }
  }

  function computeHasMore(): boolean {
    return (
      RELAYS.some((r) => !exhaustedNosli.has(r)) ||
      RELAYS.some((r) => !exhaustedMatometr.has(r))
    );
  }

  onMount(() => {
    let pending = 2;
    const nosliBuffer = new Map<string, number[]>();
    const matometrBuffer = new Map<string, number[]>();

    function pushBuffer(relay: string, createdAt: number, buf: Map<string, number[]>): void {
      if (!buf.has(relay)) buf.set(relay, []);
      buf.get(relay)!.push(createdAt);
    }

    function done(): void {
      if (--pending > 0) return;
      for (const [relay, ts] of nosliBuffer) {
        const cursor = computeCursorFromBuffer(ts);
        if (cursor !== undefined) nosliCursors.set(relay, cursor);
      }
      for (const [relay, ts] of matometrBuffer) {
        const cursor = computeCursorFromBuffer(ts);
        if (cursor !== undefined) matometrCursors.set(relay, cursor);
      }
      for (const r of RELAYS) {
        if (!nosliCursors.has(r)) exhaustedNosli.add(r);
        if (!matometrCursors.has(r)) exhaustedMatometr.add(r);
      }
      loading = false;
      hasMore = computeHasMore();
    }

    const s1 = fetchMatomeListWithRelay(30).subscribe({
      next: ({ matome, relay }) => {
        addMatome(matome);
        pushBuffer(relay, matome.createdAt, matometrBuffer);
      },
      complete: done,
      error: done
    });

    const s2 = fetchNosliListWithRelay(30).subscribe({
      next: ({ matome, relay }) => {
        addMatome(matome);
        pushBuffer(relay, matome.createdAt, nosliBuffer);
      },
      complete: done,
      error: done
    });

    subs = [s1, s2];
  });

  function loadMore(): void {
    if (loadingMore || !hasMore) return;
    loadingMore = true;

    const activeNosli = RELAYS.filter((r) => !exhaustedNosli.has(r));
    const activeMatometr = RELAYS.filter((r) => !exhaustedMatometr.has(r));
    const total = activeNosli.length + activeMatometr.length;

    if (total === 0) {
      hasMore = false;
      loadingMore = false;
      return;
    }

    let completed = 0;
    const batchNosli = new Map<string, number>(activeNosli.map((r) => [r, 0]));
    const batchMatometr = new Map<string, number>(activeMatometr.map((r) => [r, 0]));

    function checkDone(): void {
      if (++completed < total) return;
      for (const [r, count] of batchNosli) {
        if (count === 0) exhaustedNosli.add(r);
      }
      for (const [r, count] of batchMatometr) {
        if (count === 0) exhaustedMatometr.add(r);
      }
      loadingMore = false;
      hasMore = computeHasMore();
    }

    for (const relay of activeNosli) {
      const cursor = nosliCursors.get(relay);
      const until = cursor !== undefined ? cursor - 1 : undefined;
      const buf: number[] = [];
      const sub = fetchNosliListWithRelay(30, until, [relay]).subscribe({
        next: ({ matome, relay: r }) => {
          addMatome(matome);
          buf.push(matome.createdAt);
          batchNosli.set(r, (batchNosli.get(r) ?? 0) + 1);
        },
        complete: () => {
          const cursor = computeCursorFromBuffer(buf);
          if (cursor !== undefined) nosliCursors.set(relay, cursor);
          checkDone();
        },
        error: checkDone
      });
      subs = [...subs, sub];
    }

    for (const relay of activeMatometr) {
      const cursor = matometrCursors.get(relay);
      const until = cursor !== undefined ? cursor - 1 : undefined;
      const buf: number[] = [];
      const sub = fetchMatomeListWithRelay(30, until, [relay]).subscribe({
        next: ({ matome, relay: r }) => {
          addMatome(matome);
          buf.push(matome.createdAt);
          batchMatometr.set(r, (batchMatometr.get(r) ?? 0) + 1);
        },
        complete: () => {
          const cursor = computeCursorFromBuffer(buf);
          if (cursor !== undefined) matometrCursors.set(relay, cursor);
          checkDone();
        },
        error: checkDone
      });
      subs = [...subs, sub];
    }
  }

  onDestroy(() => {
    subs.forEach((s) => s.unsubscribe());
  });

  $: items = tab === 'following' ? [] : matomes;
  $: showFollowingMsg = tab === 'following';
</script>

{#if loading}
  <div class="state-wrap">
    <Spinner />
    <div class="state-text">読み込み中…</div>
  </div>
{:else if showFollowingMsg}
  <div class="state-wrap">
    <div class="state-icon">👥</div>
    <div class="state-text">フォロー機能は準備中です</div>
  </div>
{:else if items.length === 0}
  <div class="state-wrap">
    <div class="state-icon">📋</div>
    <div class="state-text">まだまとめがありません</div>
  </div>
{:else}
  <div class="matome-grid">
    {#each items as matome (matome.id)}
      <MatomeCard {matome} />
    {/each}
  </div>
  {#if hasMore}
    <div class="load-more-wrap">
      <button class="btn-load-more" on:click={loadMore} disabled={loadingMore}>
        {loadingMore ? '読み込み中…' : 'もっと見る'}
      </button>
    </div>
  {/if}
{/if}

<style>
  .matome-grid {
    max-width: 720px;
    margin: 0 auto;
    padding: 16px 20px 48px;
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .state-wrap {
    max-width: 720px;
    margin: 48px auto;
    padding: 0 20px;
    text-align: center;
  }

  .state-icon {
    font-size: 40px;
    margin-bottom: 12px;
  }

  .state-text {
    font-size: 14px;
    color: var(--ink3);
    font-family: var(--font-ui);
  }

  .load-more-wrap {
    max-width: 720px;
    margin: 0 auto;
    padding: 0 20px 48px;
    display: flex;
    justify-content: center;
  }

  .btn-load-more {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 28px;
    border: 1.5px solid var(--border2);
    border-radius: var(--radius-btn);
    background: var(--surface);
    color: var(--ink2);
    font-size: 14px;
    font-weight: 600;
    font-family: var(--font-ui);
    cursor: pointer;
    transition: all 0.12s;
  }

  .btn-load-more:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-pale);
  }

  .btn-load-more:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
