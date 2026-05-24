<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Subscription } from 'rxjs';
  import { fetchMatomeListWithRelay, fetchNosliListWithRelay } from '$lib/services/NostrClient';
  import { Matome } from '$lib/entities/Matome';
  import MatomeCard from '$lib/components/MatomeCard.svelte';
  import Spinner from '$lib/components/Spinner.svelte';
  import type { Tab } from '$lib/types';
  import { DEFAULT_RELAYS } from '$lib/stores/relays';
  import { deletedMatomeIds } from '$lib/stores/deletedMatomes';

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
  const GAP_THRESHOLD_S = 30 * 24 * 3600;
  const BATCH_SIZE = 30;
  // もっと見るの内部ループ上限（暴走防止）
  const MAX_INNER_ITERATIONS = 10;

  type FeedType = 'nosli' | 'matometr';

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

  function addToRawMap(m: Matome): void {
    const key = `${m.pubkey}:${m.dTag}`;
    const existing = rawMap.get(key);
    if (!existing || m.createdAt > existing.createdAt) {
      rawMap.set(key, m);
    }
  }

  function computeHasMore(): boolean {
    return (
      RELAYS.some((r) => !exhaustedNosli.has(r)) ||
      RELAYS.some((r) => !exhaustedMatometr.has(r))
    );
  }

  // 0件受信 → exhausted
  // 採用ありリレー → 採用分の最古でcursor
  // 採用なしリレー → 取得全体でcursor（穴防止）
  function updateCursorsAndExhaustion(
    buckets: Map<string, Matome[]>,
    cursors: Map<string, number>,
    exhausted: Set<string>,
    adoptedKeys: Set<string>
  ): void {
    for (const [relay, ms] of buckets) {
      if (ms.length === 0) {
        exhausted.add(relay);
        continue;
      }
      const adoptedTs = ms
        .filter((m) => adoptedKeys.has(`${m.pubkey}:${m.dTag}`))
        .map((m) => m.createdAt);
      const cursorTs = adoptedTs.length > 0 ? adoptedTs : ms.map((m) => m.createdAt);
      const cursor = computeCursorFromBuffer(cursorTs);
      if (cursor !== undefined) cursors.set(relay, cursor);
    }
  }

  function initialLoad(): Promise<void> {
    subs.forEach((s) => s.unsubscribe());
    subs = [];
    rawMap.clear();
    nosliCursors.clear();
    matometrCursors.clear();
    exhaustedNosli.clear();
    exhaustedMatometr.clear();
    matomes = [];
    loadingMore = false;
    loading = true;
    hasMore = true;

    return new Promise<void>((resolve) => {
      let pending = 2;
      const nosliBuckets = new Map<string, Matome[]>();
      const matometrBuckets = new Map<string, Matome[]>();
      for (const r of RELAYS) {
        nosliBuckets.set(r, []);
        matometrBuckets.set(r, []);
      }

      function done(): void {
        if (--pending > 0) return;

        const candidateKeys = new Set<string>();
        for (const ms of nosliBuckets.values()) {
          for (const m of ms) candidateKeys.add(`${m.pubkey}:${m.dTag}`);
        }
        for (const ms of matometrBuckets.values()) {
          for (const m of ms) candidateKeys.add(`${m.pubkey}:${m.dTag}`);
        }

        const candidates: Matome[] = [];
        for (const k of candidateKeys) {
          const m = rawMap.get(k);
          if (m) candidates.push(m);
        }
        const sorted = candidates.sort((a, b) => b.createdAt - a.createdAt);
        const adopted = sorted.slice(0, BATCH_SIZE);
        const adoptedKeys = new Set(adopted.map((m) => `${m.pubkey}:${m.dTag}`));

        updateCursorsAndExhaustion(nosliBuckets, nosliCursors, exhaustedNosli, adoptedKeys);
        updateCursorsAndExhaustion(matometrBuckets, matometrCursors, exhaustedMatometr, adoptedKeys);

        matomes = adopted;
        loading = false;
        hasMore = computeHasMore();
        resolve();
      }

      const s1 = fetchMatomeListWithRelay(BATCH_SIZE).subscribe({
        next: ({ matome, relay }) => {
          addToRawMap(matome);
          if (!matometrBuckets.has(relay)) matometrBuckets.set(relay, []);
          matometrBuckets.get(relay)!.push(matome);
        },
        complete: done,
        error: done
      });

      const s2 = fetchNosliListWithRelay(BATCH_SIZE).subscribe({
        next: ({ matome, relay }) => {
          addToRawMap(matome);
          if (!nosliBuckets.has(relay)) nosliBuckets.set(relay, []);
          nosliBuckets.get(relay)!.push(matome);
        },
        complete: done,
        error: done
      });

      subs = [s1, s2];
    });
  }

  export async function refresh(): Promise<void> {
    return initialLoad();
  }

  onMount(() => {
    initialLoad();
  });

  function getCursor(type: FeedType, relay: string): number | undefined {
    return type === 'nosli' ? nosliCursors.get(relay) : matometrCursors.get(relay);
  }

  function setCursor(type: FeedType, relay: string, c: number): void {
    if (type === 'nosli') nosliCursors.set(relay, c);
    else matometrCursors.set(relay, c);
  }

  function isExhausted(type: FeedType, relay: string): boolean {
    return type === 'nosli' ? exhaustedNosli.has(relay) : exhaustedMatometr.has(relay);
  }

  function markExhausted(type: FeedType, relay: string): void {
    if (type === 'nosli') exhaustedNosli.add(relay);
    else exhaustedMatometr.add(relay);
  }

  function activeKeys(): { type: FeedType; relay: string }[] {
    const keys: { type: FeedType; relay: string }[] = [];
    for (const r of RELAYS) {
      if (!isExhausted('nosli', r)) keys.push({ type: 'nosli', relay: r });
      if (!isExhausted('matometr', r)) keys.push({ type: 'matometr', relay: r });
    }
    return keys;
  }

  // 1リレー×1タイプ分を取得し、cursor を更新 or 枯渇マークする
  function fetchOne(type: FeedType, relay: string): Promise<void> {
    const cursor = getCursor(type, relay);
    const until = cursor !== undefined ? cursor - 1 : undefined;
    const fetcher = type === 'nosli' ? fetchNosliListWithRelay : fetchMatomeListWithRelay;
    return new Promise((resolve) => {
      const events: Matome[] = [];
      const sub = fetcher(BATCH_SIZE, until, [relay]).subscribe({
        next: ({ matome }) => {
          addToRawMap(matome);
          events.push(matome);
        },
        complete: () => {
          if (events.length === 0) {
            markExhausted(type, relay);
          } else {
            const newCursor = computeCursorFromBuffer(events.map((e) => e.createdAt));
            if (newCursor !== undefined) setCursor(type, relay, newCursor);
          }
          resolve();
        },
        error: () => {
          if (events.length === 0) {
            markExhausted(type, relay);
          } else {
            const newCursor = computeCursorFromBuffer(events.map((e) => e.createdAt));
            if (newCursor !== undefined) setCursor(type, relay, newCursor);
          }
          resolve();
        }
      });
      subs.push(sub);
    });
  }

  // T = 生きてるリレーの cursor のうち最も新しい値（=全リレーが少なくともTまで取得済み）
  function computeT(): number | null {
    let max: number | null = null;
    for (const { type, relay } of activeKeys()) {
      const c = getCursor(type, relay);
      if (c === undefined) continue;
      if (max === null || c > max) max = c;
    }
    return max;
  }

  function collectCandidatesAtOrAbove(T: number, displayedKeys: Set<string>): Matome[] {
    const out: Matome[] = [];
    for (const m of rawMap.values()) {
      const k = `${m.pubkey}:${m.dTag}`;
      if (displayedKeys.has(k)) continue;
      if (m.createdAt >= T) out.push(m);
    }
    return out;
  }

  function collectAllCarryOver(displayedKeys: Set<string>): Matome[] {
    const out: Matome[] = [];
    for (const m of rawMap.values()) {
      const k = `${m.pubkey}:${m.dTag}`;
      if (!displayedKeys.has(k)) out.push(m);
    }
    return out;
  }

  async function loadMore(): Promise<void> {
    if (loadingMore || !hasMore) return;
    loadingMore = true;

    const displayedKeys = new Set(matomes.map((m) => `${m.pubkey}:${m.dTag}`));

    // Step 1: 生きてる全リレーを until=cursor-1 で 1 回ずつ潜らせる
    const initial = activeKeys();
    if (initial.length === 0) {
      loadingMore = false;
      hasMore = false;
      return;
    }
    await Promise.all(initial.map(({ type, relay }) => fetchOne(type, relay)));

    // 内部ループ: 採用候補が30件たまるまで、Tに張り付くリレー（足並みの遅い側）を潜らせる
    for (let iter = 0; iter < MAX_INNER_ITERATIONS; iter++) {
      const T = computeT();
      if (T === null) break; // 全リレー枯渇
      const candidates = collectCandidatesAtOrAbove(T, displayedKeys);
      if (candidates.length >= BATCH_SIZE) break;

      // cursor === T のリレー（=遅れている側）を潜らせて T を古い方へ進める
      const atT = activeKeys().filter(({ type, relay }) => getCursor(type, relay) === T);
      if (atT.length === 0) break;
      await Promise.all(atT.map(({ type, relay }) => fetchOne(type, relay)));
    }

    // 採用フェーズ
    const finalT = computeT();
    let adopted: Matome[];
    if (finalT === null) {
      // 全リレー枯渇 → 持ち越し全部を降順で吐き出す（穴防止）
      adopted = collectAllCarryOver(displayedKeys).sort((a, b) => b.createdAt - a.createdAt);
    } else {
      // T以降の未表示候補を降順で先頭30件
      adopted = collectCandidatesAtOrAbove(finalT, displayedKeys)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, BATCH_SIZE);
    }

    matomes = [...matomes, ...adopted];
    loadingMore = false;
    hasMore = computeHasMore();
  }

  onDestroy(() => {
    subs.forEach((s) => s.unsubscribe());
  });

  $: items = tab === 'following' ? [] : matomes.filter((m) => !$deletedMatomeIds.has(m.id));
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
