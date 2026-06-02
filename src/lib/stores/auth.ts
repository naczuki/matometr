import { writable, derived, get } from 'svelte/store';
import { nip19 } from 'nostr-tools';
import type { Subscription } from 'rxjs';
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

let _profileSub: Subscription | null = null;

function handleLogin(npub: string): void {
  try {
    const decoded = nip19.decode(npub);
    if (decoded.type !== 'npub') return;
    const pk = decoded.data;
    _profileSub?.unsubscribe();
    _pubkey.set(pk);
    _profile.set(null);
    _profileSub = fetchProfiles([pk]).subscribe((profile) => {
      // 複数リレーから kind:0 が届いた場合、created_at が最も新しいものを採用する
      _profile.update((existing) =>
        !existing || (profile.createdAt ?? 0) >= (existing.createdAt ?? 0)
          ? profile
          : existing
      );
    });
  } catch {
    // 無効な npub
  }
}

let _nlLogout: (() => Promise<void>) | null = null;

// 本物のブラウザ拡張機能への参照（Svelte ストアで公開してモーダルのボタンを reactive に制御）
const _extStore = writable<{ getPublicKey: () => Promise<string> } | null>(null);
export const nostrExtension = { subscribe: _extStore.subscribe };
export const getNostrExtension = () => get(_extStore);

export function logout(): void {
  _profileSub?.unsubscribe();
  _profileSub = null;
  _pubkey.set(null);
  _profile.set(null);
  _nlLogout?.();
}

// ページ読み込み時に一度だけ呼ぶ（+layout.svelte の onMount から）
export async function initAuth(): Promise<void> {
  // init() 実行前に存在するなら捕捉
  if ((window as any).nostr) _extStore.set((window as any).nostr);

  const { init, logout: nlLogout } = await import('@konemono/nostr-login');
  _nlLogout = nlLogout;

  // モジュール読み込み中に拡張が注入された場合も捕捉
  if ((window as any).nostr && !get(_extStore)) _extStore.set((window as any).nostr);

  await init({
    noBanner: true,
    perms: 'sign_event:30023,sign_event:5,sign_event:1,sign_event:7',
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

  // init() 後 window.nostr はプロキシ。プロキシを誤って保存していたら消す
  const nlProxy = (window as any).nostr;
  if (get(_extStore) === nlProxy) _extStore.set(null);

  // init() 後に遅延注入される拡張機能を監視する
  // nostr-login の startCheckingExtension が拡張を検出して win.nostr を切り替える瞬間を捉える
  try {
    let _winNostr: any = nlProxy;
    Object.defineProperty(window, 'nostr', {
      configurable: true,
      enumerable: true,
      get: () => _winNostr,
      set: (v: any) => {
        _winNostr = v;
        if (v && v !== nlProxy) {
          // プロキシ以外がセットされた = 本物の拡張機能
          _extStore.set(v);
        }
      },
    });
  } catch {
    // defineProperty が使えない環境ではポーリングにフォールバック
    let polls = 0;
    const id = setInterval(() => {
      const cur = (window as any).nostr;
      if (cur && cur !== nlProxy) _extStore.set(cur);
      if (++polls >= 50) clearInterval(id); // 10秒で打ち切り
    }, 200);
  }
}
