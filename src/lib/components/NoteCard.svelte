<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import { base } from '$app/paths';
  import type { Note } from '$lib/types';
  import { fetchNoteByIdWithRelay } from '$lib/services/NostrClient';
  import { profiles, requestProfile } from '$lib/stores/profiles';
  import { timeAgo } from '$lib/utils/time';
  import { parseNostrRefs, extractImages, resolveTagRefs, buildEmojiMap } from '$lib/utils/nostrContent';
  import { shortNpubFromPubkey, resolveRepostTarget } from '$lib/utils/nostr';
  import QuotedNote from '$lib/components/QuotedNote.svelte';
  import Avatar from '$lib/components/Avatar.svelte';

  export let nevent: string;
  export let num: number = 0;
  export let total: number = 0;

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

  function handleFetchedNote(n: Note, relay: string): void {
    const repost = resolveRepostTarget(n);
    if (repost) {
      repostSub = fetchNoteByIdWithRelay(repost.eventId).subscribe({
        next: ({ note: original, relay: r }) => {
          note = original;
          fetchedFrom = r;
          requestProfile(original.pubkey);
          if (repostTimer) { clearTimeout(repostTimer); repostTimer = null; }
        },
        error: () => { loadError = true; },
        complete: () => { if (!note) loadError = true; }
      });
      repostTimer = setTimeout(() => { if (!note) loadError = true; }, 10_000);
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
    try {
      const decoded = nip19.decode(str);
      if (decoded.type === 'nevent') eventId = decoded.data.id;
      else if (decoded.type === 'note') eventId = decoded.data;
      else { loadError = true; return; }
    } catch {
      loadError = true;
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const sub = fetchNoteByIdWithRelay(eventId).subscribe({
      next: ({ note: n, relay }) => {
        handleFetchedNote(n, relay);
        if (timer) { clearTimeout(timer); timer = null; }
      },
      error: () => { loadError = true; }
    });
    timer = setTimeout(() => { if (!note) loadError = true; }, 10_000);
    return () => {
      sub.unsubscribe();
      repostSub?.unsubscribe();
      if (timer) clearTimeout(timer);
      if (repostTimer) clearTimeout(repostTimer);
    };
  });

  $: profile = note ? $profiles.get(note.pubkey) : undefined;
  $: authorName = profile?.displayName ?? profile?.name ?? shortNpubFromPubkey(note?.pubkey ?? '');
  $: picture = profile?.picture ?? null;

  function truncateName(name: string, max = 30): string {
    return name.length > max ? name.slice(0, max) + '…' : name;
  }

  $: emojiMap = note ? buildEmojiMap(note.tags) : new Map<string, string>();

  $: parsedContent = note ? extractImages(resolveTagRefs(note.content, note.tags)) : { text: '', urls: [], videoUrls: [] };
  $: segments = parseNostrRefs(parsedContent.text, emojiMap);

  $: imetaMap = (() => {
    const map = new Map<string, string>();
    if (!note) return map;
    for (const tag of note.tags) {
      if (tag[0] !== 'imeta') continue;
      let url = '';
      let image = '';
      for (let i = 1; i < tag.length; i++) {
        const sp = tag[i].indexOf(' ');
        if (sp === -1) continue;
        const key = tag[i].slice(0, sp);
        const val = tag[i].slice(sp + 1);
        if (key === 'url') url = val;
        if (key === 'image') image = val;
      }
      if (url && image) map.set(url, image);
    }
    return map;
  })();

  // メンション対象のプロフィールをリクエスト
  $: for (const seg of segments) {
    if (seg.type === 'mention') requestProfile(seg.pubkey);
  }

  $: cwReason = (() => {
    if (!note) return null;
    const tag = note.tags.find(t => t[0] === 'content-warning');
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
    } catch { return ''; }
  })();

  function openMenu(e: MouseEvent): void {
    e.stopPropagation();
    const MENU_W = 175;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let x = rect.right - MENU_W;
    if (x < 8) x = 8;
    menuX = x;
    menuY = rect.bottom + 6;
    menuOpen = true;
    const handler = (): void => { menuOpen = false; removeDocListener = null; };
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
      toastTimer = setTimeout(() => { copyToast = false; }, 2000);
    } catch { /* clipboard API 利用不可 */ }
  }

  onDestroy(() => {
    removeDocListener?.();
    if (toastTimer) clearTimeout(toastTimer);
  });
</script>

<div class="note-card">
  {#if total > 0}<div class="note-num">{num} / {total}</div>{/if}

  {#if loadError}
    <div class="load-error">この投稿は取得できませんでした</div>
  {:else if !note}
    <div class="load-placeholder">取得中…</div>
  {:else}
    <div class="note-header">
      <Avatar pubkey={note.pubkey} {picture} size={36} />
      <div class="note-meta">
        <div class="note-name">{authorName}</div>
        <div class="note-pub">{shortNpubFromPubkey(note.pubkey)}</div>
      </div>
      <!-- svelte-ignore a11y-interactive-supports-focus -->
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <span class="note-time" role="button" on:click={openMenu}>
        {timeAgo(note.createdAt)}<svg class="note-time-chevron" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
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
              <a
                class="mention-link"
                href="{base}/user/?id={nip19.npubEncode(segment.pubkey)}"
              >@{truncateName(mp?.displayName ?? mp?.name ?? shortNpubFromPubkey(segment.pubkey))}</a>
            {:else if segment.type === 'quote'}
              <QuotedNote eventId={segment.eventId} />
            {:else if segment.type === 'naddr'}
              <a
                class="naddr-link"
                href="{base}/matome/?id={segment.naddr}"
              >nostr:{shortenNaddr(segment.naddr)}</a>
            {:else if segment.type === 'url'}
              <a
                class="url-link"
                href={segment.url}
                target="_blank"
                rel="noopener noreferrer"
              >{segment.url}</a>
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
                <div class="media-wrap video-wrap">
                  <!-- svelte-ignore a11y-media-has-caption -->
                  <video
                    src={`${url}#t=0.1`}
                    controls
                    preload="metadata"
                    playsinline
                    poster={imetaMap.get(url)}
                    class="note-video"
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
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="cw-overlay" on:click={() => (cwRevealed = true)}>
          <div class="cw-pill"><span class="cw-pill-text">⚠️{cwReason ? ' ' + cwReason : ''}</span></div>
          <div class="cw-hint">タップして表示</div>
        </div>
      {/if}
    </div>

    {#if hasCw && cwRevealed}
      <div class="cw-hide-wrap">
        <button class="cw-hide-btn" on:click={() => (cwRevealed = false)}>隠す</button>
      </div>
    {/if}
  {/if}
</div>

{#if menuOpen && menuNevent}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-interactive-supports-focus -->
  <div
    class="note-menu"
    style="left:{menuX}px;top:{menuY}px"
    role="menu"
    on:click|stopPropagation
  >
    <a
      class="note-menu-item"
      href="https://nostter.app/{menuNevent}"
      target="_blank"
      rel="noopener noreferrer"
      on:click={() => (menuOpen = false)}
    >nostterで開く</a>
    <div class="note-menu-item" role="menuitem" on:click={copyNevent}>neventをコピー</div>
  </div>
{/if}

{#if copyToast}
  <div class="copy-toast" aria-live="polite">コピーしました</div>
{/if}

<style>
  .note-card {
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: var(--radius-card);
    padding: 18px;
    margin-bottom: 12px;
    transition: box-shadow 0.15s;
  }

  .note-card:hover {
    box-shadow: 0 4px 16px rgba(249, 115, 22, 0.08);
    border-color: var(--accent-mid);
  }

  .note-num {
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
    background: var(--accent-mid);
    padding: 2px 9px;
    border-radius: var(--radius-btn);
    display: inline-block;
    margin-bottom: 10px;
    font-family: var(--font-ui);
  }

  .note-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 11px;
  }

  .note-meta {
    min-width: 0;
    flex: 1;
  }

  .note-name {
    font-weight: 700;
    font-size: 13px;
    color: var(--ink);
    font-family: var(--font-ui);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .note-pub {
    font-size: 11px;
    color: var(--ink3);
    font-family: monospace;
  }

  .note-time {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 12px;
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
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
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
    font-size: 14px;
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
    font-size: 12px;
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
    font-size: 13px;
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
</style>
