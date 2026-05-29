<script lang="ts">
  import { onDestroy } from 'svelte';
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import { nip19 } from 'nostr-tools';
  import type { Subscription } from 'rxjs';
  import { Matome } from '$lib/entities/Matome';
  import { fetchUserMatomes, fetchReactionCounts, fetchUserFavedMatomes } from '$lib/services/NostrClient';
  import { clearFavDeltas } from '$lib/stores/favs';
  import { profiles, requestProfile } from '$lib/stores/profiles';
  import { currentUser } from '$lib/stores/auth';
  import { shortNpub } from '$lib/utils/nostr';
  import MatomeCard from '$lib/components/MatomeCard.svelte';
  import Avatar from '$lib/components/Avatar.svelte';
  import Spinner from '$lib/components/Spinner.svelte';
  import QuotedNote from '$lib/components/QuotedNote.svelte';
  import { parseNostrRefs, extractImages } from '$lib/utils/nostrContent';

  export let npub: string;

  type UserTab = 'matomes' | 'reactions';
  let activeTab: UserTab = 'matomes';

  $: npubParam = npub;

  let pubkey = '';
  let error = '';
  let loading = true;
  let matomes: Matome[] = [];
  let sub: Subscription | null = null;

  let reactLoading = false;
  let reactLoaded = false;
  let reactMatomes: Matome[] = [];
  let reactSub: Subscription | null = null;
  let reactFavSub: Subscription | null = null;
  const reactRawMap = new Map<string, Matome>();

  const rawMap = new Map<string, Matome>();

  function addMatome(m: Matome): void {
    const key = `${m.pubkey}:${m.dTag}`;
    const existing = rawMap.get(key);
    if (!existing || m.createdAt > existing.createdAt) {
      rawMap.set(key, m);
    }
  }

  // npub が変わるたびに状態をリセットして再取得。
  // onMount は SvelteKit が同一コンポーネントを再利用する場合に再実行されないため
  // $: で npub プロップを監視する。
  let _initedNpub: string | null = null;
  function initForNpub(n: string): void {
    if (!browser) return;
    if (n === _initedNpub) return;
    _initedNpub = n;

    sub?.unsubscribe();
    sub = null;
    reactSub?.unsubscribe();
    reactSub = null;
    reactFavSub?.unsubscribe();
    reactFavSub = null;
    rawMap.clear();
    reactRawMap.clear();
    matomes = [];
    reactMatomes = [];
    reactLoaded = false;
    reactLoading = false;
    pubkey = '';
    error = '';
    loading = true;
    activeTab = 'matomes';
    npubMenuOpen = false;

    if (!n) { error = '無効なユーザーIDです'; loading = false; return; }
    try {
      const decoded = nip19.decode(n) as { type: string; data: unknown };
      if (decoded.type !== 'npub') {
        error = '無効なユーザーIDです';
        loading = false;
        return;
      }
      pubkey = decoded.data as string;
      requestProfile(pubkey);
      sub = fetchUserMatomes(pubkey).subscribe({
        next: addMatome,
        complete: () => {
          matomes = [...rawMap.values()].sort((a, b) => b.createdAt - a.createdAt);
          loading = false;
          applyReactionCounts();
        },
        error: () => { error = '取得に失敗しました'; loading = false; }
      });
    } catch {
      error = '無効なユーザーIDです';
      loading = false;
    }
  }

  $: initForNpub(npub);

  let favSub: Subscription | null = null;

  function applyReactionCounts(): void {
    const targets = [...rawMap.values()];
    if (targets.length === 0) return;
    favSub?.unsubscribe();
    favSub = fetchReactionCounts(targets).subscribe({
      next(counts) {
        const updatedKeys: string[] = [];
        let changed = false;
        for (const m of targets) {
          const key = `30023:${m.pubkey}:${m.dTag}`;
          const c = counts.get(key) ?? 0;
          if (m.favCount !== c) {
            m.favCount = c;
            changed = true;
          }
          updatedKeys.push(key);
        }
        clearFavDeltas(updatedKeys);
        if (changed) matomes = matomes;
      }
    });
  }

  function loadReactions(): void {
    if (reactLoaded || reactLoading || !pubkey) return;
    reactLoading = true;
    reactRawMap.clear();
    reactMatomes = [];
    reactSub?.unsubscribe();
    reactSub = fetchUserFavedMatomes(pubkey).subscribe({
      next(m) {
        const key = `${m.pubkey}:${m.dTag}`;
        const existing = reactRawMap.get(key);
        if (!existing || m.createdAt > existing.createdAt) {
          reactRawMap.set(key, m);
        }
      },
      complete() {
        reactMatomes = [...reactRawMap.values()].sort((a, b) => b.createdAt - a.createdAt);
        reactLoading = false;
        reactLoaded = true;
        applyReactTabFavCounts();
      },
      error() {
        reactLoading = false;
        reactLoaded = true;
      }
    });
  }

  function applyReactTabFavCounts(): void {
    const targets = [...reactRawMap.values()];
    if (targets.length === 0) return;
    reactFavSub?.unsubscribe();
    reactFavSub = fetchReactionCounts(targets).subscribe({
      next(counts) {
        const updatedKeys: string[] = [];
        let changed = false;
        for (const m of targets) {
          const key = `30023:${m.pubkey}:${m.dTag}`;
          const c = counts.get(key) ?? 0;
          if (m.favCount !== c) { m.favCount = c; changed = true; }
          updatedKeys.push(key);
        }
        clearFavDeltas(updatedKeys);
        if (changed) reactMatomes = reactMatomes;
      }
    });
  }

  function switchTab(tab: UserTab): void {
    activeTab = tab;
    if (tab === 'reactions') loadReactions();
  }

  onDestroy(() => {
    sub?.unsubscribe();
    favSub?.unsubscribe();
    reactSub?.unsubscribe();
    reactFavSub?.unsubscribe();
    removeNpubDocListener?.();
    if (toastTimer) clearTimeout(toastTimer);
  });

  $: profile = $profiles.get(pubkey);
  $: displayName = profile?.displayName ?? profile?.name ?? shortNpub(npubParam);
  $: picture = profile?.picture ?? null;
  $: isSelf = !!$currentUser && !!pubkey && pubkey === $currentUser.pubkey;

  $: profileEmojiMap = profile?.emojis
    ? new Map(Object.entries(profile.emojis))
    : new Map<string, string>();

  $: displayNameSegments = parseNostrRefs(displayName, profileEmojiMap);

  $: aboutContent = profile?.about ? extractImages(profile.about) : { text: '', urls: [] };
  $: aboutSegments = parseNostrRefs(aboutContent.text, profileEmojiMap);
  $: { for (const seg of aboutSegments) { if (seg.type === 'mention') requestProfile(seg.pubkey); } }

  let failedEmojis: Set<string> = new Set();
  function onEmojiError(shortcode: string): void {
    failedEmojis = new Set([...failedEmojis, shortcode]);
  }

  let npubMenuOpen = false;
  let npubMenuX = 0;
  let npubMenuY = 0;
  let copyToast = false;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let removeNpubDocListener: (() => void) | null = null;

  function openNpubMenu(e: MouseEvent): void {
    e.stopPropagation();
    const MENU_W = 175;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let x = rect.right - MENU_W;
    if (x < 8) x = 8;
    npubMenuX = x;
    npubMenuY = rect.bottom + 6;
    npubMenuOpen = true;
    const handler = (): void => { npubMenuOpen = false; removeNpubDocListener = null; };
    document.addEventListener('click', handler, { once: true });
    removeNpubDocListener = () => document.removeEventListener('click', handler);
  }

  async function copyNpub(): Promise<void> {
    if (!pubkey) return;
    npubMenuOpen = false;
    try {
      await navigator.clipboard.writeText(nip19.npubEncode(pubkey));
      copyToast = true;
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { copyToast = false; }, 2000);
    } catch { /* clipboard API 利用不可 */ }
  }

  function hideBioImg(e: Event): void {
    (e.currentTarget as HTMLImageElement).style.display = 'none';
  }


</script>

<svelte:head>
  <title>{displayName} のまとめ | まとめたー</title>
</svelte:head>

<div class="page">
  {#if error}
    <div class="state-wrap">
      <div class="state-icon">⚠️</div>
      <div class="state-text">{error}</div>
      <a href="{base}/" class="state-link">トップへ戻る</a>
    </div>
  {:else}
    {#if isSelf}
      <div class="page-action-bar">
        <a href="{base}/new" class="btn-create">＋ まとめを作る</a>
      </div>
    {/if}

    <!-- プロフィールヘッダー -->
    <div class="profile-header">
      <div class="profile-main">
        <Avatar {pubkey} {picture} name={displayName} size={72} />

      <div class="profile-info">
        <div class="profile-name">
          <span class="name-wrapper">
            {#each displayNameSegments as seg}
              {#if seg.type === 'text'}{seg.content}
              {:else if seg.type === 'emoji'}
                {#if failedEmojis.has(seg.shortcode)}:{seg.shortcode}:
                {:else}<img src={seg.url} alt=":{seg.shortcode}:" class="emoji-img" loading="lazy" on:error={() => onEmojiError(seg.shortcode)} />
                {/if}
              {/if}
            {/each}
            {#if pubkey}
              <a
                class="name-ext-link"
                href="https://nostter.app/{npubParam}"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="nostterで開く"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>
            {/if}
          </span>
        </div>
        {#if profile?.nip05}
          <div class="profile-nip05">{profile.nip05}</div>
        {/if}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="profile-npub" on:click={openNpubMenu}>
          {shortNpub(npubParam)}
          <svg class="npub-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
        {#if profile?.about}
          <div class="profile-bio">
            {#each aboutSegments as seg}
              {#if seg.type === 'text'}
                <span class="bio-text">{seg.content}</span>
              {:else if seg.type === 'mention'}
                {@const mp = $profiles.get(seg.pubkey)}
                <a class="bio-mention" href="{base}/user/?id={nip19.npubEncode(seg.pubkey)}">@{mp?.displayName ?? mp?.name ?? seg.pubkey.slice(0, 8) + '…'}</a>
              {:else if seg.type === 'quote'}
                <QuotedNote eventId={seg.eventId} />
              {:else if seg.type === 'url'}
                <a class="bio-url" href={seg.url} target="_blank" rel="noopener noreferrer">{seg.url}</a>
              {:else if seg.type === 'emoji'}
                {#if failedEmojis.has(seg.shortcode)}:{seg.shortcode}:
                {:else}<img src={seg.url} alt=":{seg.shortcode}:" class="emoji-img" loading="lazy" on:error={() => onEmojiError(seg.shortcode)} />
                {/if}
              {:else if seg.type === 'naddr'}
                <a class="bio-url" href="{base}/matome/?id={seg.naddr}">nostr:{seg.naddr.slice(0, 12)}…</a>
              {/if}
            {/each}
            {#if aboutContent.urls.length > 0}
              <div class="bio-images">
                {#each aboutContent.urls as url}
                  <img src={url} alt="" class="bio-img" loading="lazy" on:error={hideBioImg} />
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
      </div>
    </div>

    <!-- タブ -->
    <div class="tab-bar">
      <button
        class="tab-btn"
        class:active={activeTab === 'matomes'}
        on:click={() => switchTab('matomes')}
      >
        <svg class="doc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        まとめ
      </button>
      <button
        class="tab-btn"
        class:active={activeTab === 'reactions'}
        on:click={() => switchTab('reactions')}
      >
        <svg class="star-icon" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 17.75l-6.172 3.245 1.179-6.873-4.993-4.867 6.9-1.002L12 2.5l3.086 6.253 6.9 1.002-4.993 4.867 1.179 6.873z" />
        </svg>
        リアクション
      </button>
    </div>

    <!-- まとめタブ -->
    {#if activeTab === 'matomes'}
      {#if loading}
        <div class="state-wrap">
          <Spinner />
          <div class="state-text">読み込み中…</div>
        </div>
      {:else if matomes.length === 0}
        <div class="state-wrap">
          <div class="state-icon">📋</div>
          <div class="state-text">まだまとめがありません</div>
        </div>
      {:else}
        <div class="grid">
          {#each matomes as matome (matome.id)}
            <MatomeCard {matome} />
          {/each}
        </div>
      {/if}

    <!-- リアクションタブ -->
    {:else}
      {#if reactLoading}
        <div class="state-wrap">
          <Spinner />
          <div class="state-text">読み込み中…</div>
        </div>
      {:else if reactMatomes.length === 0}
        <div class="state-wrap">
          <div class="state-icon">☆</div>
          <div class="state-text">まだリアクションがありません</div>
        </div>
      {:else}
        <div class="grid">
          {#each reactMatomes as matome (matome.id)}
            <MatomeCard {matome} />
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
</div>

{#if npubMenuOpen && pubkey}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="npub-menu"
    style="left:{npubMenuX}px;top:{npubMenuY}px;"
    on:click|stopPropagation
  >
    <a
      class="npub-menu-item"
      href="https://nostter.app/{npubParam}"
      target="_blank"
      rel="noopener noreferrer"
    >nostterで開く</a>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="npub-menu-item" on:click={copyNpub}>npubをコピー</div>
  </div>
{/if}

{#if copyToast}
  <div class="copy-toast">コピーしました</div>
{/if}

<style>
  .page {
    max-width: 720px;
    margin: 0 auto;
    padding: 20px 20px 64px;
  }

  .page-action-bar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 16px;
  }

  /* プロフィールヘッダー */
  .profile-header {
    display: flex;
    flex-direction: column;
    padding: 0 0 24px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 24px;
  }

  .profile-main {
    display: flex;
    align-items: flex-start;
    gap: 16px;
  }

  .profile-info {
    flex: 1;
    min-width: 0;
  }

  .profile-name {
    font-family: var(--font-ui);
    font-size: 20px;
    font-weight: 800;
    color: var(--ink);
    margin-bottom: 2px;
    word-break: break-word;
  }

  .profile-nip05 {
    font-size: 13px;
    color: var(--accent);
    margin-bottom: 2px;
    word-break: break-all;
  }

  .name-wrapper {
    position: relative;
    display: inline-block;
    padding-right: 14px;
  }

  .name-ext-link {
    position: absolute;
    top: -2px;
    right: -14px;
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--ink3);
    border-radius: 4px;
    text-decoration: none;
    transition: background 0.1s, color 0.1s;
  }

  .name-ext-link:hover {
    background: var(--accent-mid);
    color: var(--accent-dark);
  }

  .profile-npub {
    font-size: 12px;
    color: var(--ink3);
    font-family: monospace;
    margin-bottom: 8px;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    cursor: pointer;
    border-radius: 6px;
    padding: 1px 4px;
    margin-left: -4px;
    transition: background 0.1s;
  }

  .profile-npub:hover {
    background: var(--accent-pale);
  }

  .npub-chevron {
    color: var(--note-chevron);
    flex-shrink: 0;
  }

  .npub-menu {
    position: fixed;
    z-index: 200;
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    min-width: 175px;
    overflow: hidden;
  }

  .npub-menu-item {
    display: block;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--ink2);
    font-family: var(--font-ui);
    cursor: pointer;
    text-decoration: none;
    transition: background 0.1s;
  }

  .npub-menu-item:hover {
    background: var(--accent-pale);
    color: var(--ink);
  }

  .copy-toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--ink);
    color: var(--bg);
    font-size: 13px;
    font-family: var(--font-ui);
    padding: 8px 16px;
    border-radius: 20px;
    z-index: 300;
    pointer-events: none;
  }

  .profile-bio {
    font-size: 14px;
    color: var(--ink2);
    line-height: 1.65;
    margin: 0;
    word-break: break-word;
  }

  .bio-text {
    white-space: pre-wrap;
  }

  .emoji-img {
    height: 1.2em;
    width: auto;
    vertical-align: middle;
    display: inline;
  }

  .bio-mention,
  .bio-url {
    color: var(--accent);
    text-decoration: none;
    word-break: break-all;
  }

  .bio-mention:hover,
  .bio-url:hover {
    text-decoration: underline;
  }

  .bio-images {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 8px;
    margin-top: 8px;
  }

  .bio-img {
    width: 100%;
    max-height: 300px;
    object-fit: contain;
    border-radius: 10px;
    background: var(--bg);
    display: block;
  }

  .btn-create {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-btn);
    padding: 8px 20px;
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    text-decoration: none;
    transition: background 0.12s;
    white-space: nowrap;
  }

  .btn-create:hover {
    background: var(--accent-dark);
  }

  /* タブ */
  .tab-bar {
    display: flex;
    gap: 0;
    border-bottom: 1.5px solid var(--border);
    margin-bottom: 20px;
  }

  .tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 18px;
    font-size: 16px;
    font-weight: 700;
    font-family: var(--font-ui);
    color: var(--ink3);
    background: none;
    border: none;
    border-bottom: 2.5px solid transparent;
    margin-bottom: -1.5px;
    cursor: pointer;
    transition: color 0.12s, border-color 0.12s;
  }

  .tab-btn:hover {
    color: var(--ink2);
  }

  .tab-btn.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  .doc-icon {
    width: 15px;
    height: 15px;
    margin-bottom: -1px;
  }

  .star-icon {
    width: 16px;
    height: 16px;
    margin-right: -2px;
  }

  /* まとめグリッド */
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }

  /* 空状態・エラー */
  .state-wrap {
    margin: 48px auto;
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

  .state-link {
    display: inline-block;
    margin-top: 16px;
    color: var(--accent);
    font-size: 14px;
    font-weight: 700;
    text-decoration: none;
  }

  @media (max-width: 640px) {
    .profile-header {
      gap: 12px;
    }

    .profile-main :global(.avatar) {
      width: 56px !important;
      height: 56px !important;
      font-size: 22px !important;
    }

    .profile-name {
      font-size: 17px;
    }
  }
</style>
