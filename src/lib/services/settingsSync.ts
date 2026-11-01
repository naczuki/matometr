import { get, writable } from 'svelte/store';
import { collectObservable } from '$lib/utils/rxCollect';
import {
  decideOnEnable,
  decideOnOpen,
  isInitialState,
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
// - 同期オン・オフ：設定画面の一番上のトグル（切り替えた時点で効く）
// - 同期オンのとき
//   - まとめたーを開いたとき：他の端末の設定の方が新しければ黙って読み込む
//   - 設定画面で「保存」：他の端末にも送る（あとから保存した方が残る）
//   - 設定画面を開いている間に他の端末で保存されたとき：編集中でなければ黙って読み込み、
//     編集中なら「他の端末で保存した設定があります」と［読み込む］を出す
// - ダイアログ
//   - 同期オフ・初期状態の端末でログインしたとき：
//     「他の端末で保存した設定があります。同期しますか？」［同期する］［同期しない］
//   - 設定を変えてある端末でトグルをオンにしたとき（どちらの設定を使うか決める必要がある）：
//     「他の設定データがあります。どちらを使いますか？」
//     ［この端末の設定（日時 に保存）］［他の端末の設定（日時 に保存）］

export const SETTINGS_D_TAG = 'matometr/settings';

/**
 * 同期についての確認ダイアログ。
 * login = 同期オフの初期状態の端末でログインしたとき（同期しますか？）
 * choose = 設定を変えてある端末でトグルをオンにしたとき（どちらの設定を使いますか？）
 */
export type SyncDialog = {
  pubkey: string;
  busy: boolean;
  error: string;
} & ({ context: 'login' } | { context: 'choose'; remoteCreatedAt: number });

const _dialog = writable<SyncDialog | null>(null);
export const settingsSyncDialog = { subscribe: _dialog.subscribe };

/** 設定画面の同期ブロックと保存ボタンまわりの表示 */
export interface SyncStatus {
  /** トグルの切り替え・読み込み中 */
  syncBusy: boolean;
  /** 保存中 */
  saveBusy: boolean;
  /** 読み込んでいない他の端末の設定の created_at（秒）。0 = なし */
  pendingRemoteAt: number;
  /** 同期ブロックに出すエラー */
  syncError: string;
  /** 保存ボタンの横に出す結果 */
  saveMessage: string;
  saveError: string;
}

const IDLE: SyncStatus = {
  syncBusy: false,
  saveBusy: false,
  pendingRemoteAt: 0,
  syncError: '',
  saveMessage: '',
  saveError: ''
};
const _status = writable<SyncStatus>(IDLE);
export const settingsSyncStatus = { subscribe: _status.subscribe };

function setStatus(patch: Partial<SyncStatus>): void {
  _status.update((s) => ({ ...s, ...patch }));
}

function nip44(): NonNullable<NonNullable<Window['nostr']>['nip44']> {
  const n = window.nostr?.nip44;
  if (!n) throw new Error('今のログイン方法では暗号化（NIP-44）が使えません');
  return n;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

type Remote = { id: string; content: string; createdAt: number };

async function fetchLatest(pubkey: string): Promise<Remote | null> {
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

async function applyRemote(pubkey: string, remote: Remote): Promise<void> {
  const data = await decrypt(pubkey, remote.content);
  applyRemoteSettings(pubkey, data, remote.createdAt);
  setStatus({ pendingRemoteAt: 0 });
}

/** この端末の設定を暗号化して他の端末用に保存する（他の端末の設定は上書きする） */
async function pushSettings(pubkey: string, remote: Remote | null): Promise<void> {
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
  const record = getSyncRecord(pubkey);
  const createdAt = Math.max(
    Math.floor(Date.now() / 1000),
    (record?.remoteCreatedAt ?? 0) + 1,
    (remote?.createdAt ?? 0) + 1
  );
  await publishAppData({ dTag: SETTINGS_D_TAG, content, createdAt });
  markSynced(pubkey, createdAt, local.updatedAt);
  setStatus({ pendingRemoteAt: 0 });
}

// 開いたときの確認が終わるまで、設定画面の確認は待つ（同時に読み込んで復号の確認が 2 回出ないように）
let openCheck: Promise<void> | null = null;

/** まとめたーを開いたとき（ログインしたとき）の確認。どのページでも動く */
export function syncOnOpen(pubkey: string): Promise<void> {
  const run = runSyncOnOpen(pubkey).finally(() => {
    if (openCheck === run) openCheck = null;
  });
  openCheck = run;
  return run;
}

async function runSyncOnOpen(pubkey: string): Promise<void> {
  let remote: Remote | null;
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
      _dialog.set({ pubkey, context: 'login', busy: false, error: '' });
    }
    return;
  }

  if (decideOnOpen(remote.createdAt, local, record) !== 'apply') return;
  try {
    await applyRemote(pubkey, remote);
  } catch (e) {
    setStatus({ syncError: `他の端末の設定を読み込めませんでした：${errorText(e)}` });
  }
}

/**
 * 設定画面を開いたとき・タブに戻ってきたときの確認（同期オンのとき）。
 * 編集中でなければ黙って読み込み、編集中なら［読み込む］を出す。
 */
export async function checkRemoteOnSettings(pubkey: string, editing: boolean): Promise<void> {
  if (openCheck) await openCheck;
  if (!getSyncPref(pubkey).enabled || get(_status).syncBusy) return;
  let remote: Remote | null;
  try {
    remote = await fetchLatest(pubkey);
  } catch {
    return;
  }
  if (!remote || !getSyncPref(pubkey).enabled) return;
  const decision = decideOnOpen(remote.createdAt, getLocalSettings(), getSyncRecord(pubkey));
  if (decision !== 'apply') return;
  if (editing) {
    setStatus({ pendingRemoteAt: remote.createdAt });
    return;
  }
  try {
    await applyRemote(pubkey, remote);
  } catch (e) {
    setStatus({ syncError: `他の端末の設定を読み込めませんでした：${errorText(e)}` });
  }
}

/** 同期ブロックの［読み込む］ */
export async function loadPendingRemote(pubkey: string): Promise<void> {
  if (get(_status).syncBusy) return;
  setStatus({ syncBusy: true, syncError: '' });
  try {
    const remote = await fetchLatest(pubkey);
    if (remote) await applyRemote(pubkey, remote);
    setStatus({ syncBusy: false, pendingRemoteAt: 0 });
  } catch (e) {
    setStatus({ syncBusy: false, syncError: `読み込めませんでした：${errorText(e)}` });
  }
}

/** トグルをオンにしたとき */
export async function enableSync(pubkey: string): Promise<void> {
  if (get(_status).syncBusy) return;
  setStatus({ syncBusy: true, syncError: '' });
  try {
    const remote = await fetchLatest(pubkey);
    const decision = decideOnEnable(
      remote?.createdAt ?? null,
      getLocalSettings(),
      getSyncRecord(pubkey)
    );
    if (decision === 'ask') {
      setStatus({ syncBusy: false });
      _dialog.set({
        pubkey,
        context: 'choose',
        remoteCreatedAt: remote?.createdAt ?? 0,
        busy: false,
        error: ''
      });
      return;
    }
    if (decision === 'push') await pushSettings(pubkey, remote);
    if (decision === 'apply' && remote) await applyRemote(pubkey, remote);
    setSyncPref(pubkey, { enabled: true });
    setStatus({ syncBusy: false });
  } catch (e) {
    setStatus({ syncBusy: false, syncError: `同期を始められませんでした：${errorText(e)}` });
  }
}

/** トグルをオフにしたとき */
export function disableSync(pubkey: string): void {
  setSyncPref(pubkey, { ...getSyncPref(pubkey), enabled: false });
  setStatus({ pendingRemoteAt: 0, syncError: '' });
}

/**
 * 設定画面の「保存」。この端末に保存し、同期オンなら他の端末用にも送る。
 * pubkey が null（未ログイン）なら、この端末にだけ保存する。
 */
export async function saveSettings(pubkey: string | null, data: ClientSettingsData): Promise<void> {
  if (get(_status).saveBusy) return;
  setStatus({ saveBusy: true, saveMessage: '', saveError: '' });
  saveSettingsData(data);
  if (!pubkey || !getSyncPref(pubkey).enabled) {
    setStatus({ saveBusy: false, saveMessage: '保存しました' });
    return;
  }
  try {
    const remote = await fetchLatest(pubkey);
    await pushSettings(pubkey, remote);
    setStatus({ saveBusy: false, saveMessage: '保存しました' });
  } catch (e) {
    setStatus({
      saveBusy: false,
      saveError: `この端末には保存しました。他の端末との同期に失敗しました：${errorText(e)}`
    });
  }
}

async function runDialogAction(action: (pubkey: string) => Promise<void>): Promise<void> {
  const d = get(_dialog);
  if (!d || d.busy) return;
  _dialog.set({ ...d, busy: true, error: '' });
  try {
    await action(d.pubkey);
    setSyncPref(d.pubkey, { enabled: true });
    _dialog.set(null);
  } catch (e) {
    _dialog.set({ ...d, busy: false, error: errorText(e) });
  }
}

/**
 * ［同期する］［他の端末の設定］：他の端末の設定を読み込み、同期をオンにする
 * （この端末の設定は置き換わる）
 */
export function useRemoteSettings(): Promise<void> {
  return runDialogAction(async (pubkey) => {
    const remote = await fetchLatest(pubkey);
    if (remote) await applyRemote(pubkey, remote);
  });
}

/** ［この端末の設定］：この端末の設定を送り、同期をオンにする（他の端末の設定は上書きする） */
export function useLocalSettings(): Promise<void> {
  return runDialogAction(async (pubkey) => {
    const remote = await fetchLatest(pubkey);
    await pushSettings(pubkey, remote);
  });
}

/** ［同期しない］：同期はオフのまま。次からは聞かない */
export function declineSync(): void {
  const d = get(_dialog);
  if (!d || d.busy) return;
  setSyncPref(d.pubkey, { ...getSyncPref(d.pubkey), declined: true });
  _dialog.set(null);
}

/** ダイアログを閉じる（同期はオフのまま。ログイン時の確認なら次に開いたときにまた聞く） */
export function closeSyncDialog(): void {
  const d = get(_dialog);
  if (d && !d.busy) _dialog.set(null);
}

/** ログアウト・アカウント切り替え時に、前のアカウントの表示を消す */
export function clearSettingsSyncStatus(): void {
  _dialog.set(null);
  _status.set(IDLE);
}

/** 設定画面を開いたときに、前の結果の表示を消す */
export function clearSettingsMessages(): void {
  setStatus({ saveMessage: '', saveError: '', syncError: '' });
}
