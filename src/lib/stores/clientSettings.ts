import { derived, get, writable } from 'svelte/store';
import { ulid } from 'ulid';
import {
  cloneDefaults,
  emptySettingsData,
  isUsable,
  settingsDataFromJson,
  settingsDataToJson,
  type ClientLink,
  type ClientLinkKind,
  type ClientSettingsData,
  type LocalSettingsState,
  type SyncRecord
} from '$lib/utils/clientLinks';

// シェア先・「○○で開く」の設定。まずこのブラウザの localStorage に保存し、
// ログイン中なら Nostr（$lib/services/settingsSync）とも同期できる。
// 触っていない種類は保存せず（null）、既定値を使う。こうしておくと、
// 既定値をアプリ側で更新したとき、設定を変えていない人にはそのまま反映される。

const STORAGE_KEY = 'matometr:client-links';
const SYNC_KEY = 'matometr:client-links-sync';

type LocalState = LocalSettingsState;

function emptyLocal(): LocalState {
  return { data: emptySettingsData(), updatedAt: 0 };
}

function loadLocal(): LocalState {
  if (typeof localStorage === 'undefined') return emptyLocal();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyLocal();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const data = settingsDataFromJson(parsed);
    if (!data) return emptyLocal();
    const updatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0;
    return { data, updatedAt };
  } catch {
    return emptyLocal();
  }
}

function saveLocal(state: LocalState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const { data, updatedAt } = state;
    if (updatedAt === 0 && data.share === null && data.open === null) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settingsDataToJson(data), updatedAt }));
  } catch {
    /* プライベートブラウズ等で保存できない場合は、このタブの間だけ有効 */
  }
}

function loadSyncRecords(): Record<string, SyncRecord> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const records: Record<string, SyncRecord> = {};
    for (const [pubkey, value] of Object.entries(parsed ?? {})) {
      const r = value as Partial<SyncRecord> | null;
      if (r && typeof r.remoteCreatedAt === 'number' && typeof r.localUpdatedAt === 'number') {
        records[pubkey] = { remoteCreatedAt: r.remoteCreatedAt, localUpdatedAt: r.localUpdatedAt };
      }
    }
    return records;
  } catch {
    return {};
  }
}

function saveSyncRecords(records: Record<string, SyncRecord>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(records));
  } catch {
    /* 保存できなくても同期自体は済んでいる */
  }
}

const local = writable<LocalState>(loadLocal());
const syncRecords = writable<Record<string, SyncRecord>>(loadSyncRecords());

// 別タブで設定を変えたら、開いているタブのメニューにも反映する。
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY || e.key === null) local.set(loadLocal());
    if (e.key === SYNC_KEY || e.key === null) syncRecords.set(loadSyncRecords());
  });
}

/** 種類ごとの一覧（未設定なら既定値）。設定画面で使う */
export const clientLinks = derived(local, ($l) => ({
  share: $l.data.share ?? cloneDefaults('share'),
  open: $l.data.open ?? cloneDefaults('open')
}));

/** Nos ボタンのシェア先に出すもの（表示オンかつ正しい URL のもの） */
export const shareClients = derived(clientLinks, ($c) =>
  $c.share.filter((c) => isUsable('share', c))
);

/** 投稿メニューの「○○で開く」に出すもの（表示オンかつ正しい URL のもの） */
export const openClients = derived(clientLinks, ($c) => $c.open.filter((c) => isUsable('open', c)));

/** 同期用：この端末の設定と、最後に変えた時刻 */
export const localSettings = { subscribe: local.subscribe };

/** 同期用：アカウントごとの最後の同期記録 */
export const settingsSyncRecords = { subscribe: syncRecords.subscribe };

export function getLocalSettings(): LocalState {
  return get(local);
}

export function getSyncRecord(pubkey: string): SyncRecord | undefined {
  return get(syncRecords)[pubkey];
}

/** 前回より必ず大きい時刻（同じミリ秒に 2 回変えても区別できるように） */
function nextUpdatedAt(prev: number): number {
  return Math.max(Date.now(), prev + 1);
}

function setData(fn: (data: ClientSettingsData) => ClientSettingsData): void {
  local.update((s) => {
    const next = { data: fn(s.data), updatedAt: nextUpdatedAt(s.updatedAt) };
    saveLocal(next);
    return next;
  });
}

/** 指定の種類の一覧を書き換えて保存する */
function mutate(kind: ClientLinkKind, fn: (list: ClientLink[]) => ClientLink[]): void {
  setData((data) => {
    const current = data[kind] ?? cloneDefaults(kind);
    return { ...data, [kind]: fn(current.map((c) => ({ ...c }))) };
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
  setData((data) => ({ ...data, [kind]: null }));
}

/** Nostr から読み込んだ設定でこの端末の設定を置き換え、同期済みとして記録する */
export function applyRemoteSettings(
  pubkey: string,
  data: ClientSettingsData,
  remoteCreatedAt: number
): void {
  const next = { data, updatedAt: nextUpdatedAt(get(local).updatedAt) };
  saveLocal(next);
  local.set(next);
  markSynced(pubkey, remoteCreatedAt, next.updatedAt);
}

/** Nostr と同じ内容になったことを記録する */
export function markSynced(pubkey: string, remoteCreatedAt: number, localUpdatedAt: number): void {
  syncRecords.update((records) => {
    const next = { ...records, [pubkey]: { remoteCreatedAt, localUpdatedAt } };
    saveSyncRecords(next);
    return next;
  });
}
