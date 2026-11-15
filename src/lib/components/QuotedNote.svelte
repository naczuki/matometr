<script lang="ts">
  import { onMount } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import { base } from '$app/paths';
  import type { Note } from '$lib/types';
  import { fetchNoteWithHintFallback } from '$lib/services/NostrClient';
  import { profiles, requestProfile } from '$lib/stores/profiles';
  import {
    parseNostrRefs,
    extractImages,
    resolveTagRefs,
    buildEmojiMap
  } from '$lib/utils/nostrContent';
  import {
    shortNpubFromPubkey,
    resolveRepostTarget,
    externalNoteUrl,
    isKind1Comment,
    contentWarningReason
  } from '$lib/utils/nostr';
  import { timeAgo } from '$lib/utils/time';
  import Avatar from '$lib/components/Avatar.svelte';

  export let eventId: string;
  /** リレーヒント（nevent から）。既定リレーに無ければここに問い合わせる。 */
  export let relays: string[] = [];
  export let showDate: boolean = false;
  /** 呼び出し側が既にカードを描いている場合に、入れ子の囲みを外して直接描く。 */
  export let bare: boolean = false;

  let note: Note | null = null;
  let failed = false;

  let repostSub: { unsubscribe(): void } | null = null;
  let resolvingRepost = false;

  // 既定リレー → リレーヒントの順に探す（段ごとに上限時間があり必ず complete する）。
  onMount(() => {
    const sub = fetchNoteWithHintFallback(eventId, relays).subscribe({
      next: ({ note: n }) => {
        const repost = resolveRepostTarget(n);
        if (repost) {
          resolvingRepost = true;
          repostSub = fetchNoteWithHintFallback(
            repost.eventId,
            repost.relay ? [repost.relay] : undefined
          ).subscribe({
            next: ({ note: original }) => {
              note = original;
              requestProfile(original.pubkey);
            },
            error: () => {
              failed = true;
            },
            complete: () => {
              if (!note) failed = true;
            }
          });
          return;
        }
        if (n.kind === 1111 && !isKind1Comment(n)) {
          failed = true;
          return;
        }
        note = n;
        requestProfile(n.pubkey);
      },
      error: () => {
        failed = true;
      },
      complete: () => {
        if (!note && !resolvingRepost) failed = true;
      }
    });
    return () => {
      sub.unsubscribe();
      repostSub?.unsubscribe();
    };
  });

  $: profile = note ? $profiles.get(note.pubkey) : undefined;
  $: authorName = profile?.displayName ?? profile?.name ?? shortNpubFromPubkey(note?.pubkey ?? '');
  $: picture = profile?.picture ?? null;

  $: emojiMap = note ? buildEmojiMap(note.tags) : new Map<string, string>();

  let failedEmojis: Set<string> = new Set();
  function onEmojiError(shortcode: string): void {
    failedEmojis = new Set([...failedEmojis, shortcode]);
  }

  $: ({
    text: parsedText,
    urls: imageUrls,
    videoUrls
  } = note
    ? extractImages(resolveTagRefs(note.content, note.tags))
    : { text: '', urls: [], videoUrls: [] });
  $: segments = parseNostrRefs(parsedText, emojiMap);

  function hideMediaOnError(e: Event): void {
    const el = e.currentTarget as HTMLElement;
    const item = el.closest<HTMLElement>('.media-item');
    if (item) item.style.display = 'none';
    else el.style.display = 'none';
  }

  $: for (const seg of segments) {
    if (seg.type === 'mention') requestProfile(seg.pubkey);
  }

  // 閲覧注意（NIP-36 の content-warning タグ）。NoteCard と同じく、タップするまで本文をぼかす。
  $: cwReason = note ? contentWarningReason(note.tags) : null;
  $: hasCw = cwReason !== null;
  let cwRevealed = false;

  function truncateName(name: string, max = 30): string {
    return name.length > max ? name.slice(0, max) + '…' : name;
  }

  function shortRef(encoded: string): string {
    return encoded.slice(0, 14) + '…';
  }

  function safeNeventEncode(id: string): string {
    try {
      return nip19.neventEncode({ id });
    } catch {
      return '';
    }
  }
</script>

<div class="quoted" class:bare>
  {#if failed}
    <div class="quoted-error">この投稿が見つかりませんでした</div>
  {:else if !note}
    <span class="quoted-state">取得中…</span>
  {:else}
    <div class="quoted-header">
      <Avatar pubkey={note.pubkey} {picture} name={authorName} size={20} />
      <span class="quoted-name">{authorName}</span>
      {#if showDate && note}
        <span class="quoted-date">{timeAgo(note.createdAt)}</span>
      {/if}
    </div>
    <div class="cw-wrap">
      <div class="quoted-body" class:cw-blurred={hasCw && !cwRevealed}>
        <div class="quoted-content">
          {#each segments as segment}
            {#if segment.type === 'text'}
              <span class="text-seg">{segment.content}</span>
            {:else if segment.type === 'mention'}
              {@const mp = $profiles.get(segment.pubkey)}
              <a class="mention-link" href="{base}/{nip19.npubEncode(segment.pubkey)}">
                @{truncateName(mp?.displayName ?? mp?.name ?? shortNpubFromPubkey(segment.pubkey))}
              </a>
            {:else if segment.type === 'quote'}
              {@const ne = safeNeventEncode(segment.eventId)}
              {#if ne}
                <a
                  class="quote-ref-link"
                  href={externalNoteUrl(ne)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  nostr:{shortRef(ne)}
                </a>
              {/if}
            {:else if segment.type === 'naddr'}
              <a class="naddr-link" href="{base}/{segment.naddr}" rel="noopener noreferrer">
                nostr:{shortRef(segment.naddr)}
              </a>
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
            {:else if segment.type === 'url'}
              <a class="naddr-link" href={segment.url} target="_blank" rel="noopener noreferrer"
                >{segment.url}</a
              >
            {/if}
          {/each}
        </div>
        {#if imageUrls.length > 0}
          <div class="media-grid" class:multi={imageUrls.length > 1}>
            {#each imageUrls.slice(0, 4) as url, i}
              <div class="media-item">
                <img src={url} alt="" loading="lazy" on:error={hideMediaOnError} />
                {#if i === 3 && imageUrls.length > 4}
                  <span class="more-badge">+{imageUrls.length - 3}</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
        {#if videoUrls.length > 0}
          <div class="media-grid" class:multi={videoUrls.length > 1}>
            {#each videoUrls.slice(0, 4) as url, i}
              <div class="media-item">
                <video src={url} controls playsinline on:error={hideMediaOnError}>
                  <track kind="captions" />
                </video>
                {#if i === 3 && videoUrls.length > 4}
                  <span class="more-badge">+{videoUrls.length - 3}</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

      {#if hasCw && !cwRevealed}
        <div
          class="cw-overlay"
          role="button"
          tabindex="0"
          on:click|stopPropagation={() => (cwRevealed = true)}
          on:keydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              cwRevealed = true;
            }
          }}
        >
          <div class="cw-pill">
            <span class="cw-pill-text">⚠️{cwReason ? ' ' + cwReason : ''}</span>
            <span class="cw-hint">タップして表示</span>
          </div>
        </div>
      {/if}
    </div>

    {#if hasCw && cwRevealed}
      <div class="cw-hide-wrap">
        <button
          type="button"
          class="cw-hide-btn"
          on:click|stopPropagation={() => (cwRevealed = false)}>隠す</button
        >
      </div>
    {/if}
  {/if}
</div>

<style>
  /* 引用は他人の投稿を持ち込んだ異物で、カードの中に入れ子になる。
     入れ子だと影が重なって濁るためシャドウは使わず、角丸と暖色の枠線で区別する。
     周囲が 2px なので、ここだけ角丸を残すのは意図的（統一しないこと）。 */
  .quoted {
    display: block;
    border: 1.5px solid var(--border-warm);
    border-radius: 14px;
    padding: 10px 14px;
    margin: 6px 0;
    background: var(--bg);
  }

  /* 編集画面のように呼び出し側自身がカードを描いている場合は、囲みが二重に
     なるので外し、カードへ直接描く。 */
  .quoted.bare {
    border: none;
    border-radius: 0;
    padding: 0;
    margin: 0;
    background: none;
  }

  .quoted-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 5px;
    min-width: 0;
  }

  .quoted-name {
    flex: 1;
    font-size: 14px;
    font-weight: 700;
    color: var(--ink);
    font-family: var(--font-ui);
    display: inline-block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .quoted-date {
    margin-left: auto;
    font-size: 12px;
    color: var(--ink3);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .quoted-content {
    font-size: 14px;
    color: var(--ink2);
    line-height: 1.7;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .text-seg {
    white-space: pre-wrap;
  }

  .emoji-img {
    max-height: 1.7em;
    max-width: 100%;
    vertical-align: top;
    display: inline;
  }

  .mention-link,
  .quote-ref-link,
  .naddr-link {
    color: var(--accent);
    text-decoration: none;
    font-size: 14px;
  }

  .mention-link {
    font-weight: 600;
    font-size: inherit;
  }

  .mention-link:hover,
  .quote-ref-link:hover,
  .naddr-link:hover {
    text-decoration: underline;
  }

  .media-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 4px;
    margin-top: 8px;
  }

  .media-grid.multi {
    grid-template-columns: 1fr 1fr;
  }

  .media-item {
    position: relative;
  }

  .media-item img,
  .media-item video {
    width: 100%;
    max-height: 180px;
    object-fit: cover;
    border-radius: 8px;
    display: block;
  }

  .more-badge {
    position: absolute;
    bottom: 6px;
    right: 6px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 12px;
    border-radius: 4px;
    padding: 2px 6px;
    font-family: var(--font-ui);
    line-height: 1.4;
    pointer-events: none;
  }

  /* 閲覧注意。見た目は NoteCard の閲覧注意に合わせ、引用の大きさに合わせて小さくしている。
     「タップして表示」は、文字だけの投稿（明るい背景）でも読めるよう、注意書きの中に入れる。 */
  .cw-wrap {
    position: relative;
  }

  .quoted-body .quoted-content,
  .quoted-body .media-grid {
    transition: filter 0.2s;
  }

  .quoted-body.cw-blurred {
    pointer-events: none;
    user-select: none;
    /* 1 行だけの投稿でも、上に重ねる注意書きが収まる高さにする */
    min-height: 64px;
    overflow: hidden;
  }

  .quoted-body.cw-blurred .quoted-content {
    filter: blur(4px);
  }

  .quoted-body.cw-blurred .media-grid {
    filter: blur(30px);
  }

  .cw-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 1;
  }

  .cw-pill {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    background: rgba(0, 0, 0, 0.5);
    padding: 5px 16px;
    border-radius: 14px;
    max-width: 90%;
    overflow: hidden;
  }

  .cw-pill-text {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    max-height: calc(1.5em * 2);
    color: #fff;
    font-size: 12px;
    line-height: 1.5;
    font-family: var(--font-ui);
    font-weight: 600;
    text-align: center;
    word-break: break-word;
  }

  .cw-hint {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.85);
    font-family: var(--font-ui);
    font-weight: 600;
    line-height: 1.4;
  }

  .cw-hide-wrap {
    display: flex;
    justify-content: center;
    margin-top: 8px;
  }

  .cw-hide-btn {
    background: var(--bg);
    border: 1.5px solid var(--border2);
    border-radius: var(--radius-btn);
    padding: 5px 18px;
    font-size: 12px;
    font-family: var(--font-ui);
    font-weight: 600;
    color: var(--ink2);
    cursor: pointer;
    transition: background 0.12s;
  }

  .cw-hide-btn:hover {
    background: var(--accent-pale);
  }

  .quoted-error {
    font-size: 12px;
    color: var(--ink3);
    font-family: var(--font-ui);
  }

  .quoted-state {
    font-size: 12px;
    color: var(--ink3);
    font-style: italic;
    font-family: var(--font-ui);
  }
</style>
