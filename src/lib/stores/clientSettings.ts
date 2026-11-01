import { derived, writable } from 'svelte/store';
import { ulid } from 'ulid';
import {
  cloneDefaults,
  isUsable,
  sanitizeClientLinks,
  type ClientLink,
  type ClientLinkKind
} from '$lib/utils/clientLinks';

// シェア先・「○○で開く」の設定。このブラウザの localStorage にだけ保存する。
// 触っていない種類は保存せず（null）、既定値を使う。こうしておくと、
// 既定値をアプリ側で更新したとき、設定を変えていない人にはそのまま反映される。

const STORAGE_KEY = 'matometr:client-links';
const STORAGE_VERSION = 1;

type Stored = Record<ClientLinkKind, ClientLink[] | null>;

function emptyStored(): Stored {
  return { share: null, open: null };
}

function load(): Stored {
  if (typeof localStorage === 'undefined') return emptyStored();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStored();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || parsed.v !== STORAGE_VERSION) {
      return emptyStored();
    }
    return {
      share: sanitizeClientLinks(parsed.share),
      open: sanitizeClientLinks(parsed.open)
    };
  } catch {
    return emptyStored();
  }
}

function save(value: Stored): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value.share === null && value.open === null) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const data: Record<string, unknown> = { v: STORAGE_VERSION };
    if (value.share !== null) data.share = value.share;
    if (value.open !== null) data.open = value.open;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* プライベートブラウズ等で保存できない場合は、このタブの間だけ有効 */
  }
}

const stored = writable<Stored>(load());

// 別タブで設定を変えたら、開いているタブのメニューにも反映する。
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY || e.key === null) stored.set(load());
  });
}

/** 種類ごとの一覧（未設定なら既定値）。設定画面で使う */
export const clientLinks = derived(stored, ($s) => ({
  share: $s.share ?? cloneDefaults('share'),
  open: $s.open ?? cloneDefaults('open')
}));

/** Nos ボタンのシェア先に出すもの（表示オンかつ正しい URL のもの） */
export const shareClients = derived(clientLinks, ($c) =>
  $c.share.filter((c) => isUsable('share', c))
);

/** 投稿メニューの「○○で開く」に出すもの（表示オンかつ正しい URL のもの） */
export const openClients = derived(clientLinks, ($c) => $c.open.filter((c) => isUsable('open', c)));

/** 指定の種類の一覧を書き換えて保存する */
function mutate(kind: ClientLinkKind, fn: (list: ClientLink[]) => ClientLink[]): void {
  stored.update((s) => {
    const current = s[kind] ?? cloneDefaults(kind);
    const next = { ...s, [kind]: fn(current.map((c) => ({ ...c }))) };
    save(next);
    return next;
  });
}

export function updateClient(
  kind: ClientLinkKind,
  id: string,
  patch: Partial<Pick<ClientLink, 'name' | 'url' | 'enabled'>>
): void {
  mutate(kind, (list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
}

export function addClient(kind: ClientLinkKind, name: string, url: string): void {
  mutate(kind, (list) => [
    ...list,
    { id: ulid(), name: name.trim(), url: url.trim(), enabled: true }
  ]);
}

export function removeClient(kind: ClientLinkKind, id: string): void {
  mutate(kind, (list) => list.filter((c) => c.id !== id));
}

/** 指定の種類をデフォルトに戻す（保存していた設定を消す） */
export function resetClients(kind: ClientLinkKind): void {
  stored.update((s) => {
    const next = { ...s, [kind]: null };
    save(next);
    return next;
  });
}
