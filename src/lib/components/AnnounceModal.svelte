<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import { DEFAULT_RELAYS } from '$lib/stores/relays';
  import { publishAnnouncement } from '$lib/services/NostrClient';

  export let naddr: string;
  export let title: string;
  export let isUpdate: boolean;

  const dispatch = createEventDispatcher<{ done: void }>();

  const naddrWithRelays = (() => {
    try {
      const decoded = nip19.decode(naddr);
      if (decoded.type === 'naddr') {
        return nip19.naddrEncode({ ...decoded.data, relays: [DEFAULT_RELAYS[0]] });
      }
    } catch { /* ignore */ }
    return naddr;
  })();

  const verb = isUpdate ? '更新' : '作成';
  const matomeUrl = `https://naczuki.github.io/matometr/matome/${naddr}`;
  const naddrLine = `nostr:${naddrWithRelays}`;
  const defaultBody = `まとめ「${title}」を${verb}しました！\n#まとめたー`;

  let step: 1 | 2 = 1;
  let body = defaultBody;
  let includeUrl = true;
  let includeNaddr = true;
  let text = buildText(body, includeUrl, includeNaddr);
  let posting = false;
  let postError = '';

  function buildText(b: string, url: boolean, na: boolean): string {
    const parts = [b];
    if (url) parts.push(matomeUrl);
    if (na) parts.push(naddrLine);
    return parts.join('\n');
  }

  function extractBody(full: string): string {
    let result = full;
    if (includeNaddr && result.endsWith('\n' + naddrLine))
      result = result.slice(0, -('\n' + naddrLine).length);
    if (includeUrl && result.endsWith('\n' + matomeUrl))
      result = result.slice(0, -('\n' + matomeUrl).length);
    return result;
  }

  function onTextInput(e: Event): void {
    const val = (e.target as HTMLTextAreaElement).value;
    text = val;
    body = extractBody(val);
  }

  function onUrlChange(): void {
    text = buildText(body, includeUrl, includeNaddr);
  }

  function onNaddrChange(): void {
    text = buildText(body, includeUrl, includeNaddr);
  }

  async function handlePost(): Promise<void> {
    if (posting) return;
    posting = true;
    postError = '';
    try {
      await publishAnnouncement(text);
      dispatch('done');
    } catch (e) {
      postError = e instanceof Error ? e.message : '投稿に失敗しました';
      posting = false;
    }
  }

  function handleNo(): void {
    dispatch('done');
  }

  function handleCancel(): void {
    dispatch('done');
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-interactive-supports-focus -->
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div class="overlay" role="dialog" aria-modal="true" on:click|self={handleNo}>
  <div class="modal">
    {#if step === 1}
      <p class="modal-msg">Nostrにお知らせを投稿しますか？</p>
      <div class="modal-btns modal-btns--center">
        <button class="btn-publish" on:click={() => (step = 2)}>はい</button>
        <button class="btn-cancel" on:click={handleNo}>いいえ</button>
      </div>
    {:else}
      <label class="field-label" for="announce-text">投稿テキスト</label>
      <textarea
        id="announce-text"
        class="announce-textarea"
        value={text}
        on:input={onTextInput}
        rows={7}
      ></textarea>
      <div class="checkbox-row">
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={includeUrl} on:change={onUrlChange} />
          URLを含める
        </label>
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={includeNaddr} on:change={onNaddrChange} />
          naddrを含める
        </label>
      </div>
      {#if postError}
        <p class="post-error">{postError}</p>
      {/if}
      <div class="modal-btns modal-btns--end">
        <button class="btn-cancel" on:click={handleCancel} disabled={posting}>キャンセル</button>
        <button class="btn-publish" on:click={handlePost} disabled={posting || !text.trim()}>
          {posting ? '投稿中…' : '投稿'}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .modal {
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: 16px;
    padding: 24px;
    width: 100%;
    max-width: 480px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16);
  }

  .modal-msg {
    font-size: 15px;
    font-family: var(--font-ui);
    font-weight: 600;
    color: var(--ink);
    margin: 0 0 20px;
    text-align: center;
  }

  .field-label {
    display: block;
    font-size: 11px;
    font-weight: 700;
    color: var(--ink3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 8px;
    font-family: var(--font-ui);
  }

  .announce-textarea {
    width: 100%;
    border: 1.5px solid var(--border2);
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 13px;
    color: var(--ink);
    background: var(--bg);
    font-family: var(--font-body);
    box-sizing: border-box;
    resize: vertical;
    transition: border-color 0.12s;
    margin-bottom: 10px;
    line-height: 1.7;
  }

  .announce-textarea:focus {
    outline: none;
    border-color: var(--accent);
  }

  .checkbox-row {
    display: flex;
    gap: 16px;
    margin-bottom: 14px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--ink2);
    font-family: var(--font-ui);
    cursor: pointer;
    user-select: none;
  }

  .checkbox-label input[type='checkbox'] {
    accent-color: var(--accent);
    width: 15px;
    height: 15px;
    cursor: pointer;
  }

  .post-error {
    font-size: 13px;
    color: #dc2626;
    background: #fff5f5;
    border: 1px solid #fecaca;
    border-radius: 8px;
    padding: 8px 12px;
    margin-bottom: 12px;
  }

  .modal-btns {
    display: flex;
    gap: 10px;
  }

  .modal-btns--center {
    justify-content: center;
  }

  .modal-btns--end {
    justify-content: flex-end;
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

  .btn-cancel:hover:not(:disabled) {
    border-color: var(--ink2);
    background: var(--bg);
  }

  .btn-cancel:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
