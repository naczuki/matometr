import { writable, derived } from 'svelte/store';
import { nip19 } from 'nostr-tools';
import type { UserProfile } from '$lib/types';
import { fetchProfiles } from '$lib/services/NostrClient';
import { init, logout as nlLogout } from 'nostr-login';

// window.nostr の有無（nostr-login または拡張機能）
export const nostrAvailable = writable<boolean>(false);

// ログイン中の pubkey（null = 未ログイン）
const _pubkey = writable<string | null>(null);

// 取得済みプロフィール
const _profile = writable<UserProfile | null>(null);

// ログイン状態の現在ユーザー（既存コードとの互換性を保つ）
export const currentUser = derived([_pubkey, _profile], ([$pubkey, $profile]) => {
  if (!$pubkey) return null;
  if ($profile?.pubkey === $pubkey) return $profile;
  try {
    return { pubkey: $pubkey, npub: nip19.npubEncode($pubkey) } as UserProfile;
  } catch {
    return null;
  }
});

function handleLogin(npub: string): void {
  try {
    const decoded = nip19.decode(npub);
    if (decoded.type !== 'npub') return;
    const pk = decoded.data;
    _pubkey.set(pk);
    _profile.set(null);
    nostrAvailable.set(true);
    fetchProfiles([pk]).subscribe((profile) => {
      _profile.set(profile);
    });
  } catch {
    // 無効な npub
  }
}

export function logout(): void {
  _pubkey.set(null);
  _profile.set(null);
  nlLogout();
}

// nostr-login の launch() が同期的にこのURLを fetch するため、
// ブラウザキャッシュに頼らず明示的に JS メモリへキャッシュして再利用させる
const NSEC_NOSTR_JSON_URL = 'https://nsec.app/.well-known/nostr.json';
let nsecJsonResponse: Response | null = null;
let nsecJsonPromise: Promise<Response> | null = null;
let nativeFetch: typeof fetch | null = null;

function fetchNsecJsonCached(): Promise<Response> {
  if (nsecJsonResponse) return Promise.resolve(nsecJsonResponse.clone());
  if (nsecJsonPromise) return nsecJsonPromise.then((r) => r.clone());
  const f = nativeFetch ?? fetch;
  nsecJsonPromise = f(NSEC_NOSTR_JSON_URL);
  nsecJsonPromise
    .then((r) => {
      nsecJsonResponse = r.clone();
    })
    .catch(() => {
      nsecJsonPromise = null;
    });
  return nsecJsonPromise.then((r) => r.clone());
}

function patchFetch(): void {
  if (nativeFetch || typeof window === 'undefined') return;
  nativeFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL ? input.toString() : input.url;
    if (url === NSEC_NOSTR_JSON_URL) return fetchNsecJsonCached();
    return nativeFetch!(input, init);
  }) as typeof fetch;
}

// ページ読み込み時に一度だけ呼ぶ（+layout.svelte の onMount から）
export async function initAuth(): Promise<void> {
  patchFetch();
  // 先読み開始（fire-and-forget）。完了すれば JS メモリにキャッシュされ、
  // nostr-login が同じURLを fetch したときに即座に返る
  fetchNsecJsonCached();

  await init({
    noBanner: true,
    perms: 'sign_event:30023',
    bunkers: 'nsec.app',
    theme: 'default',
    darkMode: typeof window !== 'undefined'
      && window.matchMedia('(prefers-color-scheme: dark)').matches,
    onAuth: (npub, options) => {
      if (options.type === 'login' || options.type === 'signup') {
        handleLogin(npub);
      } else if (options.type === 'logout') {
        _pubkey.set(null);
        _profile.set(null);
      }
    }
  });
  // 初期化後に window.nostr の有無を確認
  if (typeof window !== 'undefined' && window.nostr) {
    nostrAvailable.set(true);
  }
}
