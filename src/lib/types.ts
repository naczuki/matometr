export type Tab = 'recent' | 'trending' | 'following';

export interface UserProfile {
  pubkey: string;
  npub: string;
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
}

export interface MatomeBlock {
  type: 'nevent' | 'comment' | 'heading' | 'text';
  content: string;
}

export interface Matome {
  id: string;
  pubkey: string;
  naddr: string;
  dTag: string;
  title: string;
  summary: string;
  publishedAt: number;
  createdAt: number;
  content: string;
  blocks: MatomeBlock[];
  isNosli: boolean;
}

export interface Draft {
  dTag: string;
  title: string;
  summary: string;
  blocks: MatomeBlock[];
  updatedAt: number;
}
