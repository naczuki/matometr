<script lang="ts">
  import ClientLinkEditor from '$lib/components/ClientLinkEditor.svelte';
</script>

<svelte:head>
  <title>設定 | まとめたー</title>
</svelte:head>

<div class="page">
  <h1 class="page-title">設定</h1>
  <p class="page-note">変更はすぐに保存されます。設定はこのブラウザにだけ保存されます。</p>

  <ClientLinkEditor
    kind="share"
    title="シェア先（Nos ボタン）"
    resetTitle="シェア先をデフォルトに戻しますか？"
    urlPlaceholder={'https://example.com/post?text={text}'}
  >
    まとめ画面の「Nos」ボタンで選べるクライアントです。URL の
    <code>{'{text}'}</code> が、シェアする文章（タイトル・まとめの URL など）に置き換わります。
  </ClientLinkEditor>

  <ClientLinkEditor
    kind="open"
    title="投稿メニューの「○○で開く」"
    resetTitle="「○○で開く」をデフォルトに戻しますか？"
    urlPlaceholder={'https://example.com/{nevent}'}
  >
    まとめ内の投稿の日時をタップしたときのメニューに出すクライアントです。URL の
    <code>{'{nevent}'}</code>（nevent1…）・<code>{'{note}'}</code>（note1…）・<code>{'{id}'}</code
    >（16 進のイベント ID）が、その投稿の ID に置き換わります。
  </ClientLinkEditor>
</div>

<style>
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
    margin: 0 0 6px;
  }

  .page-note {
    font-size: 13px;
    color: var(--ink3);
    margin: 0 0 20px;
  }
</style>
