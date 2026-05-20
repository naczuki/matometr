import type { MatomeBlock } from '$lib/entities/Matome';

export type { MatomeBlock };

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

export interface Note {
  id: string;
  pubkey: string;
  content: string;
  createdAt: number;
  tags: string[][];
}

export interface Draft {
  dTag: string;
  title: string;
  summary: string;
  blocks: MatomeBlock[];
  updatedAt: number;
}
