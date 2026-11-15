<script lang="ts" context="module">
  // 閲覧注意の候補のうち、タップして中身を表示したもの。タブを切り替えたり検索し直したりして
  // 候補が作り直されても、追加モーダルを閉じるまではぼかし直さない。
  const cwRevealedIds = new Set<string>();

  /** 追加モーダルを閉じたときに呼ぶ。次に開いたときは、閲覧注意の候補をまたぼかす */
  export function resetCwRevealed(): void {
    cwRevealedIds.clear();
  }
</script>

<script lang="ts">
  import type { Note } from '$lib/types';
  import { profiles, requestProfile } from '$lib/stores/profiles';
  import { formatAbsoluteTime } from '$lib/utils/time';
  import { extractImages, parseNostrRefs, buildEmojiMap } from '$lib/utils/nostrContent';
  import {
    shortNpubFromPubkey,
    resolveReplyParentId,
    contentWarningReason
  } from '$lib/utils/nostr';
  import Avatar from '$lib/components/Avatar.svelte';

  export let note: Note;
  export let selected = false;
  export let onClick: (note: Note) => void;
  // まとめ内ポストの id -> pubkey。候補がまとめ内ポストへの返信なら名前バッジを出す。
  export let matomePostPubkeys: Map<string, string> = new Map();

  $: requestProfile(note.pubkey);
  $: profile = $profiles.get(note.pubkey);
  $: picture = profile?.picture ?? null;
  $: author = profile?.displayName ?? profile?.name ?? shortNpubFromPubkey(note.pubkey);

  // リプライ投稿かどうか（NIP-10 で親がある）。まとめ内に親があれば pubkey を解決。
  $: parentId = resolveReplyParentId(note);
  $: isReply = parentId !== null;
  $: replyToPubkey = parentId ? (matomePostPubkeys.get(parentId) ?? null) : null;
  $: if (replyToPubkey) requestProfile(replyToPubkey);
  $: replyToProfile = replyToPubkey ? $profiles.get(replyToPubkey) : undefined;
  $: replyToName = replyToPubkey
    ? (replyToProfile?.displayName ?? replyToProfile?.name ?? shortNpubFromPubkey(replyToPubkey))
    : '';
  $: parsed = extractImages(note.content);
  $: emojiMap = buildEmojiMap(note.tags);
  $: segments = parseNostrRefs(parsed.text, emojiMap);

  // 閲覧注意（content-warning）の候補は、タップするまで本文と画像をぼかす。
  // 候補全体が「選ぶ」ボタンなので、ぼかしている間だけタップを「表示」として扱う
  // （1 回目のタップで表示、2 回目で選択）。
  $: cwReason = contentWarningReason(note.tags);
  let cwRevealed = cwRevealedIds.has(note.id);
  $: cwHidden = cwReason !== null && !cwRevealed;

  function handleClick(): void {
    if (cwHidden) {
      cwRevealed = true;
      cwRevealedIds.add(note.id);
      return;
    }
    onClick(note);
  }

  function hideOnError(e: Event): void {
    const el = e.currentTarget as HTMLElement;
    const item = el.closest<HTMLElement>('.media-item');
    if (item) item.style.display = 'none';
    else el.style.display = 'none';
  }
</script>

<button class="post" class:selected on:click={handleClick} type="button">
  <div class="check" aria-hidden="true">{selected ? '✓' : ''}</div>
  <div class="post-body">
    <div class="post-header">
      <Avatar pubkey={note.pubkey} {picture} name={author} size={26} />
      <span class="author">{author}</span>
      <span class="time">{formatAbsoluteTime(note.createdAt)}</span>
    </div>
    {#if replyToPubkey}
      <div class="reply-tag in-matome">@{replyToName}</div>
    {:else if isReply}
      <div class="reply-tag">reply</div>
    {/if}
    <div class="cw-wrap">
      <div class="cw-body" class:cw-blurred={cwHidden} aria-hidden={cwHidden || undefined}>
        <div class="content">
          {#each segments as seg}
            {#if seg.type === 'text'}<span class="text-seg">{seg.content}</span>
            {:else if seg.type === 'mention'}@{shortNpubFromPubkey(seg.pubkey)}
            {:else if seg.type === 'url'}<span class="url">{seg.url}</span>
            {:else if seg.type === 'emoji'}<img
                src={seg.url}
                alt=":{seg.shortcode}:"
                class="emoji"
                loading="lazy"
              />
            {:else if seg.type === 'quote'}<span class="ref">nostr:nevent…</span>
            {:else if seg.type === 'naddr'}<span class="ref">nostr:naddr…</span>
            {/if}
          {/each}
        </div>
        {#if parsed.urls.length > 0}
          <div class="images" class:multi={parsed.urls.length > 1}>
            {#each parsed.urls.slice(0, 4) as url, i}
              <div class="media-item">
                <img src={url} alt="" loading="lazy" on:error={hideOnError} />
                {#if i === 3 && parsed.urls.length > 4}
                  <span class="more-badge">+{parsed.urls.length - 3}</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
        {#if parsed.videoUrls.length > 0}
          <div class="images" class:multi={parsed.videoUrls.length > 1}>
            {#each parsed.videoUrls.slice(0, 4) as url, i}
              <div class="media-item">
                <video src={url} controls playsinline on:error={hideOnError}>
                  <track kind="captions" />
                </video>
                {#if i === 3 && parsed.videoUrls.length > 4}
                  <span class="more-badge">+{parsed.videoUrls.length - 3}</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
      {#if cwHidden}
        <div class="cw-overlay">
          <div class="cw-pill">
            <span class="cw-pill-text">⚠️{cwReason ? ' ' + cwReason : ''}</span>
            <span class="cw-hint">タップして表示</span>
          </div>
        </div>
      {/if}
    </div>
  </div>
</button>

<style>
  .post {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    text-align: left;
    width: 100%;
    background: var(--surface);
    border: none;
    border-radius: var(--radius-card);
    padding: 10px 12px;
    cursor: pointer;
    font: inherit;
    color: inherit;
    /* タップ（選択）できる面。 */
    box-shadow: var(--shadow-tappable);
  }

  /* 枠線を外したので、選択中はレイアウトを動かさない outline で示す。 */
  .post.selected {
    outline: 2px solid var(--accent);
    background: var(--accent-pale);
  }

  .check {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    border-radius: 50%;
    border: 1.5px solid var(--border2);
    background: var(--surface);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    color: #fff;
    margin-top: 2px;
  }

  .post.selected .check {
    background: var(--accent);
    border-color: var(--accent);
  }

  .post-body {
    flex: 1;
    min-width: 0;
  }

  .post-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .author {
    flex: 1;
    font-size: 12px;
    font-weight: 700;
    color: var(--ink);
    font-family: var(--font-ui);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .time {
    font-size: 11px;
    color: var(--ink3);
    margin-left: auto;
    flex-shrink: 0;
  }

  /* リプライ投稿は原則表示し、まとめ内への返信だけ文字色を変えて強調する（囲みなし）。 */
  .reply-tag {
    display: inline-flex;
    max-width: 100%;
    margin-bottom: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--ink3);
    font-family: var(--font-ui);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .reply-tag.in-matome {
    color: var(--accent);
  }

  .content {
    font-size: 13px;
    line-height: 1.55;
    color: var(--ink);
    overflow-wrap: anywhere;
    word-break: break-word;
    max-height: 7.5em;
    overflow: hidden;
  }

  .text-seg {
    white-space: pre-wrap;
  }

  .url,
  .ref {
    color: var(--accent);
    word-break: break-all;
  }

  .emoji {
    max-height: 1.55em;
    max-width: 100%;
    vertical-align: top;
    display: inline;
  }

  .images {
    display: grid;
    grid-template-columns: 1fr;
    gap: 4px;
    margin-top: 8px;
  }

  .images.multi {
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

  /* 閲覧注意。見た目は引用（QuotedNote）の閲覧注意に合わせる。
     重ねる注意書きは操作を受けず、タップは候補全体のボタンが受ける。 */
  .cw-wrap {
    position: relative;
  }

  .cw-body .content,
  .cw-body .images {
    transition: filter 0.2s;
  }

  .cw-body.cw-blurred {
    pointer-events: none;
    user-select: none;
    /* 1 行だけの投稿でも、上に重ねる注意書きが収まる高さにする */
    min-height: 56px;
    overflow: hidden;
  }

  .cw-body.cw-blurred .content {
    filter: blur(4px);
  }

  .cw-body.cw-blurred .images {
    filter: blur(30px);
  }

  .cw-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
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
</style>
