<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { goto, beforeNavigate } from '$app/navigation';
  import { nip19 } from 'nostr-tools';
  import type { AddressPointer } from 'nostr-tools/nip19';
  import { currentUser } from '$lib/stores/auth';
  import { publishMatome, fetchMatomeByAddress } from '$lib/services/NostrClient';
  import BlockEditor from '$lib/components/BlockEditor.svelte';
  import AnnounceModal from '$lib/components/AnnounceModal.svelte';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import type { EditorBlock, MatomeBlock } from '$lib/types';

  let title = '';
  let summary = '';
  let blocks: EditorBlock[] = [];
  let importing = false;

  let initialSnapshot = '';

  function computeSnapshot(): string {
    return JSON.stringify({ title, summary, blocks });
  }

  function checkDirty(): boolean {
    if (initialSnapshot === '') return false;
    return computeSnapshot() !== initialSnapshot;
  }

  let allowNavigate = false;
  let pendingNavUrl: URL | null = null;
  let showLeaveConfirm = false;

  $: noteCount = blocks.filter((b) => b.type === 'nevent' && b.nevent).length;
  $: canPublish = title.trim().length > 0 && noteCount > 0;

  let publishing = false;
  let publishError = '';
  let pendingNaddr = '';
  let showAnnounceModal = false;

  onMount(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);

    const from = $page.url.searchParams.get('from');
    if (!from) {
      initialSnapshot = computeSnapshot();
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }

    try {
      const decoded = nip19.decode(from);
      if (decoded.type !== 'naddr') {
        initialSnapshot = computeSnapshot();
        return () => {
          window.removeEventListener('beforeunload', handleBeforeUnload);
        };
      }
      const pointer = decoded.data as AddressPointer;
      importing = true;
      const sub = fetchMatomeByAddress(pointer).subscribe({
        next: (m) => {
          title = m.title;
          summary = m.summary ?? '';
          blocks = matomeBlocksToEditorBlocks(m.blocks);
          initialSnapshot = computeSnapshot();
        },
        complete: () => { importing = false; },
        error: () => { importing = false; }
      });
      return () => {
        sub.unsubscribe();
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    } catch {
      initialSnapshot = computeSnapshot();
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  });

  function handleBeforeUnload(e: BeforeUnloadEvent): void {
    if (checkDirty() && !publishing) {
      e.preventDefault();
      e.returnValue = '';
    }
  }

  beforeNavigate(({ to, cancel }) => {
    if (allowNavigate || publishing) return;
    if (!checkDirty()) return;
    if (!to) return;
    cancel();
    pendingNavUrl = to.url;
    showLeaveConfirm = true;
  });

  function handleLeaveConfirm(): void {
    showLeaveConfirm = false;
    allowNavigate = true;
    if (pendingNavUrl) {
      const target = pendingNavUrl.pathname + pendingNavUrl.search + pendingNavUrl.hash;
      pendingNavUrl = null;
      goto(target);
    }
  }

  function handleLeaveCancel(): void {
    showLeaveConfirm = false;
    pendingNavUrl = null;
  }

  function handleCancelClick(e: MouseEvent): void {
    e.preventDefault();
    const target = `${base}/`;
    if (checkDirty() && !publishing) {
      pendingNavUrl = new URL(target, window.location.origin);
      showLeaveConfirm = true;
    } else {
      allowNavigate = true;
      goto(target);
    }
  }

  function matomeBlocksToEditorBlocks(matomeBlocks: MatomeBlock[]): EditorBlock[] {
    const result: EditorBlock[] = [];
    for (const b of matomeBlocks) {
      if (b.type === 'nevent') {
        result.push({ id: crypto.randomUUID(), type: 'nevent', nevent: b.content });
      } else if (b.type === 'comment') {
        result.push({ id: crypto.randomUUID(), type: 'comment', text: b.content });
      } else if (b.type === 'heading') {
        result.push({ id: crypto.randomUUID(), type: 'heading', text: b.content });
      } else if (b.type === 'paragraph' && b.content.trim()) {
        result.push({ id: crypto.randomUUID(), type: 'comment', text: b.content });
      }
    }
    return result;
  }

  async function handlePublish(): Promise<void> {
    if (!canPublish || publishing) return;
    publishing = true;
    publishError = '';
    try {
      const naddr = await publishMatome({ title: title.trim(), summary: summary.trim(), blocks });
      pendingNaddr = naddr;
      showAnnounceModal = true;
    } catch (e) {
      publishError = e instanceof Error ? e.message : '公開に失敗しました';
      publishing = false;
    }
  }

  async function onAnnounceDone(): Promise<void> {
    showAnnounceModal = false;
    allowNavigate = true;
    await goto(`${base}/matome/?id=${pendingNaddr}`);
  }
</script>

<svelte:head>
  <title>まとめを作成 | まとめたー</title>
</svelte:head>

{#if !$currentUser}
  <div class="gate">
    <p class="gate-msg">まとめを作成するにはログインが必要です。</p>
    <a href="{base}/" class="btn-back">トップへ戻る</a>
  </div>
{:else}
  <div class="page">
    <h1 class="page-title">{importing ? 'nosliからインポート' : 'まとめを作る'}</h1>

    {#if importing}
      <div class="import-banner">nosliまとめを読み込み中…</div>
    {/if}

    <section class="card">
      <div class="field">
        <label class="field-label" for="title">タイトル</label>
        <input
          id="title"
          class="field-input"
          type="text"
          placeholder="まとめのタイトルを入力"
          bind:value={title}
          maxlength={120}
        />
      </div>
      <div class="field">
        <label class="field-label" for="summary">説明（省略可）</label>
        <textarea
          id="summary"
          class="field-textarea"
          placeholder="このまとめについて簡単に説明してください"
          bind:value={summary}
          rows={3}
        ></textarea>
      </div>
    </section>

    <BlockEditor bind:blocks />

    {#if publishError}
      <p class="publish-error">{publishError}</p>
    {/if}
    <div class="action-bar">
      <a href="{base}/" class="btn-cancel" on:click={handleCancelClick}>キャンセル</a>
      <button
        class="btn-publish"
        disabled={!canPublish || publishing}
        on:click={handlePublish}
      >
        {publishing ? '公開中…' : '公開する'}
      </button>
    </div>
  </div>
{/if}

{#if showAnnounceModal}
  <AnnounceModal naddr={pendingNaddr} {title} isUpdate={false} on:done={onAnnounceDone} />
{/if}

<ConfirmDialog
  open={showLeaveConfirm}
  title="離れると変更が失われます。いいですか？"
  confirmText="はい"
  cancelText="いいえ"
  on:confirm={handleLeaveConfirm}
  on:cancel={handleLeaveCancel}
/>

<style>
  .gate {
    text-align: center;
    padding: 60px 20px;
  }

  .gate-msg {
    color: var(--ink2);
    margin-bottom: 16px;
  }

  .btn-back {
    color: var(--accent);
    font-weight: 700;
    text-decoration: none;
  }

  .page {
    max-width: 720px;
    margin: 0 auto;
    padding: 24px 16px 80px;
  }

  .page-title {
    font-family: var(--font-ui);
    font-size: 20px;
    font-weight: 800;
    color: var(--ink);
    margin: 0 0 20px;
  }

  .import-banner {
    font-size: 13px;
    color: var(--accent-dark);
    background: var(--accent-pale);
    border: 1.5px solid var(--accent-mid);
    border-radius: 10px;
    padding: 10px 14px;
    margin-bottom: 16px;
    font-family: var(--font-ui);
  }

  .card {
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: 16px;
    padding: 18px;
    margin-bottom: 20px;
  }

  .field + .field {
    margin-top: 14px;
  }

  .field-label {
    display: block;
    font-size: 11px;
    font-weight: 700;
    color: var(--ink3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 6px;
  }

  .field-input,
  .field-textarea {
    width: 100%;
    border: 1.5px solid var(--border2);
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 15px;
    color: var(--ink);
    background: var(--bg);
    font-family: var(--font-body);
    box-sizing: border-box;
    transition: border-color 0.12s;
    resize: vertical;
  }

  .field-input:focus,
  .field-textarea:focus {
    outline: none;
    border-color: var(--accent);
  }

  .publish-error {
    font-size: 13px;
    color: #dc2626;
    background: #fff5f5;
    border: 1px solid #fecaca;
    border-radius: 10px;
    padding: 10px 14px;
    margin-bottom: 12px;
  }

  .action-bar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }

  .btn-cancel {
    padding: 10px 20px;
    border: 1.5px solid var(--border2);
    border-radius: var(--radius-btn);
    background: var(--surface);
    color: var(--ink2);
    font-size: 14px;
    font-weight: 600;
    font-family: var(--font-ui);
    cursor: pointer;
    text-decoration: none;
    transition: all 0.12s;
  }

  .btn-cancel:hover {
    border-color: var(--ink2);
    background: var(--bg);
  }

  .btn-publish {
    padding: 10px 24px;
    border: none;
    border-radius: var(--radius-btn);
    background: var(--accent);
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    font-family: var(--font-ui);
    cursor: pointer;
    transition: background 0.12s;
  }

  .btn-publish:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-publish:not(:disabled):hover {
    background: var(--accent-dark);
  }
</style>
