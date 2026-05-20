import { writable } from 'svelte/store';
import type { UserProfile } from '$lib/types';

export const currentUser = writable<UserProfile | null>(null);
