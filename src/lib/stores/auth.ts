import { writable, derived } from 'svelte/store';
import { nip19 } from 'nostr-tools';
import type { Subscription } from 'rxjs';
import type { UserProfile } from '$lib/types';
import { fetchProfiles } from '$lib/services/NostrClient';

const NOSTR_LOGIN_CSS = `
  * {
    font-family: var(--font-body), sans-serif !important;
  }

  /* 大きすぎる Tailwind テキストサイズを抑制 */
  [class~='text-lg'],
  [class~='text-xl'] {
    font-size: 1rem !important;
  }

  /* ダイアログ外枠の角丸・スクロール */
  .nl-bg {
    border-radius: var(--radius-card) !important;
    max-height: 90dvh !important;
    overflow-y: auto !important;
  }

  .nl-title {
    font-family: var(--font-ui), sans-serif !important;
    font-size: 1.5rem !important;
    margin-bottom: 0.5rem !important;
    color: var(--ink) !important;
  }
  /* nl-title はリスト項目（div）や警告文（p）にも使われるため抑制 */
  div.nl-title {
    font-size: 1rem !important;
  }
  p.nl-title {
    font-size: 1rem !important;
  }
  p.nl-title[class~='text-xs'] {
    font-size: 1rem !important;
  }

  /* 太字テキストのジャギー対策（本サイトと同設定） */
  button,
  h1, h2, h3, h4,
  .nl-title, .nl-button,
  [class~='font-bold'],
  [class~='font-semibold'],
  [class~='font-medium'] {
    transform: rotate(0.04deg);
  }

  .nl-button {
    border-radius: var(--radius-btn) !important;
    border: 1.5px solid var(--accent) !important;
    background-color: var(--surface) !important;
    color: var(--accent-dark) !important;
    font-family: var(--font-ui), sans-serif !important;
    font-weight: 700 !important;
    padding-top: 0.75rem !important;
    padding-bottom: 0.75rem !important;
    margin-bottom: 0.5rem !important;
    white-space: normal !important;
    height: auto !important;
  }
  .nl-button:hover {
    border-color: var(--accent-dark) !important;
    background-color: var(--accent-pale) !important;
    color: var(--accent-dark) !important;
  }

  .nl-action-button,
  a,
  [class*='text-blue'] {
    color: var(--accent) !important;
  }
  .nl-action-button:hover {
    color: var(--accent-dark) !important;
    background-color: var(--accent-pale) !important;
  }

  /* Add ボタンなど bg-blue-* をオレンジに */
  [class*='bg-blue'] {
    background-color: var(--accent) !important;
  }
  [class*='bg-blue']:hover {
    background-color: var(--accent-dark) !important;
  }

  rect[fill="#6951FA"] {
    fill: var(--accent) !important;
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

        // 各 NL-* のルートを個別に監視（子コンポーネントの画面も翻訳する）
        observeNostrLogin(root);
      }
      return root;
    },
  });
}

const NOSTR_LOGIN_DICT: Record<string, string> = {
  'Log in': 'ログイン',
  'Sign up': '新規登録',
  'Connect': '拡張機能・アプリでログイン',
  'Read only': '見るだけ',
  'With extension': '拡張機能で',
  'With nsec': '秘密鍵（nsec）で',
  // 文末は「テキスト + <a>リンク</a> + .」に分割されるため断片ごとに登録
  "If you don't have a profile please": 'アカウントをお持ちでない方は',
  'If you already have a profile please': 'すでにアカウントをお持ちの方は',
  'sign up': '新規登録',
  'log in': 'ログイン',
  'Connect to key store': '鍵ストアでログイン',
  'Select key store:': '鍵ストアを選択：',
  'Other key stores': 'その他の鍵ストア',
  'offline': 'オフライン',
  'Advanced: Relay Settings': '詳細設定：リレー設定',
  'Advanced': '詳細設定',
  'User name': 'ユーザー名',
  'Connection string': '接続文字列',
  'Bunker URL': 'Bunker URL',
  'Log in to read only': '見るだけでログイン',
  'Please enter the user name or npub of any Nostr user.': 'Nostrユーザーの名前かnpubを入れてください。',
  'Login with nsec': '秘密鍵（nsec）でログイン',
  'Enter your private key (nsec) to log in.': '秘密鍵（nsec）を入れてログインします。',
  'Use at your own risk': '自己責任でご利用ください',
  'Entering your private key directly is not recommended. We suggest migrating to a key store service for better security.':
    '秘密鍵を直接入力することは推奨されません。安全性のため、鍵ストアサービスへの移行をおすすめします。',
  'Connecting...': 'つないでいます…',
  'Establishing connection to your key storage.': '鍵ストアにつないでいます。',
  'Press Cancel to abort': '中止するにはキャンセルを押してください',
  'Cancel': 'キャンセル',
  'Signing in...': 'ログインしています…',
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
  'Install browser extension!': 'ブラウザ拡張機能をインストール！',
  'Try Alby, nos2x or Nostore': 'nos2x（Chrome）、nos2x-fox（Firefox）、Nostash（iOS）をお試しください',
  'Scan or copy the connection string with key store app': '鍵ストアアプリで接続文字列をスキャンまたはコピーしてください',
  'Nip46 Relays:': 'NIP-46 リレー：',
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
  // <summary> は ▶ 記号が混入するため contains-match で翻訳
  sr.querySelectorAll('summary').forEach((summary) => {
    const text = summary.textContent ?? '';
    for (const [en, ja] of Object.entries(NOSTR_LOGIN_DICT)) {
      if (text.includes(en)) {
        summary.textContent = text.replace(en, ja);
        break;
      }
    }
  });

  // 「見るだけ」ボタンのアイコンを両目 SVG に差し替え（Heroicons スタイルに統一）
  sr.querySelectorAll<HTMLElement>('.nl-button').forEach((btn) => {
    if (btn.textContent?.includes('見るだけ') || btn.textContent?.includes('Read only')) {
      const svg = btn.querySelector('svg');
      if (svg) {
        svg.setAttribute('viewBox', '0 0 24 24');
        // 縦長の楕円（8×10.5）＋瞳を左寄せでキョロ目に
        svg.innerHTML =
          '<path stroke-linecap="round" stroke-linejoin="round" d="M10 12C10 9.1 8.2 6.75 6 6.75C3.8 6.75 2 9.1 2 12C2 14.9 3.8 17.25 6 17.25C8.2 17.25 10 14.9 10 12Z"/>' +
          '<circle cx="4.5" cy="12.5" r="2" fill="currentColor" stroke="none"/>' +
          '<path stroke-linecap="round" stroke-linejoin="round" d="M22 12C22 9.1 20.2 6.75 18 6.75C15.8 6.75 14 9.1 14 12C14 14.9 15.8 17.25 18 17.25C20.2 17.25 22 14.9 22 12Z"/>' +
          '<circle cx="16.5" cy="12.5" r="2" fill="currentColor" stroke="none"/>';
      }
    }
  });

  // Nostore は廃止済み → 後継の Nostash に差し替え＋OS注釈
  sr.querySelectorAll<HTMLAnchorElement>('a[href*="nostore"]').forEach((a) => {
    a.href = 'https://apps.apple.com/jp/app/nostash/id6744309333';
    a.textContent = 'Nostash（iOS）';
  });

  // Alby はアカウント登録が必要なため削除（前後のテキストノードも整理）
  sr.querySelectorAll<HTMLAnchorElement>('a[href*="alby"]').forEach((a) => {
    const next = a.nextSibling;
    if (next?.nodeType === Node.TEXT_NODE) next.textContent = '';
    a.remove();
  });

  // nos2x に Chrome 注釈を追加し、Firefox 版 nos2x-fox を隣に挿入（冪等）
  sr.querySelectorAll<HTMLAnchorElement>('a[href*="nos2x"]:not([href*="nos2x-fox"])').forEach((a) => {
    a.textContent = 'nos2x（Chrome）';
    if (!sr.querySelector('a[href*="nos2x-fox"]')) {
      const sep = document.createTextNode('、');
      const fox = document.createElement('a');
      fox.href = 'https://addons.mozilla.org/ja/firefox/addon/nos2x-fox/';
      fox.target = '_blank';
      fox.rel = 'noopener noreferrer';
      fox.textContent = 'nos2x-fox（Firefox）';
      a.after(sep, fox);
    }
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
