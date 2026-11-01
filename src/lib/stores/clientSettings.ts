import { derived, get, writable } from 'svelte/store';
import {
  cloneDefaults,
  emptySettingsData,
  isUsable,
  sameSettingsData,
  settingsDataFromJson,
  settingsDataToJson,
  type ClientSettingsData,
  type LocalSettingsState,
  type SyncRecord
} from '$lib/utils/clientLinks';

// シェア先・「○○で開く」の設定。設定画面の「保存」でこのブラウザの localStorage に保存し、
// 「他の端末と同期する」がオンなら Nostr（$lib/services/settingsSync）とも同期する。
// 触っていない種類は保存せず（null）、既定値を使う。こうしておくと、
// 既定値をアプリ側で更新したとき、設定を変えていない人にはそのまま反映される。

const STORAGE_KEY = 'matometr:client-links';
const SYNC_KEY = 'matometr:client-links-sync';
const SYNC_PREFS_KEY = 'matometr:client-links-sync-prefs';

/** アカウントごとの「他の端末と同期する」の設定 */
export interface SyncPref {
  /** 他の端末と同期する */
  enabled: boolean;
  /** 初期状態のときの「他の端末で保存した設定を読み込むか」に「読み込まない」と答えた */
  declined?: boolean;
}

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

function loadSyncPrefs(): Record<string, SyncPref> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SYNC_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const prefs: Record<string, SyncPref> = {};
    for (const [pubkey, value] of Object.entries(parsed ?? {})) {
      const p = value as Partial<SyncPref> | null;
      if (p && typeof p.enabled === 'boolean') {
        prefs[pubkey] = { enabled: p.enabled, ...(p.declined === true ? { declined: true } : {}) };
      }
    }
    return prefs;
  } catch {
    return {};
  }
}

function saveSyncPrefs(prefs: Record<string, SyncPref>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SYNC_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* 保存できなければこのタブの間だけ有効 */
  }
}

const local = writable<LocalState>(loadLocal());
const syncRecords = writable<Record<string, SyncRecord>>(loadSyncRecords());
const syncPrefs = writable<Record<string, SyncPref>>(loadSyncPrefs());

// 別タブで設定を変えたら、開いているタブのメニューにも反映する。
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY || e.key === null) local.set(loadLocal());
    if (e.key === SYNC_KEY || e.key === null) syncRecords.set(loadSyncRecords());
    if (e.key === SYNC_PREFS_KEY || e.key === null) syncPrefs.set(loadSyncPrefs());
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

/** アカウントごとの「他の端末と同期する」の設定 */
export const settingsSyncPrefs = { subscribe: syncPrefs.subscribe };

export function getSyncPref(pubkey: string): SyncPref {
  return get(syncPrefs)[pubkey] ?? { enabled: false };
}

export function setSyncPref(pubkey: string, pref: SyncPref): void {
  syncPrefs.update((prefs) => {
    const next = { ...prefs, [pubkey]: pref };
    saveSyncPrefs(next);
    return next;
  });
}

/** 前回より必ず大きい時刻（同じミリ秒に 2 回変えても区別できるように） */
function nextUpdatedAt(prev: number): number {
  return Math.max(Date.now(), prev + 1);
}

/**
 * 設定画面の「保存」。内容が変わっていれば保存して true を返す（変わっていなければ何もしない）。
 */
export function saveSettingsData(data: ClientSettingsData): boolean {
  const current = get(local);
  if (sameSettingsData(current.data, data)) return false;
  const next = { data, updatedAt: nextUpdatedAt(current.updatedAt) };
  saveLocal(next);
  local.set(next);
  return true;
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
