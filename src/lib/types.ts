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

export type NoteEditorBlock = { id: string; type: 'nevent'; nevent: string };
export type CommentEditorBlock = { id: string; type: 'comment'; text: string };
export type HeadingEditorBlock = { id: string; type: 'heading'; text: string };
export type EditorBlock = NoteEditorBlock | CommentEditorBlock | HeadingEditorBlock;
