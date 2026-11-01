import { get, writable } from 'svelte/store';
import { collectObservable } from '$lib/utils/rxCollect';
import {
  decideAutoPull,
  remoteChangedSinceSync,
  settingsDataFromJson,
  settingsDataToJson,
  type ClientSettingsData
} from '$lib/utils/clientLinks';
import {
  applyRemoteSettings,
  getLocalSettings,
  getSyncRecord,
  markSynced
} from '$lib/stores/clientSettings';
import { fetchAppData, fetchUserWriteRelays } from './nostrFetch';
import { publishAppData } from './nostrPublish';

// 設定（シェア先・「○○で開く」）を Nostr と同期する。
// NIP-78 の kind:30078（d タグ = SETTINGS_D_TAG）に、設定の JSON を NIP-44 で自分宛てに
// 暗号化して保存する。保存は設定画面のボタンから、読み込みはログイン時に自動と設定画面のボタンから。
// 前回そろえた後に、この端末と別の端末の両方で設定が変わっていたら（競合）、どちらも上書きせず
// 設定画面でどちらを使うか選んでもらう。

export const SETTINGS_D_TAG = 'matometr/settings';

export interface SyncUiState {
  busy: 'load' | 'save' | null;
  message: string;
  error: string;
  /** message / error を出したときの設定の updatedAt。その後に設定を変えたら表示しない */
  at: number;
  /** 別の端末で保存した設定と、この端末の未保存の変更が競合している */
  conflict: boolean;
}

const IDLE: SyncUiState = { busy: null, message: '', error: '', at: 0, conflict: false };
const _status = writable<SyncUiState>(IDLE);
export const settingsSyncStatus = { subscribe: _status.subscribe };

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

export type PullResult = 'applied' | 'none' | 'up-to-date' | 'conflict';

/**
 * Nostr に保存した設定を読み込む。
 * force = false（ログイン時の自動読み込み）は、前回そろえた後に Nostr 側だけが更新されて
 * いるときに置き換える。この端末にも未保存の変更があれば 'conflict' を返し、何もしない。
 * 復号は置き換えるときだけ行う。
 * force = true（読み込みボタン・競合の解決）は、Nostr にあれば必ず置き換える。
 */
export async function pullSettings(pubkey: string, force: boolean): Promise<PullResult> {
  const remote = await fetchLatest(pubkey);
  if (!remote) return 'none';

  if (!force) {
    const decision = decideAutoPull(remote.createdAt, getLocalSettings(), getSyncRecord(pubkey));
    if (decision !== 'apply') return decision;
  }

  const data = await decrypt(pubkey, remote.content);
  applyRemoteSettings(pubkey, data, remote.createdAt);
  return 'applied';
}

/**
 * この端末の設定を暗号化して Nostr に保存する。
 * checkConflict = true（保存ボタン）は、前回そろえた後に別の端末で保存されていたら
 * 上書きせず 'conflict' を返す。false（競合の解決で「この端末の設定を使う」）は必ず保存する。
 */
export async function pushSettings(
  pubkey: string,
  checkConflict: boolean
): Promise<'saved' | 'conflict'> {
  const remote = await fetchLatest(pubkey);
  const record = getSyncRecord(pubkey);
  if (checkConflict && remote && remoteChangedSinceSync(remote.createdAt, record)) {
    return 'conflict';
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
  // 時計が進んでいる別の端末の保存と同じ秒・それ以前にならないようにする。
  const createdAt = Math.max(
    Math.floor(Date.now() / 1000),
    (record?.remoteCreatedAt ?? 0) + 1,
    (remote?.createdAt ?? 0) + 1
  );
  await publishAppData({ dTag: SETTINGS_D_TAG, content, createdAt });
  markSynced(pubkey, createdAt, local.updatedAt);
  return 'saved';
}

function finish(message: string, error = '', conflict = false): void {
  _status.set({ busy: null, message, error, at: getLocalSettings().updatedAt, conflict });
}

function showConflict(): void {
  finish('', '', true);
}

function isBusy(): boolean {
  return get(_status).busy !== null;
}

/** 設定画面の「Nostr に保存」 */
export async function saveSettingsToNostr(pubkey: string): Promise<void> {
  if (isBusy()) return;
  _status.set({ ...IDLE, busy: 'save' });
  try {
    if ((await pushSettings(pubkey, true)) === 'conflict') {
      showConflict();
      return;
    }
    finish('Nostr に保存しました');
  } catch (e) {
    finish('', `保存できませんでした：${errorText(e)}`);
  }
}

/** 設定画面の「Nostr から読み込む」 */
export async function loadSettingsFromNostr(pubkey: string): Promise<void> {
  if (isBusy()) return;
  _status.set({ ...IDLE, busy: 'load' });
  try {
    const result = await pullSettings(pubkey, true);
    finish(
      result === 'none' ? 'Nostr に保存された設定はありません' : 'Nostr の設定を読み込みました'
    );
  } catch (e) {
    finish('', `読み込めませんでした：${errorText(e)}`);
  }
}

/** ログイン時の自動読み込み。新しい設定があったときだけ知らせる */
export async function autoPullSettings(pubkey: string): Promise<void> {
  if (isBusy()) return;
  _status.set({ ...IDLE, busy: 'load' });
  try {
    const result = await pullSettings(pubkey, false);
    if (result === 'conflict') {
      showConflict();
      return;
    }
    finish(result === 'applied' ? '別の端末で保存した設定を読み込みました' : '');
  } catch (e) {
    finish('', `Nostr の設定を読み込めませんでした：${errorText(e)}`);
  }
}

/** 競合の解決：「この端末の設定を使う」（Nostr に保存して、別の端末の設定を上書きする） */
export async function useLocalSettings(pubkey: string): Promise<void> {
  if (isBusy()) return;
  _status.set({ ...IDLE, busy: 'save', conflict: true });
  try {
    await pushSettings(pubkey, false);
    finish('この端末の設定を保存しました');
  } catch (e) {
    finish('', `保存できませんでした：${errorText(e)}`, true);
  }
}

/** 競合の解決：「別の端末の設定を使う」（読み込んで、この端末の未保存の変更を捨てる） */
export async function useRemoteSettings(pubkey: string): Promise<void> {
  if (isBusy()) return;
  _status.set({ ...IDLE, busy: 'load', conflict: true });
  try {
    const result = await pullSettings(pubkey, true);
    finish(
      result === 'none'
        ? 'Nostr に保存された設定はありません'
        : '別の端末で保存した設定を読み込みました'
    );
  } catch (e) {
    finish('', `読み込めませんでした：${errorText(e)}`, true);
  }
}

/** ログアウト・アカウント切り替え時に、前のアカウントの表示を消す */
export function clearSettingsSyncStatus(): void {
  _status.set(IDLE);
}
