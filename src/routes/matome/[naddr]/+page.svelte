<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { nip19 } from 'nostr-tools';
  import type { AddressPointer } from 'nostr-tools/nip19';
  import { Matome } from '$lib/entities/Matome';
  import type { MatomeBlock } from '$lib/entities/Matome';
  import { fetchMatomeByAddress } from '$lib/services/NostrClient';
  import { profiles, requestProfile } from '$lib/stores/profiles';
  import { avatarStyle } from '$lib/utils/avatar';
  import NoteCard from '$lib/components/NoteCard.svelte';

  $: naddr = $page.params.naddr;

  let matome: Matome | null = null;
  let loading = true;
  let error = '';

  onMount(() => {
    try {
      const naddrParam = $page.params.naddr;
      if (!naddrParam) {
        error = '無効なアドレスです';
        loading = false;
        return;
      }
      const decoded = nip19.decode(naddrParam) as { type: string; data: unknown };
      if (decoded.type !== 'naddr') {
        error = '無効なアドレスです';
        loading = false;
        return;
      }
      const pointer = decoded.data as AddressPointer;
      requestProfile(pointer.pubkey);

      const sub = fetchMatomeByAddress(pointer).subscribe({
        next: (m) => { matome = m; },
        complete: () => { loading = false; },
        error: () => { error = '取得に失敗しました'; loading = false; }
      });
      return () => sub.unsubscribe();
    } catch {
      error = '無効なアドレスです';
      loading = false;
    }
  });

  $: profile = $profiles.get(matome?.pubkey ?? '');
  $: authorName = profile?.displayName ?? profile?.name ?? shortNpub(matome?.pubkey ?? '');
  $: authorPicture = profile?.picture ?? null;
  $: authorStyle = matome ? avatarStyle(matome.pubkey) : { bg: '#e5e5e5', fg: '#737373', initial: '?' };

  let authorImgFailed = false;
  $: authorPicture, (authorImgFailed = false);

  type RenderBlock =
    | { type: 'note'; nevent: string; comment: string | null; num: number }
    | { type: 'heading'; content: string }
    | { type: 'paragraph'; content: string }
    | { type: 'comment'; content: string };

  function buildRenderPlan(blocks: MatomeBlock[]): RenderBlock[] {
    const plan: RenderBlock[] = [];
    let noteNum = 0;
    let i = 0;
    while (i < blocks.length) {
      const b = blocks[i];
      if (b.type === 'nevent') {
        noteNum++;
        const next = blocks[i + 1];
        const comment = next?.type === 'comment' ? next.content : null;
        plan.push({ type: 'note', nevent: b.content, comment, num: noteNum });
        i += comment !== null ? 2 : 1;
      } else {
        plan.push({ type: b.type, content: b.content } as RenderBlock);
        i++;
      }
    }
    return plan;
  }

  $: renderPlan = matome ? buildRenderPlan(matome.blocks) : [];

  function shortNpub(pubkey: string): string {
    if (!pubkey) return '…';
    try {
      const npub = nip19.npubEncode(pubkey);
      return npub.slice(0, 8) + '…' + npub.slice(-4);
    } catch {
      return pubkey.slice(0, 8) + '…';
    }
  }

  function formatDate(unixSeconds: number): string {
    const d = new Date(unixSeconds * 1000);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  let copiedUrl = false;
  let copiedNaddr = false;

  async function copyUrl(): Promise<void> {
    await navigator.clipboard.writeText(window.location.href);
    copiedUrl = true;
    setTimeout(() => { copiedUrl = false; }, 1500);
  }

  async function copyNaddr(): Promise<void> {
    if (!matome) return;
    await navigator.clipboard.writeText(matome.naddr);
    copiedNaddr = true;
    setTimeout(() => { copiedNaddr = false; }, 1500);
  }

  function shareX(): void {
    if (!matome) return;
    const text = encodeURIComponent(`${matome.title} ${window.location.href}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank', 'noopener');
  }

  function shareNostter(): void {
    if (!matome) return;
    window.open(`https://nostter.app/${matome.naddr}`, '_blank', 'noopener');
  }
</script>

<svelte:head>
  <title>{matome?.title ?? 'まとめ詳細'} | まとめたー</title>
  {#if matome?.summary}
    <meta name="description" content={matome.summary} />
  {/if}
</svelte:head>

<div class="wrap">
  <a href="{base}/" class="back-btn">← まとめ一覧にもどる</a>

  {#if loading}
    <div class="state">
      <div class="state-icon">⏳</div>
      <div class="state-text">読み込み中…</div>
    </div>
  {:else if error}
    <div class="state">
      <div class="state-icon">⚠️</div>
      <div class="state-text">{error}</div>
    </div>
  {:else if !matome}
    <div class="state">
      <div class="state-icon">🔍</div>
      <div class="state-text">まとめが見つかりませんでした</div>
    </div>
  {:else}
    <div class="detail-header">
      <div class="detail-title">{matome.title}</div>

      {#if matome.summary}
        <div class="detail-desc">{matome.summary}</div>
      {/if}

      <div class="detail-meta">
        <div class="detail-avatar" style="background:{authorStyle.bg};color:{authorStyle.fg};">
          {#if authorPicture && !authorImgFailed}
            <img src={authorPicture} alt="" on:error={() => (authorImgFailed = true)} />
          {:else}
            {authorStyle.initial}
          {/if}
        </div>
        <div>
          <div class="detail-author-name">{authorName}</div>
          <div class="detail-author-pub">{shortNpub(matome.pubkey)}</div>
        </div>
        <span class="detail-date">{formatDate(matome.publishedAt)}</span>
      </div>

      <div class="detail-stats">
        <div class="stat-item"><b>{matome.postCount}</b>件の投稿</div>
        <div class="stat-share-row">
          <button class="share-btn nostter" title="nostterで開く" aria-label="nostterで開く" on:click={shareNostter}>
            <svg width="16" height="16" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#7c3aed"/><text x="16" y="22" text-anchor="middle" fill="white" font-size="20" font-weight="bold" font-family="serif">N</text></svg>
          </button>
          <button class="share-btn x" title="Xでシェア" aria-label="Xでシェア" on:click={shareX}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          </button>
          <button class="share-btn copy" title="URLをコピー" aria-label="URLをコピー" on:click={copyUrl}>
            {#if copiedUrl}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            {:else}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            {/if}
          </button>
          <button class="share-btn nevent-btn" title="naddr をコピー" aria-label="naddr をコピー" on:click={copyNaddr}>
            {#if copiedNaddr}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            {:else}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            {/if}
          </button>
        </div>
      </div>
    </div>

    {#each renderPlan as block}
      {#if block.type === 'heading'}
        <div class="block-heading">{block.content}</div>
      {:else if block.type === 'note'}
        <NoteCard nevent={block.nevent} comment={block.comment} num={block.num} total={matome.postCount} />
      {:else if block.type === 'comment'}
        <div class="block-comment">{block.content}</div>
      {:else if block.type === 'paragraph'}
        <p class="block-paragraph">{block.content}</p>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .wrap {
    max-width: 720px;
    margin: 0 auto;
    padding: 24px 20px 64px;
  }

  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 700;
    color: var(--accent);
    background: var(--surface);
    border: 1.5px solid var(--accent-mid);
    border-radius: var(--radius-btn);
    padding: 7px 16px;
    cursor: pointer;
    margin-bottom: 20px;
    font-family: var(--font-ui);
    text-decoration: none;
    transition: background 0.12s;
  }

  .back-btn:hover {
    background: var(--accent-pale);
  }

  .state {
    text-align: center;
    padding: 48px 0;
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

  /* ===== 詳細ヘッダー ===== */
  .detail-header {
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: var(--radius-card);
    padding: 22px 24px;
    margin-bottom: 20px;
  }

  .detail-title {
    font-family: var(--font-ui);
    font-size: 20px;
    font-weight: 800;
    color: var(--ink);
    line-height: 1.4;
    margin-bottom: 14px;
  }

  .detail-desc {
    font-size: 14px;
    color: var(--ink2);
    line-height: 1.85;
    margin-bottom: 18px;
    padding: 14px 16px;
    background: var(--accent-pale);
    border-radius: 10px;
    border-left: 3px solid var(--accent);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .detail-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .detail-avatar {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-ui);
    font-size: 14px;
    font-weight: 700;
    flex-shrink: 0;
    overflow: hidden;
  }

  .detail-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }

  .detail-author-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--ink);
  }

  .detail-author-pub {
    font-size: 11px;
    color: var(--ink3);
    font-family: monospace;
  }

  .detail-date {
    font-size: 12px;
    color: var(--ink3);
    margin-left: auto;
  }

  .detail-stats {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--border);
    flex-wrap: wrap;
  }

  .stat-item {
    font-size: 12px;
    color: var(--ink3);
    font-family: var(--font-ui);
  }

  .stat-item b {
    color: var(--ink);
    font-size: 14px;
    margin-right: 3px;
  }

  .stat-share-row {
    display: flex;
    gap: 6px;
    margin-left: auto;
  }

  .share-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    cursor: pointer;
    border: 1.5px solid var(--border2);
    background: var(--surface);
    color: var(--ink2);
    transition: all 0.12s;
  }

  .share-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.1);
  }

  .share-btn.nostter {
    border-color: #ddd6fe;
    background: #f5f3ff;
    color: #7c3aed;
  }

  .share-btn.x {
    border-color: #d1d5db;
    color: var(--ink);
  }

  .share-btn.copy {
    border-color: var(--accent-mid);
    background: var(--accent-pale);
    color: var(--accent-dark);
  }

  .share-btn.nevent-btn {
    border-color: #fde68a;
    background: #fffbeb;
    color: #92400e;
  }

  /* ===== ブロック ===== */
  .block-heading {
    font-family: var(--font-ui);
    font-size: 16px;
    font-weight: 800;
    color: var(--ink);
    padding: 10px 0 10px 14px;
    border-left: 4px solid var(--accent);
    margin: 20px 0 12px;
  }

  .block-comment {
    padding: 12px 16px;
    background: var(--accent-pale);
    border-radius: 10px;
    border: 1.5px solid var(--accent-mid);
    font-size: 13px;
    color: var(--ink2);
    line-height: 1.7;
    margin-bottom: 12px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .block-paragraph {
    font-size: 14px;
    color: var(--ink2);
    line-height: 1.85;
    margin-bottom: 12px;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
