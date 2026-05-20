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
  let currentUrl = '';

  onMount(() => {
    currentUrl = window.location.href;
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

  // share actions
  let copiedUrl = false;
  async function copyUrl(): Promise<void> {
    await navigator.clipboard.writeText(currentUrl);
    copiedUrl = true;
    setTimeout(() => { copiedUrl = false; }, 1500);
  }

  function shareNos(): void {
    if (!matome) return;
    window.open(`https://njump.me/${matome.naddr}`, '_blank', 'noopener');
  }

  function shareX(): void {
    if (!matome) return;
    const text = encodeURIComponent(`${matome.title} ${currentUrl}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank', 'noopener');
  }

  // ⋮ menu
  let menuOpen = false;
  let copiedNevent = false;
  let copiedNaddr = false;

  function handleMenuToggle(e: MouseEvent): void {
    e.stopPropagation();
    menuOpen = !menuOpen;
  }

  function handleDocClick(): void {
    menuOpen = false;
  }

  async function copyNevent(): Promise<void> {
    if (!matome) return;
    const nevent = nip19.neventEncode({ id: matome.id, author: matome.pubkey, kind: 30023 });
    await navigator.clipboard.writeText(nevent);
    copiedNevent = true;
    setTimeout(() => { copiedNevent = false; menuOpen = false; }, 1500);
  }

  async function copyNaddr(): Promise<void> {
    if (!matome) return;
    await navigator.clipboard.writeText(matome.naddr);
    copiedNaddr = true;
    setTimeout(() => { copiedNaddr = false; menuOpen = false; }, 1500);
  }

  // JSON modal
  let showJson = false;
  $: jsonText = matome ? JSON.stringify(matome.rawEvent, null, 2) : '';
</script>

<svelte:window on:click={handleDocClick} />

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
          <!-- Nos -->
          <button class="share-btn" title="Nostrで開く" aria-label="Nostrで開く" on:click={shareNos}>
            <span class="nos-label">Nos</span>
          </button>

          <!-- X -->
          <button class="share-btn" title="Xでシェア" aria-label="Xでシェア" on:click={shareX}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </button>

          <!-- コピー: title + URL -->
          <button class="share-btn" title="タイトルとURLをコピー" aria-label="タイトルとURLをコピー" on:click={copyUrl}>
            {#if copiedUrl}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            {:else}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            {/if}
          </button>

          <!-- ⋮ メニュー -->
          <div class="menu-wrap">
            <button class="share-btn" title="その他" aria-label="その他のオプション" on:click={handleMenuToggle}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2"/>
                <circle cx="12" cy="12" r="2"/>
                <circle cx="12" cy="19" r="2"/>
              </svg>
            </button>
            {#if menuOpen}
              <div class="menu-dropdown" role="menu">
                <button class="menu-item" role="menuitem" on:click={copyNevent}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                  {copiedNevent ? 'コピーしました' : 'nevent1 をコピー'}
                </button>
                <button class="menu-item" role="menuitem" on:click={copyNaddr}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  {copiedNaddr ? 'コピーしました' : 'naddr1 をコピー'}
                </button>
                <div class="menu-divider"></div>
                <button class="menu-item" role="menuitem" on:click={() => { showJson = true; menuOpen = false; }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="16 18 22 12 16 6"/>
                    <polyline points="8 6 2 12 8 18"/>
                  </svg>
                  JSON を表示
                </button>
              </div>
            {/if}
          </div>
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

<!-- JSON モーダル -->
{#if showJson}
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    class="json-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Raw Event JSON"
    on:click|self={() => (showJson = false)}
    on:keydown={(e) => e.key === 'Escape' && (showJson = false)}
  >
    <div class="json-modal">
      <div class="json-header">
        <span>Raw Event JSON</span>
        <button class="json-close" on:click={() => (showJson = false)} aria-label="閉じる">×</button>
      </div>
      <pre class="json-body">{jsonText}</pre>
    </div>
  </div>
{/if}

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
    align-items: center;
    margin-left: auto;
  }

  /* 共通シェアボタン */
  .share-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    cursor: pointer;
    border: none;
    background: var(--accent);
    color: white;
    transition: background 0.12s, transform 0.12s, box-shadow 0.12s;
    flex-shrink: 0;
  }

  .share-btn:hover {
    background: var(--accent-dark);
    transform: translateY(-1px);
    box-shadow: 0 3px 8px rgba(249, 115, 22, 0.35);
  }

  .nos-label {
    font-family: 'M PLUS Rounded 1c', sans-serif;
    font-weight: 800;
    font-size: 11px;
    line-height: 1;
    letter-spacing: -0.02em;
  }

  /* ⋮ ドロップダウン */
  .menu-wrap {
    position: relative;
  }

  .menu-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    padding: 4px;
    min-width: 172px;
    z-index: 50;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    color: var(--ink2);
    cursor: pointer;
    background: none;
    border: none;
    font-family: var(--font-ui);
    text-align: left;
    transition: background 0.1s;
    white-space: nowrap;
  }

  .menu-item:hover {
    background: var(--bg);
  }

  .menu-divider {
    height: 1px;
    background: var(--border);
    margin: 4px 0;
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

  /* ===== JSON モーダル ===== */
  .json-overlay {
    position: fixed;
    inset: 0;
    background: rgba(28, 25, 23, 0.6);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
  }

  .json-modal {
    background: var(--surface);
    border-radius: 16px;
    width: 100%;
    max-width: 640px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  }

  .json-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 700;
    color: var(--ink);
    flex-shrink: 0;
  }

  .json-close {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: var(--bg);
    color: var(--ink2);
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    transition: background 0.1s;
  }

  .json-close:hover {
    background: var(--accent-mid);
    color: var(--accent-dark);
  }

  .json-body {
    font-family: monospace;
    font-size: 12px;
    line-height: 1.6;
    color: var(--ink2);
    padding: 16px 18px;
    overflow-y: auto;
    white-space: pre;
    word-break: break-all;
  }
</style>
