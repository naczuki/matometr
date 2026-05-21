<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { nip19 } from 'nostr-tools';
  import type { AddressPointer } from 'nostr-tools/nip19';
  import { Matome } from '$lib/entities/Matome';
  import type { MatomeBlock } from '$lib/entities/Matome';
  import { fetchMatomeByAddress, deleteMatome } from '$lib/services/NostrClient';
  import { profiles, requestProfile } from '$lib/stores/profiles';
  import { currentUser } from '$lib/stores/auth';
  import { avatarStyle } from '$lib/utils/avatar';
  import { shortNpubFromPubkey } from '$lib/utils/nostr';
  import { NOSLI_BASE_URL } from '$lib/utils/constants';
  import NoteCard from '$lib/components/NoteCard.svelte';
  import NaddrCard from '$lib/components/NaddrCard.svelte';
  import Spinner from '$lib/components/Spinner.svelte';
  import { parseMarkdownContent } from '$lib/utils/markdown';
  import type { ContentSegment } from '$lib/utils/markdown';

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

  $: isMine = !!$currentUser && matome?.pubkey === $currentUser.pubkey;

  $: profile = $profiles.get(matome?.pubkey ?? '');
  $: authorName = profile?.displayName ?? profile?.name ?? shortNpubFromPubkey(matome?.pubkey ?? '');
  $: authorPicture = profile?.picture ?? null;
  $: authorStyle = matome ? avatarStyle(matome.pubkey) : { bg: '#e5e5e5', fg: '#737373', initial: '?' };
  $: authorNpub = matome ? (() => { try { return nip19.npubEncode(matome!.pubkey); } catch { return null; } })() : null;

  let authorImgFailed = false;
  $: authorPicture, (authorImgFailed = false);

  type RenderBlock =
    | { type: 'note'; nevent: string; num: number }
    | { type: 'heading'; content: string }
    | { type: 'paragraph'; content: string }
    | { type: 'comment'; content: string };

  function buildRenderPlan(blocks: MatomeBlock[]): RenderBlock[] {
    const plan: RenderBlock[] = [];
    let noteNum = 0;
    for (const b of blocks) {
      if (b.type === 'nevent') {
        noteNum++;
        plan.push({ type: 'note', nevent: b.content, num: noteNum });
      } else {
        plan.push({ type: b.type, content: b.content } as RenderBlock);
      }
    }
    return plan;
  }

  $: renderPlan = matome ? buildRenderPlan(matome.blocks) : [];

  let mdSegments: ContentSegment[] = [];
  $: if (matome && !matome.isMatometr) {
    mdSegments = parseMarkdownContent(matome.content);
  }

  function formatDate(unixSeconds: number): string {
    const d = new Date(unixSeconds * 1000);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  // share actions
  let copiedUrl = false;
  async function copyUrl(): Promise<void> {
    const text = matome ? `${matome.title}\n${currentUrl}` : currentUrl;
    await navigator.clipboard.writeText(text);
    copiedUrl = true;
    setTimeout(() => { copiedUrl = false; }, 1500);
  }

  function shareX(): void {
    if (!matome) return;
    const text = encodeURIComponent(`${matome.title}\n${currentUrl}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank', 'noopener');
  }

  $: shareText = matome ? `${matome.title}\nnostr:${matome.naddr}` : '';

  // ⋮ menu
  let menuOpen = false;
  let copiedNaddr = false;

  function handleMenuToggle(e: MouseEvent): void {
    e.stopPropagation();
    menuOpen = !menuOpen;
  }

  function handleDocClick(): void {
    menuOpen = false;
  }

  async function copyNaddr(): Promise<void> {
    if (!matome) return;
    await navigator.clipboard.writeText(matome.naddr);
    copiedNaddr = true;
    setTimeout(() => { copiedNaddr = false; menuOpen = false; }, 1500);
  }

  // 削除
  let showDeleteConfirm = false;
  let deleting = false;
  let deleteError = '';

  async function handleDelete(): Promise<void> {
    if (!matome || deleting) return;
    deleting = true;
    deleteError = '';
    try {
      await deleteMatome(matome.id);
      await goto(`${base}/`);
    } catch (e) {
      deleteError = e instanceof Error ? e.message : '削除に失敗しました';
      deleting = false;
    }
  }

  // JSON modal
  let showJson = false;
  let copiedJson = false;
  $: jsonText = matome ? JSON.stringify(matome.rawEvent, null, 2) : '';

  async function copyJson(): Promise<void> {
    await navigator.clipboard.writeText(jsonText);
    copiedJson = true;
    setTimeout(() => { copiedJson = false; }, 1500);
  }
</script>

<svelte:window on:click={handleDocClick} />

<svelte:head>
  <title>{matome?.title ?? 'まとめ詳細'} | まとめたー</title>
  {#if matome?.summary}
    <meta name="description" content={matome.summary} />
  {/if}
</svelte:head>

<div class="wrap">
  <div class="nav-row">
    <a href="{base}/" class="back-btn">← まとめ一覧にもどる</a>
    {#if matome && isMine && matome.isMatometr}
      <div class="mgmt-btns">
        <a href="{base}/edit/{matome.naddr}" class="mgmt-btn mgmt-btn-edit">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          編集
        </a>
        <button class="mgmt-btn mgmt-btn-delete" on:click={() => (showDeleteConfirm = true)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
          削除
        </button>
      </div>
    {:else if matome && isMine && matome.isNosli}
      <div class="mgmt-btns">
        <a
          href="{NOSLI_BASE_URL}/li/{matome.naddr}"
          target="_blank"
          rel="noopener noreferrer"
          class="mgmt-btn mgmt-btn-nosli"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          nosliで編集
        </a>
      </div>
    {/if}
  </div>

  {#if loading}
    <div class="state">
      <Spinner />
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
        <a
          href={authorNpub ? `${base}/user/${authorNpub}` : undefined}
          class="detail-author-link"
          aria-label="{authorName} のユーザーページ"
        >
          <div class="detail-avatar" style="background:{authorStyle.bg};color:{authorStyle.fg};">
            {#if authorPicture && !authorImgFailed}
              <img src={authorPicture} alt="" on:error={() => (authorImgFailed = true)} />
            {:else}
              {authorStyle.initial}
            {/if}
          </div>
          <div>
            <div class="detail-author-name">{authorName}</div>
            <div class="detail-author-pub">{shortNpubFromPubkey(matome.pubkey)}</div>
          </div>
        </a>
        <span class="detail-date">{formatDate(matome.publishedAt)}</span>
      </div>

      <div class="detail-stats">
        <div class="stat-item"><b>{matome.postCount}</b>件の投稿</div>

        <div class="stat-share-row">
          <!-- Nos: nostr-share-component（スロットでテキスト上書き） -->
          <nostr-share data-text={shareText}><span class="nos-label">Nos</span></nostr-share>

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

    {#if matome.isMatometr}
      {#each renderPlan as block}
        {#if block.type === 'heading'}
          <div class="block-heading">{block.content}</div>
        {:else if block.type === 'note'}
          <NoteCard nevent={block.nevent} num={block.num} total={matome.postCount} />
        {:else if block.type === 'comment'}
          <div class="block-comment">{block.content}</div>
        {:else if block.type === 'paragraph'}
          <p class="block-paragraph">{block.content}</p>
        {/if}
      {/each}
    {:else}
      <div class="md-body">
        {#each mdSegments as seg}
          {#if seg.type === 'html'}
            {@html seg.html}
          {:else if seg.type === 'nevent'}
            <NoteCard nevent={seg.ref} />
          {:else if seg.type === 'naddr'}
            <NaddrCard ref={seg.ref} />
          {/if}
        {/each}
      </div>
    {/if}
  {/if}
</div>

<!-- 削除確認ダイアログ -->
{#if showDeleteConfirm}
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    class="dialog-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="削除の確認"
    on:click|self={() => { if (!deleting) showDeleteConfirm = false; }}
    on:keydown={(e) => { if (e.key === 'Escape' && !deleting) showDeleteConfirm = false; }}
  >
    <div class="dialog-box">
      <p class="dialog-title">このまとめを削除しますか？</p>
      <p class="dialog-note">リレーによっては削除後も残る場合があります。</p>
      {#if deleteError}
        <p class="dialog-error">{deleteError}</p>
      {/if}
      <div class="dialog-actions">
        <button
          class="dialog-btn-cancel"
          disabled={deleting}
          on:click={() => (showDeleteConfirm = false)}
        >キャンセル</button>
        <button
          class="dialog-btn-delete"
          disabled={deleting}
          on:click={handleDelete}
        >{deleting ? '削除中…' : '削除する'}</button>
      </div>
    </div>
  </div>
{/if}

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
        <div class="json-header-actions">
          <button class="json-copy" on:click={copyJson} aria-label="JSONをコピー">
            {#if copiedJson}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              コピーしました
            {:else}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              コピー
            {/if}
          </button>
          <button class="json-close" on:click={() => (showJson = false)} aria-label="閉じる">×</button>
        </div>
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

  .nav-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 20px;
    flex-wrap: nowrap;
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
    border-radius: 9999px;
    padding: 7px 16px;
    cursor: pointer;
    font-family: var(--font-ui);
    text-decoration: none;
    transition: background 0.12s;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .back-btn:hover {
    background: var(--accent-pale);
  }

  .mgmt-btns {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .mgmt-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 7px 14px;
    border-radius: 9999px;
    font-size: 13px;
    font-weight: 700;
    font-family: var(--font-ui);
    white-space: nowrap;
    text-decoration: none;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s;
  }

  .mgmt-btn-edit {
    background: var(--accent);
    color: #fff;
    border: 1.5px solid transparent;
  }

  .mgmt-btn-edit:hover {
    background: var(--accent-dark);
  }

  .mgmt-btn-delete {
    background: var(--surface);
    color: #dc2626;
    border: 1.5px solid #fca5a5;
  }

  .mgmt-btn-delete:hover {
    background: #fff5f5;
    border-color: #dc2626;
  }

  .mgmt-btn-nosli {
    background: var(--surface);
    color: var(--ink3);
    border: 1.5px solid var(--border2);
  }

  .mgmt-btn-nosli:hover {
    border-color: var(--ink3);
    color: var(--ink2);
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

  .detail-author-link {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    border-radius: 8px;
    padding: 2px 4px;
    margin: -2px -4px;
    transition: background 0.12s;
  }

  .detail-author-link:hover {
    background: var(--accent-pale);
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

  /* 削除確認ダイアログ */
  .dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    padding: 16px;
  }

  .dialog-box {
    background: var(--surface);
    border-radius: 18px;
    padding: 28px 24px 20px;
    max-width: 360px;
    width: 100%;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  }

  .dialog-title {
    font-family: var(--font-ui);
    font-size: 17px;
    font-weight: 800;
    color: var(--ink);
    margin: 0 0 8px;
  }

  .dialog-note {
    font-size: 13px;
    color: var(--ink3);
    margin: 0 0 16px;
  }

  .dialog-error {
    font-size: 13px;
    color: #dc2626;
    background: #fff5f5;
    border: 1px solid #fecaca;
    border-radius: 8px;
    padding: 8px 12px;
    margin-bottom: 12px;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .dialog-btn-cancel {
    padding: 9px 18px;
    border: 1.5px solid var(--border2);
    border-radius: var(--radius-btn);
    background: var(--surface);
    color: var(--ink2);
    font-size: 14px;
    font-weight: 600;
    font-family: var(--font-ui);
    cursor: pointer;
    transition: border-color 0.12s;
  }

  .dialog-btn-cancel:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .dialog-btn-cancel:not(:disabled):hover {
    border-color: var(--ink2);
  }

  .dialog-btn-delete {
    padding: 9px 18px;
    border: none;
    border-radius: var(--radius-btn);
    background: #dc2626;
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    font-family: var(--font-ui);
    cursor: pointer;
    transition: background 0.12s;
  }

  .dialog-btn-delete:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .dialog-btn-delete:not(:disabled):hover {
    background: #b91c1c;
  }

  /* nostr-share-component: Mochiy Pop One・横長・オレンジ */
  :global(nostr-share::part(button)) {
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 10px;
    height: 34px;
    padding: 0 14px;
    cursor: pointer;
    transition: background 0.12s, transform 0.12s, box-shadow 0.12s;
    display: inline-flex;
    align-items: center;
  }

  :global(nostr-share::part(button):hover) {
    background: var(--accent-dark);
    transform: translateY(-1px);
    box-shadow: 0 3px 8px rgba(249, 115, 22, 0.35);
  }

  .nos-label {
    font-family: 'Mochiy Pop One', sans-serif;
    font-size: 13px;
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

  /* ===== マークダウン記事 ===== */
  .md-body {
    font-size: 15px;
    line-height: 1.85;
    color: var(--ink2);
    word-break: break-word;
  }

  :global(.md-body h1),
  :global(.md-body h2),
  :global(.md-body h3),
  :global(.md-body h4) {
    font-family: var(--font-ui);
    font-weight: 800;
    color: var(--ink);
    margin: 1.4em 0 0.5em;
    line-height: 1.4;
  }

  :global(.md-body h1) { font-size: 20px; }
  :global(.md-body h2) { font-size: 17px; border-left: 4px solid var(--accent); padding-left: 12px; }
  :global(.md-body h3) { font-size: 15px; }

  :global(.md-body p) {
    margin: 0.8em 0;
  }

  :global(.md-body strong) {
    font-weight: 700;
    color: var(--ink);
  }

  :global(.md-body em) {
    font-style: italic;
  }

  :global(.md-body a) {
    color: var(--accent);
    text-decoration: underline;
    word-break: break-all;
  }

  :global(.md-body blockquote) {
    margin: 12px 0;
    padding: 10px 16px;
    background: var(--accent-pale);
    border-left: 3px solid var(--accent);
    border-radius: 4px;
    color: var(--ink2);
    font-size: 14px;
  }

  :global(.md-body pre) {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
    overflow-x: auto;
    font-size: 13px;
    line-height: 1.6;
    margin: 12px 0;
  }

  :global(.md-body code) {
    font-family: monospace;
    font-size: 0.9em;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 5px;
  }

  :global(.md-body pre code) {
    background: none;
    border: none;
    padding: 0;
    font-size: inherit;
  }

  :global(.md-body ul),
  :global(.md-body ol) {
    padding-left: 1.5em;
    margin: 0.6em 0;
  }

  :global(.md-body li) {
    margin: 0.25em 0;
  }

  :global(.md-body hr) {
    border: none;
    border-top: 1px solid var(--border);
    margin: 24px 0;
  }

  :global(.md-body img) {
    max-width: 100%;
    border-radius: 8px;
    margin: 8px 0;
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

  .json-header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .json-copy {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    border-radius: 8px;
    border: 1.5px solid var(--border2);
    background: var(--surface);
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.1s, border-color 0.1s;
    white-space: nowrap;
  }

  .json-copy:hover {
    background: var(--accent-pale);
    border-color: var(--accent);
    color: var(--accent-dark);
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
