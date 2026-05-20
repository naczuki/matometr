import type { Draft } from '$lib/types';

const DRAFT_PREFIX = 'matometr-draft-';

export function saveDraft(draft: Draft): void {
  const key = `${DRAFT_PREFIX}${draft.dTag}`;
  localStorage.setItem(key, JSON.stringify({ ...draft, updatedAt: Date.now() }));
}

export function loadDraft(dTag: string): Draft | null {
  const key = `${DRAFT_PREFIX}${dTag}`;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Draft;
  } catch {
    return null;
  }
}

export function deleteDraft(dTag: string): void {
  localStorage.removeItem(`${DRAFT_PREFIX}${dTag}`);
}

export function listDraftKeys(): string[] {
  return Object.keys(localStorage)
    .filter((k) => k.startsWith(DRAFT_PREFIX))
    .map((k) => k.slice(DRAFT_PREFIX.length));
}
