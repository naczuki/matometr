import { writable, derived } from 'svelte/store';
import { nip19 } from 'nostr-tools';
import type { UserProfile } from '$lib/types';
import { fetchProfiles } from '$lib/services/NostrClient';

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
    fetchProfiles([pk]).subscribe((profile) => {
      _profile.set(profile);
    });
  } catch {
    // 無効な npub
  }
}

let _nlLogout: (() => Promise<void>) | null = null;

export function logout(): void {
  _pubkey.set(null);
  _profile.set(null);
  _nlLogout?.();
}

// ページ読み込み時に一度だけ呼ぶ（+layout.svelte の onMount から）
export async function initAuth(): Promise<void> {
  const { init, logout: nlLogout } = await import('@konemono/nostr-login');
  _nlLogout = nlLogout;

  await init({
    noBanner: true,
    perms: 'sign_event:30023,sign_event:5,sign_event:1',
    bunkers: 'nsec.app',
    theme: 'default',
    title: 'まとめたーにログイン',
    description: '無料・メールアドレス不要でアカウントを作れます',
    darkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
    onAuth: (npub, options) => {
      if (options.type === 'login' || options.type === 'signup') {
        handleLogin(npub);
      } else if (options.type === 'logout') {
        _pubkey.set(null);
        _profile.set(null);
      }
    },
  });
}
