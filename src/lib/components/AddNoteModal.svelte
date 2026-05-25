<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import { parseNostrInput, eventIdFromNevent, resolveRepostTarget } from '$lib/utils/nostr';
  import { fetchNoteById } from '$lib/services/NostrClient';
  import { DEFAULT_RELAYS_JP } from '$lib/stores/relays';
  import FollowingFeedTab from '$lib/components/FollowingFeedTab.svelte';
  import FavoritesFeedTab from '$lib/components/FavoritesFeedTab.svelte';
  import SearchFeedTab from '$lib/components/SearchFeedTab.svelte';
  import QuotedNote from '$lib/components/QuotedNote.svelte';

  export let open = false;

  type Tab = 'paste' | 'following' | 'favorites' | 'search';
  let activeTab: Tab = 'paste';

  type Pending = { eventId: string; nevent: string };
  let pending: Pending[] = [];
  let pasteLoading = false;

  $: selectedIds = new Set(pending.map((p) => p.eventId));

  let pasteInput = '';
  let pasteError = '';

  const dispatch = createEventDispatcher<{ add: { nevents: string[] }; close: void }>();

  function close(): void {
    pending = [];
    pasteInput = '';
    pasteError = '';
    activeTab = 'paste';
    dispatch('close');
  }

  function handleOverlay(e: MouseEvent): void {
    if (e.target === e.currentTarget) close();
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }

  function toggleSelection(eventId: string, nevent: string): void {
    const idx = pending.findIndex((p) => p.eventId === eventId);
    if (idx >= 0) pending = pending.filter((_, i) => i !== idx);
    else pending = [...pending, { eventId, nevent }];
  }

  function parsePasteInput(raw: string): { eventId: string; nevent: string } | null {
    const nevent = parseNostrInput(raw);
    if (!nevent) return null;
    const eventId = eventIdFromNevent(nevent);
    if (!eventId) return null;
    return { eventId, nevent };
  }

  async function addPaste(): Promise<void> {
    pasteError = '';
    const parsed = parsePasteInput(pasteInput);
    if (!parsed) {
      pasteError = 'nevent1 / note1 / URL を入力してください';
      return;
    }
    if (selectedIds.has(parsed.eventId)) {
      pasteError = '同じ投稿は既に追加されています';
      return;
    }

    pasteLoading = true;
    try {
      const note = await new Promise<import('$lib/types').Note | null>((resolve) => {
        let done = false;
        const sub = fetchNoteById(parsed.eventId).subscribe({
          next: (n) => { if (!done) { done = true; sub.unsubscribe(); resolve(n); } },
          error: () => { if (!done) { done = true; resolve(null); } },
          complete: () => { if (!done) { done = true; resolve(null); } }
        });
        setTimeout(() => { if (!done) { done = true; sub.unsubscribe(); resolve(null); } }, 8_000);
      });

      if (note) {
        const repost = resolveRepostTarget(note);
        if (repost) {
          if (selectedIds.has(repost.eventId)) {
            pasteError = '同じ投稿は既に追加されています';
            pasteLoading = false;
            return;
          }
          const nevent = `nostr:${nip19.neventEncode({ id: repost.eventId, relays: repost.relay ? [repost.relay] : [DEFAULT_RELAYS_JP[0]] })}`;
          pending = [...pending, { eventId: repost.eventId, nevent }];
          pasteInput = '';
          pasteLoading = false;
          return;
        }
        if (note.kind === 1111) {
          pasteError = 'この種類のイベント（コメント）はまとめに追加できません';
          pasteLoading = false;
          return;
        }
      }
    } catch {
      // fetch failed - add as-is
    }

    pending = [...pending, parsed];
    pasteInput = '';
    pasteLoading = false;
  }

  function removePending(eventId: string): void {
    pending = pending.filter((p) => p.eventId !== eventId);
  }

  function commit(): void {
    if (pending.length === 0) return;
    dispatch('add', { nevents: pending.map((p) => p.nevent) });
    pending = [];
    pasteInput = '';
    pasteError = '';
    activeTab = 'paste';
  }
</script>

{#if open}
  <div
    class="overlay"
    role="presentation"
    on:click={handleOverlay}
    on:keydown={handleKeydown}
  >
    <div class="modal" role="dialog" aria-modal="true" aria-label="投稿を追加">
      <header class="head">
        <h2 class="title">投稿を追加</h2>
        <button class="close" on:click={close} aria-label="閉じる" type="button">×</button>
      </header>

      <div class="tabs" role="tablist">
        <button
          class="tab"
          class:active={activeTab === 'paste'}
          role="tab"
          aria-selected={activeTab === 'paste'}
          on:click={() => (activeTab = 'paste')}
          type="button"
        >ID</button>
        <button
          class="tab"
          class:active={activeTab === 'following'}
          role="tab"
          aria-selected={activeTab === 'following'}
          on:click={() => (activeTab = 'following')}
          type="button"
        >フォロー</button>
        <button
          class="tab"
          class:active={activeTab === 'favorites'}
          role="tab"
          aria-selected={activeTab === 'favorites'}
          on:click={() => (activeTab = 'favorites')}
          type="button"
        >お気に入り</button>
        <button
          class="tab"
          class:active={activeTab === 'search'}
          role="tab"
          aria-selected={activeTab === 'search'}
          on:click={() => (activeTab = 'search')}
          type="button"
        >検索</button>
      </div>

      <div class="body">
        {#if activeTab === 'paste'}
          <div class="paste-area">
            <label class="paste-label" for="paste-input">投稿の URL / nevent1 / note1 を貼り付け</label>
            <div class="paste-row">
              <input
                id="paste-input"
                class="paste-input"
                type="text"
                bind:value={pasteInput}
                on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPaste(); } }}
                placeholder="nostr:nevent1… または note1…"
              />
              <button class="add-paste-btn" type="button" disabled={pasteLoading} on:click={addPaste}>{pasteLoading ? '確認中…' : '追加'}</button>
            </div>
            {#if pasteError}
              <p class="paste-error">{pasteError}</p>
            {/if}
          </div>
        {:else if activeTab === 'following'}
          <FollowingFeedTab {selectedIds} onToggle={toggleSelection} />
        {:else if activeTab === 'favorites'}
          <FavoritesFeedTab {selectedIds} onToggle={toggleSelection} />
        {:else}
          <SearchFeedTab {selectedIds} onToggle={toggleSelection} />
        {/if}
      </div>

      {#if pending.length > 0}
        <div class="pending">
          <div class="pending-label">選択中（{pending.length}件）</div>
          <div class="pending-list">
            {#each pending as item (item.eventId)}
              <div class="pending-card">
                <QuotedNote eventId={item.eventId} />
                <button class="pending-remove" on:click={() => removePending(item.eventId)} type="button" aria-label="削除">×</button>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <footer class="foot">
        <button class="cancel-btn" on:click={close} type="button">キャンセル</button>
        <button class="commit-btn" on:click={commit} disabled={pending.length === 0} type="button">
          まとめに追加{pending.length > 0 ? ` (${pending.length}件)` : ''}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .modal {
    background: var(--surface);
    border-radius: 18px;
    width: 100%;
    max-width: 640px;
    max-height: calc(100vh - 32px);
    max-height: calc(100svh - 32px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px 0;
    flex-shrink: 0;
  }

  .title {
    font-family: var(--font-ui);
    font-size: 16px;
    font-weight: 800;
    color: var(--ink);
    margin: 0;
  }

  .close {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--ink3);
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
  }

  .close:hover {
    background: var(--bg);
    color: var(--ink);
  }

  .tabs {
    display: flex;
    gap: 2px;
    padding: 8px 18px 0;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .tab {
    background: transparent;
    border: none;
    padding: 10px 12px;
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 700;
    color: var(--ink3);
    cursor: pointer;
    border-bottom: 3px solid transparent;
    margin-bottom: -1px;
    transition: color 0.12s, border-color 0.12s;
    white-space: nowrap;
  }

  .tab:hover {
    color: var(--ink);
  }

  .tab.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px 18px 0;
  }

  .paste-area {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-bottom: 16px;
  }

  .paste-label {
    font-size: 12px;
    font-weight: 700;
    color: var(--ink3);
    font-family: var(--font-ui);
  }

  .paste-row {
    display: flex;
    gap: 6px;
  }

  .paste-input {
    flex: 1;
    min-width: 0;
    padding: 10px 12px;
    border: 1.5px solid var(--border2);
    border-radius: 10px;
    font-size: 14px;
    color: var(--ink);
    background: var(--bg);
    font-family: var(--font-body);
    box-sizing: border-box;
  }

  .paste-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .add-paste-btn {
    padding: 0 16px;
    background: var(--surface);
    border: 1.5px solid var(--accent-mid);
    border-radius: 10px;
    color: var(--accent-dark);
    font-family: var(--font-ui);
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .add-paste-btn:hover {
    background: var(--accent-pale);
    border-color: var(--accent);
  }

  .paste-error {
    margin: 4px 0 0;
    font-size: 12px;
    color: #dc2626;
  }

  .pending {
    border-top: 1px solid var(--border);
    padding: 10px 18px;
    background: var(--bg);
    max-height: 30vh;
    overflow-y: auto;
    flex-shrink: 0;
  }

  .pending-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--ink3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 6px;
    font-family: var(--font-ui);
  }

  .pending-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .pending-card {
    position: relative;
  }

  .pending-remove {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1px solid var(--border2);
    background: var(--surface);
    color: var(--ink3);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .pending-remove:hover {
    border-color: #dc2626;
    color: #dc2626;
  }

  .foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 18px;
    border-top: 1px solid var(--border);
    background: var(--surface);
    flex-shrink: 0;
  }

  .cancel-btn {
    padding: 9px 18px;
    background: var(--surface);
    border: 1.5px solid var(--border2);
    border-radius: var(--radius-btn);
    color: var(--ink2);
    font-family: var(--font-ui);
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
  }

  .cancel-btn:hover {
    background: var(--bg);
  }

  .commit-btn {
    padding: 9px 20px;
    border: none;
    border-radius: var(--radius-btn);
    background: var(--accent);
    color: #fff;
    font-family: var(--font-ui);
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
  }

  .commit-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .commit-btn:not(:disabled):hover {
    background: var(--accent-dark);
  }
</style>
