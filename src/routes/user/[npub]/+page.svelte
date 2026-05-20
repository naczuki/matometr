<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { nip19 } from 'nostr-tools';
  import type { Subscription } from 'rxjs';
  import { Matome } from '$lib/entities/Matome';
  import { fetchUserMatomes } from '$lib/services/NostrClient';
  import { profiles, requestProfile } from '$lib/stores/profiles';
  import { currentUser } from '$lib/stores/auth';
  import { avatarStyle } from '$lib/utils/avatar';
  import MatomeCard from '$lib/components/MatomeCard.svelte';
  import Spinner from '$lib/components/Spinner.svelte';
  import QuotedNote from '$lib/components/QuotedNote.svelte';
  import { parseNostrRefs, extractImages } from '$lib/utils/nostrContent';

  $: npubParam = $page.params.npub;

  let pubkey = '';
  let error = '';
  let loading = true;
  let matomes: Matome[] = [];
  let sub: Subscription | null = null;

  const rawMap = new Map<string, Matome>();

  function addMatome(m: Matome): void {
    const key = `${m.pubkey}:${m.dTag}`;
    const existing = rawMap.get(key);
    if (!existing || m.createdAt > existing.createdAt) {
      rawMap.set(key, m);
      matomes = [...rawMap.values()].sort((a, b) => b.createdAt - a.createdAt);
    }
  }

  onMount(() => {
    try {
      if (!npubParam) { error = '無効なユーザーIDです'; loading = false; return; }
      const decoded = nip19.decode(npubParam) as { type: string; data: unknown };
      if (decoded.type !== 'npub') {
        error = '無効なユーザーIDです';
        loading = false;
        return;
      }
      pubkey = decoded.data as string;
      requestProfile(pubkey);
      sub = fetchUserMatomes(pubkey).subscribe({
        next: addMatome,
        complete: () => { loading = false; },
        error: () => { error = '取得に失敗しました'; loading = false; }
      });
    } catch {
      error = '無効なユーザーIDです';
      loading = false;
    }
    return () => sub?.unsubscribe();
  });

  onDestroy(() => sub?.unsubscribe());

  $: profile = $profiles.get(pubkey);
  $: displayName = profile?.displayName ?? profile?.name ?? shortNpub(npubParam);
  $: picture = profile?.picture ?? null;
  $: style = pubkey ? avatarStyle(pubkey) : { bg: '#e5e5e5', fg: '#737373', initial: '?' };
  $: isSelf = !!$currentUser && !!pubkey && pubkey === $currentUser.pubkey;

  $: aboutContent = profile?.about ? extractImages(profile.about) : { text: '', urls: [] };
  $: aboutSegments = parseNostrRefs(aboutContent.text);
  $: { for (const seg of aboutSegments) { if (seg.type === 'mention') requestProfile(seg.pubkey); } }

  let imgFailed = false;
  $: picture, (imgFailed = false);

  function hideBioImg(e: Event): void {
    (e.currentTarget as HTMLImageElement).style.display = 'none';
  }

  function shortNpub(npub: string | undefined): string {
    if (!npub || npub.length < 12) return npub ?? '…';
    return npub.slice(0, 8) + '…' + npub.slice(-4);
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
    <!-- プロフィールヘッダー -->
    <div class="profile-header">
      <div class="avatar" style="background:{style.bg};color:{style.fg};">
        {#if picture && !imgFailed}
          <img src={picture} alt="" on:error={() => (imgFailed = true)} />
        {:else}
          {style.initial}
        {/if}
      </div>

      <div class="profile-info">
        <div class="profile-name">{displayName}</div>
        {#if profile?.nip05}
          <div class="profile-nip05">{profile.nip05}</div>
        {/if}
        <div class="profile-npub">{shortNpub(npubParam)}</div>
        {#if profile?.about}
          <div class="profile-bio">
            {#each aboutSegments as seg}
              {#if seg.type === 'text'}
                <span class="bio-text">{seg.content}</span>
              {:else if seg.type === 'mention'}
                {@const mp = $profiles.get(seg.pubkey)}
                <a class="bio-mention" href="{base}/user/{nip19.npubEncode(seg.pubkey)}">@{mp?.displayName ?? mp?.name ?? seg.pubkey.slice(0, 8) + '…'}</a>
              {:else if seg.type === 'quote'}
                <QuotedNote eventId={seg.eventId} />
              {:else if seg.type === 'url'}
                <a class="bio-url" href={seg.url} target="_blank" rel="noopener noreferrer">{seg.url}</a>
              {:else if seg.type === 'naddr'}
                <a class="bio-url" href="https://njump.me/{seg.naddr}" target="_blank" rel="noopener noreferrer">nostr:{seg.naddr.slice(0, 12)}…</a>
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

      {#if isSelf}
        <a href="{base}/new" class="btn-create">＋ まとめを作る</a>
      {/if}
    </div>

    <!-- まとめ一覧 -->
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
  {/if}
</div>

<style>
  .page {
    max-width: 720px;
    margin: 0 auto;
    padding: 24px 20px 64px;
  }

  /* プロフィールヘッダー */
  .profile-header {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 20px 0 24px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 24px;
    flex-wrap: wrap;
  }

  .avatar {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    font-weight: 700;
    font-family: var(--font-ui);
    flex-shrink: 0;
    overflow: hidden;
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
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

  .profile-npub {
    font-size: 12px;
    color: var(--ink3);
    font-family: monospace;
    margin-bottom: 8px;
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
    display: inline-flex;
    align-items: center;
    padding: 9px 18px;
    border-radius: var(--radius-btn);
    background: var(--accent);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    font-family: var(--font-ui);
    text-decoration: none;
    flex-shrink: 0;
    transition: background 0.12s;
    align-self: flex-start;
  }

  .btn-create:hover {
    background: var(--accent-dark);
  }

  /* まとめグリッド */
  .grid {
    display: grid;
    grid-template-columns: 1fr;
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

    .avatar {
      width: 56px;
      height: 56px;
      font-size: 22px;
    }

    .profile-name {
      font-size: 17px;
    }
  }
</style>
