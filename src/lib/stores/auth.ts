import { writable, derived } from 'svelte/store';
import { nip19 } from 'nostr-tools';
import type { Subscription } from 'rxjs';
import type { UserProfile } from '$lib/types';
import { fetchProfiles } from '$lib/services/NostrClient';

const NOSTR_LOGIN_CSS = `
  * {
    font-family: var(--font-body), sans-serif !important;
  }
  .nl-title {
    font-family: var(--font-ui), sans-serif !important;
  }
  .nl-action-button {
    color: var(--accent) !important;
  }
  .nl-action-button:hover {
    color: var(--accent-dark) !important;
    background-color: var(--accent-pale) !important;
  }
  .nl-button {
    background-color: var(--accent) !important;
    border-color: var(--accent) !important;
    color: #fff !important;
  }
  .nl-button:hover {
    background-color: var(--accent-dark) !important;
    border-color: var(--accent-dark) !important;
  }
  .nl-input:focus {
    border-color: var(--accent) !important;
    --tw-ring-color: var(--accent) !important;
  }
`;

const _origAttachShadow = Element.prototype.attachShadow;
let _stylesSetup = false;

function setupNostrLoginStyles(): void {
  if (_stylesSetup) return;
  _stylesSetup = true;

  Object.defineProperty(Element.prototype, 'attachShadow', {
    configurable: true,
    value(this: Element, init: ShadowRootInit): ShadowRoot {
      const root = _origAttachShadow.call(this, init);
      if (this.tagName.startsWith('NL-')) {
        // CSS は shadow 境界を越えないため各 NL-* ルートに注入する
        const style = document.createElement('style');
        style.textContent = NOSTR_LOGIN_CSS;
        root.appendChild(style);

        // 翻訳対象テキストは nl-auth のルート配下に描画されるため、
        // observer は nl-auth のルート1つだけに仕掛ける（重複・自己発火を防ぐ）
        if (this.tagName === 'NL-AUTH') {
          observeNostrLogin(root);
        }
      }
      return root;
    },
  });
}

const NOSTR_LOGIN_DICT: Record<string, string> = {
  'Log in': 'ログイン',
  'Sign up': '新規登録',
  'Connect': '接続',
  'Read only': '閲覧のみ',
  'With extension': '拡張機能で',
  'With nsec': 'nsecで',
  // 文末は「テキスト + <a>リンク</a> + .」に分割されるため断片ごとに登録
  "If you don't have a profile please": 'アカウントをお持ちでない方は',
  'If you already have a profile please': 'すでにアカウントをお持ちの方は',
  'sign up': '新規登録',
  'log in': 'ログイン',
  'Connect to key store': '鍵ストアに接続',
  'Select key store:': '鍵ストアを選択：',
  'Other key stores': 'その他の鍵ストア',
  'offline': 'オフライン',
  'Advanced: Relay Settings': '詳細設定：リレー設定',
  'Advanced': '詳細設定',
  'User name': 'ユーザー名',
  'Connection string': '接続文字列',
  'Bunker URL': 'Bunker URL',
  'Log in to read only': '閲覧のみでログイン',
  'Please enter the user name or npub of any Nostr user.': '任意のNostrユーザーのユーザー名またはnpubを入力してください。',
  'Login with nsec': 'nsecでログイン',
  'Enter your private key (nsec) to log in.': 'ログインするには秘密鍵（nsec）を入力してください。',
  'Use at your own risk': '自己責任でご利用ください',
  'Entering your private key directly is not recommended. We suggest migrating to a key store service for better security.':
    '秘密鍵を直接入力することは推奨されません。安全性のため、鍵ストアサービスへの移行をおすすめします。',
  'Connecting...': '接続中...',
  'Establishing connection to your key storage.': '鍵ストレージへの接続を確立しています。',
  'Press Cancel to abort': '中止するにはキャンセルを押してください',
  'Cancel': 'キャンセル',
  'Signing in...': 'サインイン中...',
  'Nostr profiles are based on cryptographic keys. You can create keys right here, or with a key storage app.':
    'Nostrのプロフィールは暗号鍵に基づいています。ここで鍵を作成するか、鍵管理アプリを使用できます。',
  'Create keys': '鍵を作成',
  'With key store': '鍵ストアで',
  'Create Nostr profile': 'Nostrプロフィールを作成',
  'Choose any username, you can always change it later.': 'ユーザー名はあとでいつでも変更できます。',
  'Enter username': 'ユーザー名を入力',
  'Create profile': 'プロフィールを作成',
  'Error: Please enter some nickname': 'エラー：ニックネームを入力してください',
  'Create keys with key store': '鍵ストアで鍵を作成',
  'Choose some username and a key store service.': 'ユーザー名と鍵ストアサービスを選択してください。',
  'Name': '名前',
};

const NOSTR_LOGIN_PLACEHOLDERS: Record<string, string> = {
  'npub or name@domain': 'npub または name@domain',
  'Enter username': 'ユーザー名を入力',
  'Name': '名前',
};

function translateNostrLogin(sr: ShadowRoot): void {
  const walker = document.createTreeWalker(sr, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent?.trim() ?? '';
    const translated = NOSTR_LOGIN_DICT[text];
    if (translated) node.textContent = translated;
  }
  sr.querySelectorAll('input[placeholder]').forEach((input) => {
    const el = input as HTMLInputElement;
    const translated = NOSTR_LOGIN_PLACEHOLDERS[el.placeholder.trim()];
    if (translated) el.placeholder = translated;
  });
}

// nl-auth のルートを監視して画面遷移のたびに翻訳する。
// 書き換え中は observer を止め、自身の変更で再発火しないようにする。
function observeNostrLogin(root: ShadowRoot): void {
  const options: MutationObserverInit = {
    childList: true,
    subtree: true,
    characterData: true,
  };
  const observer = new MutationObserver(() => {
    observer.disconnect();
    translateNostrLogin(root);
    observer.observe(root, options);
  });
  translateNostrLogin(root);
  observer.observe(root, options);
}

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
      _profile.set(profile);
    });
  } catch {
    // 無効な npub
  }
}

let _nlLogout: (() => Promise<void>) | null = null;

export function logout(): void {
  _profileSub?.unsubscribe();
  _profileSub = null;
  _pubkey.set(null);
  _profile.set(null);
  _nlLogout?.();
}

// ページ読み込み時に一度だけ呼ぶ（+layout.svelte の onMount から）
export async function initAuth(): Promise<void> {
  setupNostrLoginStyles();
  const { init, logout: nlLogout } = await import('@konemono/nostr-login');
  _nlLogout = nlLogout;

  await init({
    noBanner: true,
    perms: 'sign_event:30023,sign_event:5,sign_event:1,sign_event:7',
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
