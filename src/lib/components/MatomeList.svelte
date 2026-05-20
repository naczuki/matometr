<script lang="ts">
  import MatomeCard from '$lib/components/MatomeCard.svelte';
  import type { Tab } from '$lib/types';

  export let tab: Tab;

  interface DummyMatome {
    naddr: string;
    avatarInitial: string;
    avatarBg: string;
    avatarFg: string;
    authorName: string;
    timeAgo: string;
    title: string;
    preview: string;
    postCount: number;
    tag: string;
    likes: number;
  }

  const DUMMY_ITEMS: DummyMatome[] = [
    {
      naddr: 'naddr1dummy1',
      avatarInitial: '竹',
      avatarBg: '#fef9c3',
      avatarFg: '#a16207',
      authorName: 'たけうち_dev',
      timeAgo: '2時間前',
      title: 'Nostr日本語リレー事情まとめ 2025年版',
      preview:
        '「リレーって何を選べばいいの？」という声をよく聞くので、日本語圏でよく使われているリレーをまとめました。速度・安定性・日本語対応などの観点で整理しています。',
      postCount: 8,
      tag: 'Nostr',
      likes: 34
    },
    {
      naddr: 'naddr1dummy2',
      avatarInitial: '葵',
      avatarBg: '#ffe4e6',
      avatarFg: '#be123c',
      authorName: 'あおいそら',
      timeAgo: '5時間前',
      title: '今週撮った夕焼け写真たち',
      preview:
        '今週Nostrに流れてきた夕焼け写真の中で特によかったものを集めました。みなさんの写真センス、すごい。',
      postCount: 6,
      tag: '写真',
      likes: 58
    },
    {
      naddr: 'naddr1dummy3',
      avatarInitial: '花',
      avatarBg: '#dcfce7',
      avatarFg: '#15803d',
      authorName: 'hana_zk',
      timeAgo: '昨日',
      title: 'Nostrで見かけたおいしそうなごはん投稿まとめ',
      preview:
        'Nostrの食べ物投稿、クオリティ高いんですよね。思わず保存したものをまとめました。',
      postCount: 12,
      tag: 'ごはん',
      likes: 91
    },
    {
      naddr: 'naddr1dummy4',
      avatarInitial: '梅',
      avatarBg: '#f3e8ff',
      avatarFg: '#7e22ce',
      authorName: 'umeko_nostr',
      timeAgo: '昨日',
      title: '「分散型SNSってなに？」を説明してる投稿まとめ',
      preview:
        'Nostrや分散型SNSについて、わかりやすく説明してくれている投稿を集めました。初心者の方にも読みやすいと思います。',
      postCount: 5,
      tag: '入門',
      likes: 47
    },
    {
      naddr: 'naddr1dummy5',
      avatarInitial: '海',
      avatarBg: '#dbeafe',
      avatarFg: '#1d4ed8',
      authorName: 'umi_dev',
      timeAgo: '2日前',
      title: 'Rust × Nostr 開発ログ 今月のまとめ',
      preview:
        'RustでNostr関連ツールを作っている開発者たちの投稿をまとめました。実装の知見がたくさん詰まっています。',
      postCount: 9,
      tag: '開発',
      likes: 29
    },
    {
      naddr: 'naddr1dummy6',
      avatarInitial: '竹',
      avatarBg: '#fef9c3',
      avatarFg: '#a16207',
      authorName: 'たけうち_dev',
      timeAgo: '3日前',
      title: 'NIP-23って何？ロングフォーム投稿の使いかた',
      preview:
        'Nostrのロングフォームコンテンツ規格、NIP-23について説明している投稿を集めました。ブログ的な使い方をしたい人向けです。',
      postCount: 7,
      tag: 'NIP',
      likes: 22
    }
  ];

  $: items = tab === 'following' ? DUMMY_ITEMS.slice(0, 3) : DUMMY_ITEMS;
</script>

<div class="grid">
  {#each items as item (item.naddr)}
    <MatomeCard
      naddr={item.naddr}
      avatarInitial={item.avatarInitial}
      avatarBg={item.avatarBg}
      avatarFg={item.avatarFg}
      authorName={item.authorName}
      timeAgo={item.timeAgo}
      title={item.title}
      preview={item.preview}
      postCount={item.postCount}
      tag={item.tag}
      likes={item.likes}
    />
  {/each}
</div>

<style>
  .grid {
    max-width: 960px;
    margin: 0 auto;
    padding: 16px 20px 48px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
  }

  @media (max-width: 640px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
