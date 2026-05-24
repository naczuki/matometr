import { writable } from 'svelte/store';

export const deletedMatomeIds = writable<Set<string>>(new Set());

export function markDeleted(id: string): void {
  deletedMatomeIds.update((s) => {
    const next = new Set(s);
    next.add(id);
    return next;
  });
}
