<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import { base } from '$app/paths';
  import type { Note } from '$lib/types';
  import { fetchNoteByIdWithRelay } from '$lib/services/NostrClient';
  import { profiles, requestProfile } from '$lib/stores/profiles';
  import { formatAbsoluteTime } from '$lib/utils/time';
  import {
    parseNostrRefs,
    extractImages,
    resolveTagRefs,
    buildEmojiMap
  } from '$lib/utils/nostrContent';
  import { shortNpubFromPubkey, resolveRepostTarget } from '$lib/utils/nostr';
  import { openReactions, type ReactionHandle } from '$lib/services/reactions';
  import { groupReactions } from '$lib/utils/reaction';
  import QuotedNote from '$lib/components/QuotedNote.svelte';
  import Avatar from '$lib/components/Avatar.svelte';

  export let nevent: string;
  export let num: number = 0;
  export let total: number = 0;
  // まとめ内の親ポスト（NIP-10 で解決済み）。null ならルート扱い。
  export let replyTo: { parentId: string; parentPubkey: string } | null = null;
  // スクロール先アンカー用のイベント id（まとめ詳細から渡す）。
  export let anchorId: string = '';
  // 直上が親または兄弟リプのとき 1 段インデントする（まとめ詳細から渡す）。
  export let indent: boolean = false;
  // ノート取得完了時に親（MatomePage）へ生イベントを通知するコールバック。
  // NIP-10 返信解決に使用するため、リポスト解決前の生イベントを渡す。
  export let noteFetched: ((note: Note) => void) | undefined = undefined;

  let note: Note | null = null;
  let loadError = false;
  let fetchedFrom = '';

  let menuOpen = false;
  let menuX = 0;
  let menuY = 0;
  let copyToast = false;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let removeDocListener: (() => void) | null = null;

  let repostSub: { unsubscribe(): void } | null = null;
  let repostTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  // リアクション/リポスト（タップ展開・lumilumi 式。開くまで購読しない）
  // 購読は対象 id 単位の共有マネージャ（openReactions）に集約する。重複排除・
  // キャッシュ保持はマネージャ側で行うので、ここでは届いた配列を kind で振り分けるだけ。
  let reactionsOpen = false;
  let reactionHandle: ReactionHandle | null = null;
  let reactionEvents: Note[] = [];
  let repostEvents: Note[] = [];
  // 履歴を取り切るまで true（EOSE 完了で false）。「読み込み中…」表示に使う。
  let reactionLoading = false;

  // 可視性（IntersectionObserver で更新）。タップ展開は可視中に起きるので初期値 true。
  let cardEl: HTMLElement | undefined;
  let cardVisible = true;
  // 開いている間だけ、可視性の変化を共有マネージャへ伝える（取得継続/一時停止の切替）。
  $: reactionHandle?.setVisible(cardVisible);

  $: reactionGroups = groupReactions(reactionEvents);

  function startReactions(): void {
    if (reactionHandle || !note) return;
    reactionLoading = true;
    reactionHandle = openReactions(note.id, (events, info) => {
      if (destroyed) return;
      const reacts: Note[] = [];
      const reposts: Note[] = [];
      for (const ev of events) {
        if (ev.kind === 7) reacts.push(ev);
        else reposts.push(ev);
        requestProfile(ev.pubkey);
      }
      reactionEvents = reacts;
      repostEvents = reposts;
      // EOSE で履歴を取り切ったら読み込み表示を畳む（タイムアウト不要）。
      reactionLoading = !info.complete;
    });
    reactionHandle.setVisible(cardVisible);
  }

  function stopReactions(): void {
    reactionHandle?.close();
    reactionHandle = null;
  }

  function toggleReactions(): void {
    reactionsOpen = !reactionsOpen;
    if (reactionsOpen) startReactions();
    else stopReactions();
  }

  function handleFetchedNote(n: Note, relay: string): void {
    const repost = resolveRepostTarget(n);
    if (repost) {
      repostSub = fetchNoteByIdWithRelay(
        repost.eventId,
        repost.relay ? [repost.relay] : undefined
      ).subscribe({
        next: ({ note: original, relay: r }) => {
          if (destroyed) return;
          note = original;
          fetchedFrom = r;
          requestProfile(original.pubkey);
          if (repostTimer) {
            clearTimeout(repostTimer);
            repostTimer = null;
          }
        },
        error: () => {
          if (!destroyed) loadError = true;
        },
        complete: () => {
          if (!destroyed && !note) loadError = true;
        }
      });
      repostTimer = setTimeout(() => {
        if (!destroyed && !note) loadError = true;
      }, 10_000);
      return;
    }
    if (n.kind === 1111) {
      loadError = true;
      return;
    }
    note = n;
    fetchedFrom = relay;
    requestProfile(n.pubkey);
  }

  onMount(() => {
    const str = nevent.replace('nostr:', '');
    let eventId: string;
    let hintRelays: string[] | undefined;
    try {
      const decoded = nip19.decode(str);
      if (decoded.type === 'nevent') {
        eventId = decoded.data.id;
        hintRelays = decoded.data.relays;
      } else if (decoded.type === 'note') eventId = decoded.data;
      else {
        loadError = true;
        return;
      }
    } catch {
      loadError = true;
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const sub = fetchNoteByIdWithRelay(eventId, hintRelays).subscribe({
      next: ({ note: n, relay }) => {
        noteFetched?.(n); // 生イベントを親に通知（NIP-10 解決用）
        handleFetchedNote(n, relay);
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      error: () => {
        loadError = true;
      }
    });
    timer = setTimeout(() => {
      if (!note) loadError = true;
    }, 10_000);

    // 可視性監視（リアクション欄の画面外停止/復帰のトリガー）
    let io: IntersectionObserver | null = null;
    if (cardEl && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (obsEntries) => {
          cardVisible = obsEntries[0]?.isIntersecting ?? true;
        },
        { rootMargin: '100px' }
      );
      io.observe(cardEl);
    }

    return () => {
      destroyed = true;
      sub.unsubscribe();
      repostSub?.unsubscribe();
      stopReactions();
      io?.disconnect();
      if (timer) clearTimeout(timer);
      if (repostTimer) clearTimeout(repostTimer);
    };
  });

  $: profile = note ? $profiles.get(note.pubkey) : undefined;
  $: authorName = profile?.displayName ?? profile?.name ?? shortNpubFromPubkey(note?.pubkey ?? '');
  $: picture = profile?.picture ?? null;

  // 返信先（親）の表示名。displayName → name → npub 短縮にフォールバック。
  $: if (replyTo) requestProfile(replyTo.parentPubkey);
  $: replyToName = replyTo
    ? (() => {
        const p = $profiles.get(replyTo.parentPubkey);
        return p?.displayName ?? p?.name ?? shortNpubFromPubkey(replyTo.parentPubkey);
      })()
    : '';

  function scrollToParent(): void {
    if (!replyTo) return;
    document
      .getElementById('note-' + replyTo.parentId)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function truncateName(name: string, max = 30): string {
    return name.length > max ? name.slice(0, max) + '…' : name;
  }

  $: emojiMap = note ? buildEmojiMap(note.tags) : new Map<string, string>();

  $: parsedContent = note
    ? extractImages(resolveTagRefs(note.content, note.tags))
    : { text: '', urls: [], videoUrls: [] };
  $: segments = parseNostrRefs(parsedContent.text, emojiMap);

  type ImetaInfo = { poster?: string; w?: number; h?: number };

  $: imetaMap = (() => {
    const map = new Map<string, ImetaInfo>();
    if (!note) return map;
    for (const tag of note.tags) {
      if (tag[0] !== 'imeta') continue;
      let url = '';
      const info: ImetaInfo = {};
      for (let i = 1; i < tag.length; i++) {
        const sp = tag[i].indexOf(' ');
        if (sp === -1) continue;
        const key = tag[i].slice(0, sp);
        const val = tag[i].slice(sp + 1);
        if (key === 'url') url = val;
        if (key === 'image' && val) info.poster = val;
        if (key === 'dim') {
          const [wStr, hStr] = val.split('x');
          const w = parseInt(wStr ?? '', 10);
          const h = parseInt(hStr ?? '', 10);
          if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
            info.w = w;
            info.h = h;
          }
        }
      }
      if (url) map.set(url, info);
    }
    return map;
  })();

  // メンション対象のプロフィールをリクエスト
  $: for (const seg of segments) {
    if (seg.type === 'mention') requestProfile(seg.pubkey);
  }

  $: cwReason = (() => {
    if (!note) return null;
    const tag = note.tags.find((t) => t[0] === 'content-warning');
    if (!tag) return null;
    return tag[1] ?? '';
  })();
  $: hasCw = cwReason !== null;
  let cwRevealed = false;

  let failedImages: Set<string> = new Set();
  let failedVideos: Set<string> = new Set();
  let failedEmojis: Set<string> = new Set();

  function onImgError(url: string): void {
    failedImages = new Set([...failedImages, url]);
  }

  function onVideoError(url: string): void {
    failedVideos = new Set([...failedVideos, url]);
  }

  function onEmojiError(shortcode: string): void {
    failedEmojis = new Set([...failedEmojis, shortcode]);
  }

  function shortenNaddr(naddr: string): string {
    return naddr.slice(0, 12) + '…' + naddr.slice(-4);
  }

  $: menuNevent = (() => {
    if (!note) return '';
    try {
      return nip19.neventEncode({ id: note.id, relays: fetchedFrom ? [fetchedFrom] : [] });
    } catch {
      return '';
    }
  })();

  function openMenu(e: Event): void {
    e.stopPropagation();
    const MENU_W = 175;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let x = rect.right - MENU_W;
    if (x < 8) x = 8;
    menuX = x;
    menuY = rect.bottom + 6;
    menuOpen = true;
    const handler = (): void => {
      menuOpen = false;
      removeDocListener = null;
    };
    document.addEventListener('click', handler, { once: true });
    removeDocListener = () => document.removeEventListener('click', handler);
  }

  async function copyNevent(): Promise<void> {
    if (!menuNevent) return;
    menuOpen = false;
    try {
      await navigator.clipboard.writeText(menuNevent);
      copyToast = true;
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        copyToast = false;
      }, 2000);
    } catch {
      /* clipboard API 利用不可 */
    }
  }

  function seekToThumbnail(e: Event, poster: string | undefined): void {
    if (!poster) (e.currentTarget as HTMLVideoElement).currentTime = 0.1;
  }

  onDestroy(() => {
    removeDocListener?.();
    if (toastTimer) clearTimeout(toastTimer);
  });
</script>

<div
  class="note-card"
  class:indented={indent}
  id={anchorId ? 'note-' + anchorId : undefined}
  bind:this={cardEl}
>
  {#if total > 0}<span class="note-num">{num} / {total}</span>{/if}

  {#if replyTo}
    <div class="reply-row">
      <button
        type="button"
        class="reply-link"
        title="返信先へ移動"
        on:click|stopPropagation={scrollToParent}
      >
        @{replyToName}
      </button>
    </div>
  {/if}

  {#if loadError}
    <div class="load-error">この投稿は取得できませんでした</div>
  {:else if !note}
    <div class="load-placeholder">取得中…</div>
  {:else}
    <div class="note-header">
      <a href="{base}/{nip19.npubEncode(note.pubkey)}" class="note-author-link">
        <Avatar pubkey={note.pubkey} {picture} name={authorName} size={36} />
        <div class="note-meta">
          <div class="note-name">{authorName}</div>
          <div class="note-pub">{shortNpubFromPubkey(note.pubkey)}</div>
        </div>
      </a>
      <span
        class="note-time"
        role="button"
        tabindex="0"
        on:click={openMenu}
        on:keydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openMenu(e);
          }
        }}
      >
        {formatAbsoluteTime(note.createdAt)}<svg
          class="note-time-chevron"
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg
        >
      </span>
    </div>
    <div class="cw-wrap">
      <div class="note-body" class:cw-blurred={hasCw && !cwRevealed}>
        <div class="note-content">
          {#each segments as segment}
            {#if segment.type === 'text'}
              <span class="text-seg">{segment.content}</span>
            {:else if segment.type === 'mention'}
              {@const mp = $profiles.get(segment.pubkey)}
              <a class="mention-link" href="{base}/{nip19.npubEncode(segment.pubkey)}"
                >@{truncateName(
                  mp?.displayName ?? mp?.name ?? shortNpubFromPubkey(segment.pubkey)
                )}</a
              >
            {:else if segment.type === 'quote'}
              <QuotedNote eventId={segment.eventId} />
            {:else if segment.type === 'naddr'}
              <a class="naddr-link" href="{base}/{segment.naddr}"
                >nostr:{shortenNaddr(segment.naddr)}</a
              >
            {:else if segment.type === 'url'}
              <a class="url-link" href={segment.url} target="_blank" rel="noopener noreferrer"
                >{segment.url}</a
              >
            {:else if segment.type === 'emoji'}
              {#if failedEmojis.has(segment.shortcode)}
                :{segment.shortcode}:
              {:else}
                <img
                  src={segment.url}
                  alt=":{segment.shortcode}:"
                  class="emoji-img"
                  loading="lazy"
                  on:error={() => onEmojiError(segment.shortcode)}
                />
              {/if}
            {/if}
          {/each}
        </div>
        {#if parsedContent.videoUrls.length > 0}
          <div class="note-videos">
            {#each parsedContent.videoUrls as url}
              {#if failedVideos.has(url)}
                <div class="img-error">
                  <span>🎬 動画を読み込めませんでした</span>
                  <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
                </div>
              {:else}
                {@const imeta = imetaMap.get(url)}
                <div class="media-wrap video-wrap">
                  <!-- svelte-ignore a11y-media-has-caption -->
                  <video
                    src={url}
                    controls
                    preload="metadata"
                    playsinline
                    poster={imeta?.poster}
                    class="note-video"
                    style={imeta?.w && imeta?.h ? `aspect-ratio: ${imeta.w}/${imeta.h}` : ''}
                    on:loadedmetadata={(e) => seekToThumbnail(e, imeta?.poster)}
                    on:error={() => onVideoError(url)}
                  ></video>
                </div>
              {/if}
            {/each}
          </div>
        {/if}
        {#if parsedContent.urls.length > 0}
          <div class="note-images" class:multi={parsedContent.urls.length > 1}>
            {#each parsedContent.urls as url}
              {#if failedImages.has(url)}
                <div class="img-error">
                  <span>🖼 画像を読み込めませんでした</span>
                  <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
                </div>
              {:else}
                <div class="media-wrap">
                  <a href={url} target="_blank" rel="noopener noreferrer" class="img-link">
                    <img
                      src={url}
                      alt=""
                      class="note-img"
                      loading="lazy"
                      on:error={() => onImgError(url)}
                    />
                  </a>
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      </div>

      {#if hasCw && !cwRevealed}
        <div
          class="cw-overlay"
          role="button"
          tabindex="0"
          on:click={() => (cwRevealed = true)}
          on:keydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              cwRevealed = true;
            }
          }}
        >
          <div class="cw-pill">
            <span class="cw-pill-text">⚠️{cwReason ? ' ' + cwReason : ''}</span>
          </div>
          <div class="cw-hint">タップして表示</div>
        </div>
      {/if}
    </div>

    {#if hasCw && cwRevealed}
      <div class="cw-hide-wrap">
        <button class="cw-hide-btn" on:click={() => (cwRevealed = false)}>隠す</button>
      </div>
    {/if}

    <div class="reaction-bar">
      <button
        type="button"
        class="reaction-trigger"
        class:open={reactionsOpen}
        aria-expanded={reactionsOpen}
        title="リアクション・リポストを表示"
        on:click|stopPropagation={toggleReactions}
      >
        <span class="rt-item" title="リアクション">
          <svg
            class="rt-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path
              d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 16.78l-5.2 2.73.99-5.79-4.21-4.1 5.82-.85z"
            />
          </svg>
          <span class="rt-count">{reactionEvents.length || ''}</span>
        </span>
        <span class="rt-sep" aria-hidden="true"></span>
        <span class="rt-item" title="リポスト">
          <svg
            class="rt-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="17 1 21 5 17 9" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <polyline points="7 23 3 19 7 15" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
          <span class="rt-count">{repostEvents.length || ''}</span>
        </span>
        <svg
          class="rt-chevron"
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg
        >
      </button>
    </div>

    {#if reactionsOpen}
      <div class="reaction-panel">
        {#if reactionLoading && reactionEvents.length === 0 && repostEvents.length === 0}
          <div class="reaction-status">読み込み中…</div>
        {:else if reactionEvents.length === 0 && repostEvents.length === 0}
          <div class="reaction-status">まだリアクション・リポストはありません</div>
        {:else}
          {#each reactionGroups as group (group.key)}
            <div class="reaction-row">
              <span class="reaction-key">
                {#if group.reaction.type === 'star'}⭐
                {:else if group.reaction.type === 'thumbsdown'}👎
                {:else if group.reaction.type === 'emoji'}
                  <img
                    class="reaction-emoji"
                    src={group.reaction.url}
                    alt=":{group.reaction.shortcode}:"
                    loading="lazy"
                  />
                {:else}{group.reaction.text}{/if}
              </span>
              <div class="reactor-avatars">
                {#each group.pubkeys as pk, i (i)}
                  {@const rp = $profiles.get(pk)}
                  <a
                    class="reactor-avatar"
                    href="{base}/{nip19.npubEncode(pk)}"
                    title={rp?.displayName ?? rp?.name ?? shortNpubFromPubkey(pk)}
                  >
                    <Avatar
                      pubkey={pk}
                      picture={rp?.picture ?? null}
                      name={rp?.displayName ?? rp?.name ?? null}
                      size={24}
                    />
                  </a>
                {/each}
              </div>
            </div>
          {/each}
          {#if repostEvents.length > 0}
            <div class="reaction-row">
              <span class="reaction-key">🔁</span>
              <div class="reactor-avatars">
                {#each repostEvents as ev (ev.id)}
                  {@const rp = $profiles.get(ev.pubkey)}
                  <a
                    class="reactor-avatar"
                    href="{base}/{nip19.npubEncode(ev.pubkey)}"
                    title={rp?.displayName ?? rp?.name ?? shortNpubFromPubkey(ev.pubkey)}
                  >
                    <Avatar
                      pubkey={ev.pubkey}
                      picture={rp?.picture ?? null}
                      name={rp?.displayName ?? rp?.name ?? null}
                      size={24}
                    />
                  </a>
                {/each}
              </div>
            </div>
          {/if}
        {/if}
      </div>
    {/if}
  {/if}
</div>

{#if menuOpen && menuNevent}
  <div
    class="note-menu"
    style="left:{menuX}px;top:{menuY}px"
    role="menu"
    tabindex="-1"
    on:click|stopPropagation
    on:keydown|stopPropagation
  >
    <a
      class="note-menu-item"
      href="https://nostter.app/{menuNevent}"
      target="_blank"
      rel="noopener noreferrer"
      on:click={() => (menuOpen = false)}>nostterで開く</a
    >
    <div
      class="note-menu-item"
      role="menuitem"
      tabindex="0"
      on:click={copyNevent}
      on:keydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          copyNevent();
        }
      }}
    >
      neventをコピー
    </div>
  </div>
{/if}

{#if copyToast}
  <div class="copy-toast" aria-live="polite">コピーしました</div>
{/if}

<style>
  .note-card {
    position: relative;
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: var(--radius-card);
    padding: 26px 18px 18px;
    margin-bottom: 12px;
    transition: box-shadow 0.15s;
  }

  .note-card:hover {
    box-shadow: var(--shadow-card-note);
    border-color: var(--accent-mid);
  }

  /* 直上が親/兄弟リプのときだけ 1 段（深さに関わらず固定幅）。 */
  .note-card.indented {
    margin-left: 28px;
  }

  /* ナンバリングは左上の角に控えめに添える（グレー・背景なし）。 */
  .note-num {
    position: absolute;
    top: 9px;
    left: 18px;
    font-size: 11px;
    font-weight: 700;
    color: var(--ink3);
    font-family: var(--font-ui);
  }

  .reply-row {
    margin-bottom: 10px;
  }

  /* リプライ先は囲みなしのテキスト表示（@名前）。タップで親へスクロール。 */
  .reply-link {
    display: inline-flex;
    max-width: 100%;
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
    background: none;
    border: none;
    padding: 0;
    font-family: var(--font-ui);
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .reply-link:hover {
    text-decoration: underline;
  }

  .note-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 11px;
  }

  .note-author-link {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;
    text-decoration: none;
    color: inherit;
    border-radius: 8px;
    padding: 2px 4px;
    margin: -2px -4px;
    transition: background 0.12s;
  }

  .note-author-link:hover {
    background: var(--accent-pale);
  }

  .note-meta {
    min-width: 0;
    flex: 1;
  }

  .note-name {
    font-weight: 700;
    font-size: 15px;
    color: var(--ink);
    font-family: var(--font-ui);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .note-pub {
    font-size: 12px;
    color: var(--ink3);
    font-family: monospace;
  }

  .note-time {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 13px;
    color: var(--ink3);
    flex-shrink: 0;
    margin-left: auto;
    cursor: pointer;
    border-radius: 6px;
    padding: 3px 4px;
    margin-right: -4px;
    transition: background 0.1s;
  }

  .note-time:hover {
    background: var(--accent-pale);
  }

  .note-time-chevron {
    width: 11px;
    height: 11px;
    flex-shrink: 0;
    color: var(--note-chevron);
  }

  .note-menu {
    position: fixed;
    z-index: 200;
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--shadow-popover);
    overflow: hidden;
    min-width: 160px;
  }

  .note-menu-item {
    display: block;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--ink);
    font-family: var(--font-ui);
    cursor: pointer;
    text-decoration: none;
    transition: background 0.1s;
    user-select: none;
  }

  .note-menu-item + .note-menu-item {
    border-top: 1px solid var(--border);
  }

  .note-menu-item:hover {
    background: var(--bg);
  }

  .copy-toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--ink);
    color: var(--surface);
    font-size: 13px;
    font-family: var(--font-ui);
    padding: 8px 18px;
    border-radius: 20px;
    z-index: 300;
    pointer-events: none;
    white-space: nowrap;
  }

  .note-content {
    font-size: 16px;
    line-height: 1.85;
    color: var(--ink);
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .text-seg {
    white-space: pre-wrap;
  }

  .mention-link {
    color: var(--accent);
    text-decoration: none;
    font-weight: 600;
  }

  .mention-link:hover {
    text-decoration: underline;
  }

  .naddr-link {
    color: var(--accent);
    text-decoration: none;
    font-size: 14px;
    word-break: break-all;
  }

  .naddr-link:hover {
    text-decoration: underline;
  }

  .note-videos {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 10px;
  }

  .note-images {
    display: grid;
    grid-template-columns: 1fr;
    gap: 6px;
    margin-top: 10px;
  }

  .note-images.multi {
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }

  .media-wrap {
    position: relative;
    display: block;
    max-width: 85%;
    margin: 0 auto;
    border-radius: 8px;
    overflow: hidden;
  }

  .note-images.multi .media-wrap {
    max-width: 100%;
  }

  .video-wrap {
    background: #000;
  }

  .img-link {
    display: block;
    line-height: 0;
  }

  .note-img {
    max-height: 400px;
    width: auto;
    height: auto;
    max-width: 100%;
    display: block;
    margin: 0 auto;
  }

  .note-video {
    max-width: 100%;
    max-height: 400px;
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
    margin: 0 auto;
  }

  .url-link {
    color: var(--accent);
    text-decoration: none;
    word-break: break-all;
    font-size: 14px;
  }

  .url-link:hover {
    text-decoration: underline;
  }

  .emoji-img {
    max-height: 1.85em;
    max-width: 100%;
    vertical-align: top;
    display: inline;
  }

  /* NIP-36 content-warning */
  .cw-wrap {
    position: relative;
  }

  .note-body .note-content,
  .note-body .note-images,
  .note-body .note-videos {
    transition: filter 0.2s;
  }

  .note-body.cw-blurred {
    pointer-events: none;
    user-select: none;
  }

  .note-body.cw-blurred .note-content {
    filter: blur(4px);
  }

  .note-body.cw-blurred .note-images,
  .note-body.cw-blurred .note-videos {
    filter: blur(30px);
  }

  .note-body.cw-blurred .note-img,
  .note-body.cw-blurred .note-video {
    transform: scale(1.08);
  }

  .cw-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    z-index: 1;
  }

  .cw-pill {
    background: rgba(0, 0, 0, 0.45);
    padding: 6px 18px;
    border-radius: 9999px;
    max-width: 90%;
    overflow: hidden;
  }

  .cw-pill-text {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    max-height: calc(1.5em * 3);
    color: #fff;
    font-size: 13px;
    line-height: 1.5;
    font-family: var(--font-ui);
    font-weight: 600;
    text-align: center;
    word-break: break-word;
  }

  .cw-hint {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.9);
    font-family: var(--font-ui);
    font-weight: 700;
  }

  .cw-hide-wrap {
    display: flex;
    justify-content: center;
    margin-top: 12px;
  }

  .cw-hide-btn {
    background: var(--bg);
    border: 1.5px solid var(--border2);
    border-radius: 20px;
    padding: 9px 28px;
    font-size: 14px;
    font-family: var(--font-ui);
    font-weight: 600;
    color: var(--ink2);
    cursor: pointer;
    transition: background 0.12s;
  }

  .cw-hide-btn:hover {
    background: var(--accent-pale);
  }

  .img-error {
    width: 100%;
    background: var(--bg);
    border: 1.5px solid var(--border);
    border-radius: 10px;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    color: var(--ink3);
  }

  .img-error a {
    color: var(--accent);
    font-size: 11px;
    word-break: break-all;
    text-decoration: none;
  }

  .img-error a:hover {
    text-decoration: underline;
  }

  .load-placeholder {
    font-size: 13px;
    color: var(--ink3);
    padding: 8px 0;
    font-family: var(--font-ui);
  }

  .load-error {
    font-size: 13px;
    color: var(--ink3);
    padding: 8px 0;
    font-style: italic;
  }

  /* リアクション/リポスト */
  .reaction-bar {
    margin-top: 14px;
  }

  /* ピル型ではなく、上に薄い水平線を引いて区切る全幅のタップ範囲。
     全幅なので件数が出ても表示部分の幅は変わらない（右端のシェブロンは固定）。 */
  .reaction-trigger {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    width: 100%;
    font-size: 12px;
    font-weight: 700;
    font-family: var(--font-ui);
    color: var(--ink3);
    background: none;
    border: none;
    border-top: 1px solid var(--border);
    border-radius: 0;
    padding: 10px 2px 0;
    cursor: pointer;
    transition: color 0.12s;
  }

  .reaction-trigger:hover {
    color: var(--accent);
  }

  .reaction-trigger.open {
    color: var(--accent);
  }

  .rt-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .rt-icon {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
  }

  .rt-count {
    /* 件数が出ても/増えてもアイコン位置がずれないよう枠を常に確保する */
    min-width: 1.4em;
    text-align: left;
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ink2);
  }

  .rt-sep {
    width: 1px;
    align-self: stretch;
    background: var(--border);
  }

  .rt-chevron {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    color: var(--note-chevron);
    transition: transform 0.15s;
  }

  .reaction-trigger.open .rt-chevron {
    transform: rotate(180deg);
  }

  .reaction-panel {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .reaction-status {
    font-size: 13px;
    color: var(--ink3);
    font-family: var(--font-ui);
    padding: 4px 0;
  }

  .reaction-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .reaction-key {
    flex-shrink: 0;
    min-width: 28px;
    font-size: 15px;
    line-height: 24px;
    color: var(--ink);
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .reaction-emoji {
    height: 20px;
    max-width: 100px;
    vertical-align: middle;
  }

  .reactor-avatars {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    min-width: 0;
  }

  .reactor-avatar {
    display: block;
    line-height: 0;
    border-radius: 50%;
  }
</style>
