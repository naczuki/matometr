<script lang="ts">
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { currentUser } from '$lib/stores/auth';
  import { publishMatome } from '$lib/services/NostrClient';
  import BlockEditor from '$lib/components/BlockEditor.svelte';
  import type { EditorBlock } from '$lib/types';

  let title = '';
  let summary = '';
  let blocks: EditorBlock[] = [];

  $: noteCount = blocks.filter((b) => b.type === 'nevent' && b.nevent).length;
  $: canPublish = title.trim().length > 0 && noteCount > 0;

  let publishing = false;
  let publishError = '';

  async function handlePublish(): Promise<void> {
    if (!canPublish || publishing) return;
    publishing = true;
    publishError = '';
    try {
      const naddr = await publishMatome({ title: title.trim(), summary: summary.trim(), blocks });
      await goto(`${base}/matome/${naddr}`);
    } catch (e) {
      publishError = e instanceof Error ? e.message : '公開に失敗しました';
    } finally {
      publishing = false;
    }
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
    <h1 class="page-title">まとめを作る</h1>

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
      <a href="{base}/" class="btn-cancel">キャンセル</a>
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
    font-size: 22px;
    font-weight: 800;
    color: var(--ink);
    margin: 0 0 20px;
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
