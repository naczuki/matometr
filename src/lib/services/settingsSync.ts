import { get, writable } from 'svelte/store';
import { collectObservable } from '$lib/utils/rxCollect';
import {
  decideAutoPull,
  isInitialState,
  remoteChangedSinceSync,
  settingsDataFromJson,
  settingsDataToJson,
  type ClientSettingsData
} from '$lib/utils/clientLinks';
import {
  applyRemoteSettings,
  getLocalSettings,
  getSyncPref,
  getSyncRecord,
  markSynced,
  saveSettingsData,
  setSyncPref
} from '$lib/stores/clientSettings';
import { fetchAppData, fetchUserWriteRelays } from './nostrFetch';
import { publishAppData } from './nostrPublish';

// 設定（シェア先・「○○で開く」）を他の端末と同期する。
// NIP-78 の kind:30078（d タグ = SETTINGS_D_TAG）に、設定の JSON を NIP-44 で自分宛てに
// 暗号化して保存する。
//
// - 保存：設定画面の「保存」。「他の端末と同期する」がオンなら Nostr にも保存する
// - 読み込み：まとめたーを開いたとき（ログインしたとき）に確認する
//   - 同期オン：他の端末で保存した設定があれば黙って読み込む
//   - 同期オフ：この端末が初期状態で、他の端末で保存した設定があれば、読み込むかをダイアログで聞く
// - 競合：前回そろえた後に、他の端末での保存とこの端末の未同期の変更の両方があれば、
//   どちらも上書きせず、どちらを使うかをダイアログで聞く

export const SETTINGS_D_TAG = 'matometr/settings';

/** 他の端末の設定についての確認ダイアログ */
export type SyncDialog = {
  pubkey: string;
  /** 他の端末で保存した設定の created_at（秒） */
  remoteCreatedAt: number;
  busy: boolean;
  error: string;
} & (
  | { type: 'conflict' } // どちらを使うか
  | { type: 'initial' } // 初期状態の端末で、読み込むか
);

const _dialog = writable<SyncDialog | null>(null);
export const settingsSyncDialog = { subscribe: _dialog.subscribe };

/** 設定画面の「保存」ボタンまわりの表示 */
export interface SaveStatus {
  busy: boolean;
  message: string;
  error: string;
}

const SAVE_IDLE: SaveStatus = { busy: false, message: '', error: '' };
const _save = writable<SaveStatus>(SAVE_IDLE);
export const settingsSaveStatus = { subscribe: _save.subscribe };

function nip44(): NonNullable<NonNullable<Window['nostr']>['nip44']> {
  const n = window.nostr?.nip44;
  if (!n) throw new Error('今のログイン方法では暗号化（NIP-44）が使えません');
  return n;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function fetchLatest(
  pubkey: string
): Promise<{ id: string; content: string; createdAt: number } | null> {
  const relays = await collectObservable(fetchUserWriteRelays(pubkey), []);
  return collectObservable(fetchAppData(pubkey, SETTINGS_D_TAG, relays), null);
}

async function decrypt(pubkey: string, content: string): Promise<ClientSettingsData> {
  const signer = nip44();
  let plaintext: string;
  try {
    plaintext = await signer.decrypt(pubkey, content);
  } catch (e) {
    throw new Error(`復号できませんでした（${errorText(e)}）`);
  }
  let json: unknown;
  try {
    json = JSON.parse(plaintext);
  } catch {
    json = null;
  }
  const data = settingsDataFromJson(json);
  if (!data) throw new Error('保存されていた設定の形式が読み取れませんでした');
  return data;
}

/** 他の端末で保存した最新の設定を読み込む（無ければ false） */
async function pullLatest(pubkey: string): Promise<boolean> {
  const remote = await fetchLatest(pubkey);
  if (!remote) return false;
  const data = await decrypt(pubkey, remote.content);
  applyRemoteSettings(pubkey, data, remote.createdAt);
  return true;
}

/**
 * この端末の設定を暗号化して Nostr に保存する。
 * checkConflict = true は、前回そろえた後に他の端末で保存されていたら上書きせず
 * 'conflict' を返す。false（競合で「この端末の設定」を選んだとき）は必ず保存する。
 */
async function pushSettings(
  pubkey: string,
  checkConflict: boolean
): Promise<{ kind: 'saved' } | { kind: 'conflict'; remoteCreatedAt: number }> {
  const remote = await fetchLatest(pubkey);
  const record = getSyncRecord(pubkey);
  if (checkConflict && remote && remoteChangedSinceSync(remote.createdAt, record)) {
    return { kind: 'conflict', remoteCreatedAt: remote.createdAt };
  }

  const local = getLocalSettings();
  const plaintext = JSON.stringify(settingsDataToJson(local.data));
  const signer = nip44();
  let content: string;
  try {
    content = await signer.encrypt(pubkey, plaintext);
  } catch (e) {
    throw new Error(`暗号化できませんでした（${errorText(e)}）`);
  }
  // 置き換え可能イベントは created_at が新しい方が残る。前回の自分の保存や、
  // 時計が進んでいる他の端末の保存と同じ秒・それ以前にならないようにする。
  const createdAt = Math.max(
    Math.floor(Date.now() / 1000),
    (record?.remoteCreatedAt ?? 0) + 1,
    (remote?.createdAt ?? 0) + 1
  );
  await publishAppData({ dTag: SETTINGS_D_TAG, content, createdAt });
  markSynced(pubkey, createdAt, local.updatedAt);
  return { kind: 'saved' };
}

function openDialog(type: SyncDialog['type'], pubkey: string, remoteCreatedAt: number): void {
  _dialog.set({ type, pubkey, remoteCreatedAt, busy: false, error: '' });
}

/** まとめたーを開いたとき（ログインしたとき）の確認 */
export async function autoSyncSettings(pubkey: string): Promise<void> {
  let remote: Awaited<ReturnType<typeof fetchLatest>>;
  try {
    remote = await fetchLatest(pubkey);
  } catch {
    return;
  }
  if (!remote) return;

  const pref = getSyncPref(pubkey);
  const local = getLocalSettings();
  const record = getSyncRecord(pubkey);

  if (!pref.enabled) {
    if (!pref.declined && !record && isInitialState(local)) {
      openDialog('initial', pubkey, remote.createdAt);
    }
    return;
  }

  const decision = decideAutoPull(remote.createdAt, local, record);
  if (decision === 'up-to-date') return;
  if (decision === 'conflict') {
    openDialog('conflict', pubkey, remote.createdAt);
    return;
  }
  try {
    const data = await decrypt(pubkey, remote.content);
    applyRemoteSettings(pubkey, data, remote.createdAt);
  } catch (e) {
    _save.set({ ...SAVE_IDLE, error: `他の端末の設定を読み込めませんでした：${errorText(e)}` });
  }
}

/**
 * 設定画面の「保存」。この端末に保存し、同期オンなら Nostr にも保存する。
 * pubkey が null（未ログイン）なら、この端末にだけ保存する。
 */
export async function saveSettings(
  pubkey: string | null,
  data: ClientSettingsData,
  syncEnabled: boolean
): Promise<void> {
  if (get(_save).busy) return;
  _save.set({ ...SAVE_IDLE, busy: true });
  saveSettingsData(data);
  if (!pubkey) {
    _save.set({ ...SAVE_IDLE, message: '保存しました' });
    return;
  }
  setSyncPref(pubkey, { ...getSyncPref(pubkey), enabled: syncEnabled });
  if (!syncEnabled) {
    _save.set({ ...SAVE_IDLE, message: '保存しました' });
    return;
  }
  try {
    const result = await pushSettings(pubkey, true);
    if (result.kind === 'conflict') {
      _save.set(SAVE_IDLE);
      openDialog('conflict', pubkey, result.remoteCreatedAt);
      return;
    }
    _save.set({ ...SAVE_IDLE, message: '保存しました' });
  } catch (e) {
    _save.set({
      ...SAVE_IDLE,
      error: `この端末には保存しました。他の端末との同期に失敗しました：${errorText(e)}`
    });
  }
}

async function runDialogAction(action: (d: SyncDialog) => Promise<void>): Promise<void> {
  const d = get(_dialog);
  if (!d || d.busy) return;
  _dialog.set({ ...d, busy: true, error: '' });
  try {
    await action(d);
    _dialog.set(null);
  } catch (e) {
    _dialog.set({ ...d, busy: false, error: errorText(e) });
  }
}

/** 競合ダイアログ：「この端末の設定」を使う（他の端末の設定を上書きする） */
export function chooseLocalSettings(): Promise<void> {
  return runDialogAction(async (d) => {
    await pushSettings(d.pubkey, false);
    _save.set({ ...SAVE_IDLE, message: '保存しました' });
  });
}

/** 競合ダイアログ：「他の端末の設定」を使う（この端末の未同期の変更は捨てる） */
export function chooseRemoteSettings(): Promise<void> {
  return runDialogAction(async (d) => {
    await pullLatest(d.pubkey);
    _save.set(SAVE_IDLE);
  });
}

/** 初期状態の確認ダイアログ：読み込む（この端末でも同期をオンにする） */
export function acceptRemoteSettings(): Promise<void> {
  return runDialogAction(async (d) => {
    await pullLatest(d.pubkey);
    setSyncPref(d.pubkey, { enabled: true });
  });
}

/** 初期状態の確認ダイアログ：読み込まない（次からは聞かない） */
export function declineRemoteSettings(): void {
  const d = get(_dialog);
  if (!d || d.busy) return;
  setSyncPref(d.pubkey, { ...getSyncPref(d.pubkey), declined: true });
  _dialog.set(null);
}

/** ダイアログを閉じる（何もしない。次に開いたときにまた確認する） */
export function closeSyncDialog(): void {
  const d = get(_dialog);
  if (d && !d.busy) _dialog.set(null);
}

/** ログアウト・アカウント切り替え時に、前のアカウントの表示を消す */
export function clearSettingsSyncStatus(): void {
  _dialog.set(null);
  _save.set(SAVE_IDLE);
}

/** 設定画面を開いたときに、前の保存結果の表示を消す */
export function clearSaveMessage(): void {
  if (!get(_save).busy) _save.set(SAVE_IDLE);
}
