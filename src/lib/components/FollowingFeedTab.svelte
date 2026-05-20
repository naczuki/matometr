<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import type { Subscription } from 'rxjs';
  import type { Note } from '$lib/types';
  import {
    fetchFollowList,
    fetchUserReadRelays,
    fetchNotesFromAuthors
  } from '$lib/services/NostrClient';
  import { currentUser } from '$lib/stores/auth';
  import { profiles, requestProfile } from '$lib/stores/profiles';
  import { avatarStyle } from '$lib/utils/avatar';
  import { timeAgo } from '$lib/utils/time';
  import { extractImages, parseNostrRefs, isSafeUrl } from '$lib/utils/nostrContent';
  import Spinner from '$lib/components/Spinner.svelte';

  export let selectedIds: Set<string>;
  export let onToggle: (eventId: string, nevent: string) => void;

  let initLoading = true;
  let loadMoreLoading = false;
  let initError = '';
  let notes: Note[] = [];
  let authors: string[] = [];
  let readRelays: string[] = [];
  let oldestAt: number | null = null;
  let reachedEnd = false;
  let activeSub: Subscription | null = null;

  const noteById = new Map<string, Note>();

  function addNotes(incoming: Note[]): void {
    let added = false;
    for (const n of incoming) {
      if (!noteById.has(n.id)) {
        noteById.set(n.id, n);
        added = true;
      }
    }
    if (added) {
      notes = [...noteById.values()].sort((a, b) => b.createdAt - a.createdAt);
      oldestAt = notes[notes.length - 1]?.createdAt ?? oldestAt;
      const pubkeys = new Set(notes.map((n) => n.pubkey));
      for (const pk of pubkeys) requestProfile(pk);
    }
  }

  function startFetch(until?: number): Promise<void> {
    return new Promise((resolve) => {
      const batch: Note[] = [];
      activeSub?.unsubscribe();
      activeSub = fetchNotesFromAuthors(authors, {
        until,
        limit: 30,
        relays: readRelays
      }).subscribe({
        next: (n) => batch.push(n),
        complete: () => {
          addNotes(batch);
          if (batch.length === 0) reachedEnd = true;
          resolve();
        },
        error: () => resolve()
      });
    });
  }

  onMount(async () => {
    const user = $currentUser;
    if (!user) {
      initError = 'ログインが必要です';
      initLoading = false;
      return;
    }

    const [follows, relays] = await Promise.all([
      collect<string[]>(fetchFollowList(user.pubkey), []),
      collect<string[]>(fetchUserReadRelays(user.pubkey), [])
    ]);

    if (follows.length === 0) {
      initError = 'フォロー中のユーザーが見つかりません';
      initLoading = false;
      return;
    }

    authors = follows;
    readRelays = relays;
    await startFetch();
    initLoading = false;
  });

  onDestroy(() => activeSub?.unsubscribe());

  function collect<T>(obs: { subscribe: (o: { next: (v: T) => void; complete: () => void; error: () => void }) => Subscription }, fallback: T): Promise<T> {
    return new Promise((resolve) => {
      let value: T = fallback;
      const sub = obs.subscribe({
        next: (v) => (value = v),
        complete: () => { sub.unsubscribe(); resolve(value); },
        error: () => { sub.unsubscribe(); resolve(value); }
      });
      setTimeout(() => { sub.unsubscribe(); resolve(value); }, 8000);
    });
  }

  async function loadMore(): Promise<void> {
    if (loadMoreLoading || reachedEnd || oldestAt == null) return;
    loadMoreLoading = true;
    await startFetch(oldestAt - 1);
    loadMoreLoading = false;
  }

  function neventFor(note: Note): string {
    const relays = readRelays.length > 0 ? readRelays.slice(0, 1) : undefined;
    return `nostr:${nip19.neventEncode({ id: note.id, relays, author: note.pubkey })}`;
  }

  function toggle(note: Note): void {
    onToggle(note.id, neventFor(note));
  }

  function shortNpub(pubkey: string): string {
    try {
      const npub = nip19.npubEncode(pubkey);
      return npub.slice(0, 10) + '…';
    } catch {
      return pubkey.slice(0, 8) + '…';
    }
  }

  function truncateName(name: string, max = 30): string {
    return name.length > max ? name.slice(0, max) + '…' : name;
  }

  function buildEmojiMap(note: Note): Map<string, string> {
    const m = new Map<string, string>();
    for (const tag of note.tags) {
      if (tag[0] === 'emoji' && tag[1] && tag[2] && isSafeUrl(tag[2])) m.set(tag[1], tag[2]);
    }
    return m;
  }

  function hideOnError(e: Event): void {
    (e.currentTarget as HTMLElement).style.display = 'none';
  }
</script>

{#if initLoading}
  <div class="state">
    <Spinner />
    <div class="state-text">読み込み中…</div>
  </div>
{:else if initError}
  <div class="state">
    <div class="state-text">{initError}</div>
  </div>
{:else if notes.length === 0}
  <div class="state">
    <div class="state-text">表示できる投稿がありません</div>
  </div>
{:else}
  <div class="feed">
    {#each notes as note (note.id)}
      {@const profile = $profiles.get(note.pubkey)}
      {@const author = profile?.displayName ?? profile?.name ?? shortNpub(note.pubkey)}
      {@const style = avatarStyle(note.pubkey)}
      {@const picture = profile?.picture}
      {@const parsed = extractImages(note.content)}
      {@const emojiMap = buildEmojiMap(note)}
      {@const segments = parseNostrRefs(parsed.text, emojiMap)}
      {@const selected = selectedIds.has(note.id)}
      <button
        class="post"
        class:selected
        on:click={() => toggle(note)}
        type="button"
      >
        <div class="check" aria-hidden="true">{selected ? '✓' : ''}</div>
        <div class="post-body">
          <div class="post-header">
            <div class="avatar" style="background:{style.bg};color:{style.fg};">
              {#if picture}
                <img src={picture} alt="" on:error={hideOnError} />
              {:else}
                {style.initial}
              {/if}
            </div>
            <span class="author">{truncateName(author)}</span>
            <span class="time">{timeAgo(note.createdAt)}</span>
          </div>
          <div class="content">
            {#each segments as seg}
              {#if seg.type === 'text'}<span class="text-seg">{seg.content}</span>
              {:else if seg.type === 'mention'}@{shortNpub(seg.pubkey)}
              {:else if seg.type === 'url'}<span class="url">{seg.url}</span>
              {:else if seg.type === 'emoji'}<img src={seg.url} alt=":{seg.shortcode}:" class="emoji" loading="lazy" />
              {:else if seg.type === 'quote'}<span class="ref">nostr:nevent…</span>
              {:else if seg.type === 'naddr'}<span class="ref">nostr:naddr…</span>
              {/if}
            {/each}
          </div>
          {#if parsed.urls.length > 0}
            <div class="images" class:multi={parsed.urls.length > 1}>
              {#each parsed.urls.slice(0, 4) as url}
                <img src={url} alt="" loading="lazy" on:error={hideOnError} />
              {/each}
            </div>
          {/if}
        </div>
      </button>
    {/each}

    {#if !reachedEnd}
      <button class="load-more" on:click={loadMore} disabled={loadMoreLoading}>
        {loadMoreLoading ? '読み込み中…' : 'もっと読み込む'}
      </button>
    {/if}
  </div>
{/if}

<style>
  .state {
    text-align: center;
    padding: 40px 16px;
  }

  .state-text {
    font-size: 13px;
    color: var(--ink3);
    font-family: var(--font-ui);
  }

  .feed {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .post {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    text-align: left;
    width: 100%;
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: 12px;
    padding: 10px 12px;
    cursor: pointer;
    font: inherit;
    color: inherit;
    transition: border-color 0.12s, background 0.12s;
  }

  .post:hover {
    border-color: var(--accent-mid);
  }

  .post.selected {
    border-color: var(--accent);
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

  .avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    flex-shrink: 0;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    font-family: var(--font-ui);
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .author {
    font-size: 12px;
    font-weight: 700;
    color: var(--ink);
    font-family: var(--font-ui);
    overflow-wrap: anywhere;
    word-break: break-word;
    min-width: 0;
  }

  .time {
    font-size: 11px;
    color: var(--ink3);
    margin-left: auto;
    flex-shrink: 0;
  }

  .content {
    font-size: 13px;
    line-height: 1.55;
    color: var(--ink);
    overflow-wrap: anywhere;
    word-break: break-word;
    max-height: 7.5em;
    overflow: hidden;
    position: relative;
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
    height: 1.2em;
    width: auto;
    vertical-align: middle;
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

  .images img {
    width: 100%;
    max-height: 180px;
    object-fit: cover;
    border-radius: 8px;
    display: block;
  }

  .load-more {
    background: var(--surface);
    border: 1.5px dashed var(--accent-mid);
    color: var(--accent-dark);
    font-family: var(--font-ui);
    font-weight: 700;
    font-size: 13px;
    padding: 10px 20px;
    border-radius: 999px;
    cursor: pointer;
    align-self: center;
    margin: 8px auto 0;
    transition: all 0.12s;
  }

  .load-more:hover:not(:disabled) {
    border-color: var(--accent);
    background: var(--accent-pale);
  }

  .load-more:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
