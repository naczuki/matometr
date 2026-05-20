<script lang="ts">
  export let naddr: string;
  export let avatarInitial: string;
  export let avatarBg: string;
  export let avatarFg: string;
  export let authorName: string;
  export let timeAgo: string;
  export let title: string;
  export let preview: string;
  export let postCount: number;
  export let tag: string;
  export let likes: number;
</script>

<a href="/matome/{naddr}" class="card">
  <div class="author">
    <div class="avatar" style="background:{avatarBg};color:{avatarFg};">{avatarInitial}</div>
    <span class="author-name">{authorName}</span>
    <span class="time">{timeAgo}</span>
  </div>
  <div class="title">{title}</div>
  <div class="preview">{preview}</div>
  <div class="footer">
    <span class="count">{postCount}件の投稿</span>
    <span class="tag">#{tag}</span>
    <span class="likes">♡ {likes}</span>
  </div>
</a>

<style>
  .card {
    display: block;
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: var(--radius-card);
    padding: 18px;
    cursor: pointer;
    transition:
      box-shadow 0.15s,
      border-color 0.15s,
      transform 0.12s;
    text-decoration: none;
    color: inherit;
  }

  .card:hover {
    box-shadow: 0 6px 20px rgba(249, 115, 22, 0.1);
    border-color: var(--accent-mid);
    transform: translateY(-2px);
  }

  .author {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 700;
  }

  .author-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--ink2);
  }

  .time {
    font-size: 11px;
    color: var(--ink3);
    margin-left: auto;
  }

  .title {
    font-family: var(--font-ui);
    font-size: 15px;
    font-weight: 700;
    color: var(--ink);
    line-height: 1.5;
    margin-bottom: 10px;
  }

  .preview {
    font-size: 12px;
    color: var(--ink2);
    line-height: 1.6;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: 12px;
  }

  .footer {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .count {
    font-size: 11px;
    color: var(--ink3);
    background: var(--bg);
    padding: 3px 10px;
    border-radius: var(--radius-btn);
    border: 1px solid var(--border2);
    font-family: var(--font-ui);
  }

  .tag {
    font-size: 11px;
    color: var(--accent-dark);
    background: var(--accent-mid);
    padding: 3px 10px;
    border-radius: var(--radius-btn);
    font-family: var(--font-ui);
    font-weight: 500;
  }

  .likes {
    margin-left: auto;
    font-size: 12px;
    color: var(--ink3);
    font-family: var(--font-ui);
  }
</style>
