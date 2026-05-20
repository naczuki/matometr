import { writable, derived } from 'svelte/store';
import { nip19 } from 'nostr-tools';
import type { UserProfile } from '$lib/types';
import { fetchProfiles } from '$lib/services/NostrClient';

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

function handleLogin(pk: string): void {
  _pubkey.set(pk);
  _profile.set(null);
  nostrAvailable.set(true);
  fetchProfiles([pk]).subscribe((profile) => {
    _profile.set(profile);
  });
}

export function logout(): void {
  _pubkey.set(null);
  _profile.set(null);
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('nlLogout'));
  }
}

// クライアントサイドのみ：nostr-login セッション復元・認証イベント処理
if (typeof document !== 'undefined') {
  // nostr-login からの認証イベント（ログイン・ログアウト・セッション復元）
  document.addEventListener('nlAuth', async (e: Event) => {
    const { type } = (e as CustomEvent<{ type: string }>).detail;
    if (type === 'login' || type === 'signup') {
      try {
        const pk = await window.nostr?.getPublicKey();
        if (pk) handleLogin(pk);
      } catch {
        // window.nostr 未利用 or ユーザーが拒否
      }
    } else if (type === 'logout') {
      _pubkey.set(null);
      _profile.set(null);
    }
  });

  // ページ読み込み完了後に window.nostr の存在だけ確認（拡張機能対応）
  // getPublicKey() は呼ばない（自動プロンプト防止）
  window.addEventListener('load', () => {
    if (window.nostr) nostrAvailable.set(true);
  });
}
