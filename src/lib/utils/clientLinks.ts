// 外部クライアントへのリンク設定（シェア先・「○○で開く」）の型・既定値・URL 組み立て。
// 保存（localStorage）は $lib/stores/clientSettings が担い、ここは副作用のない関数だけを置く。

/** 設定の種類。share = Nos ボタンのシェア先、open = 投稿メニューの「○○で開く」 */
export type ClientLinkKind = 'share' | 'open';

export interface ClientLink {
  id: string;
  name: string;
  /** プレースホルダ入りの URL テンプレート */
  url: string;
  /** アイコン URL（既定のシェア先のみ。未指定ならサイトの /favicon.ico を使う） */
  icon?: string;
  /** メニューに表示するか */
  enabled: boolean;
}

/** シェア先 URL のプレースホルダ。シェアする文章（URL エンコード済み）に置き換わる */
export const SHARE_PLACEHOLDER = '{text}';

/** 「○○で開く」URL のプレースホルダ。投稿の ID に置き換わる */
export const OPEN_PLACEHOLDERS = ['{nevent}', '{note}', '{id}'] as const;

export const PLACEHOLDERS: Record<ClientLinkKind, readonly string[]> = {
  share: [SHARE_PLACEHOLDER],
  open: OPEN_PLACEHOLDERS
};

export const NAME_MAX_LENGTH = 40;

// nostr-share-component（@konemono/nostr-share-component, Apache-2.0）の一覧と同じ並び。
// Lumilumi は同コンポーネント 0.6.0 で {tags} が付いたが、まとめたーはタグを渡さないので外している。
export const DEFAULT_SHARE_CLIENTS: readonly ClientLink[] = [
  {
    id: 'ehagaki',
    name: 'eHagaki',
    url: 'https://lokuyow.github.io/ehagaki/?content={text}',
    icon: 'https://lokuyow.github.io/ehagaki/favicon.ico',
    enabled: true
  },
  {
    id: 'nokakoi',
    name: 'nokakoi',
    url: 'https://nokakoi.com/app/?text={text}',
    icon: 'https://nokakoi.com/favicon.ico',
    enabled: true
  },
  {
    id: 'noshaiku',
    name: 'Nos Haiku',
    url: 'https://nos-haiku.vercel.app/antenna?content={text}',
    icon: 'https://nos-haiku.vercel.app/favicon.png',
    enabled: true
  },
  {
    id: 'nostter',
    name: 'nostter',
    url: 'https://nostter.app/post?content={text}',
    icon: 'https://nostter.app/favicon.ico',
    enabled: true
  },
  {
    id: 'lumilumi',
    name: 'Lumilumi',
    url: 'https://lumilumi.app/post?text={text}',
    icon: 'https://lumilumi.app/favicon.ico',
    enabled: true
  }
];

export const DEFAULT_OPEN_CLIENTS: readonly ClientLink[] = [
  {
    id: 'nostter',
    name: 'nostter',
    url: 'https://nostter.app/{nevent}',
    enabled: true
  }
];

export const DEFAULT_CLIENTS: Record<ClientLinkKind, readonly ClientLink[]> = {
  share: DEFAULT_SHARE_CLIENTS,
  open: DEFAULT_OPEN_CLIENTS
};

export function cloneDefaults(kind: ClientLinkKind): ClientLink[] {
  return DEFAULT_CLIENTS[kind].map((c) => ({ ...c }));
}

function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'クライアント名を入力してください';
  if (trimmed.length > NAME_MAX_LENGTH)
    return `クライアント名は${NAME_MAX_LENGTH}文字以内にしてください`;
  return null;
}

/** URL テンプレートの問題点を返す。問題なければ null */
export function validateUrl(kind: ClientLinkKind, url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return 'URL を入力してください';
  if (!isHttpUrl(trimmed)) return 'https:// または http:// で始まる URL を入力してください';
  const placeholders = PLACEHOLDERS[kind];
  if (!placeholders.some((p) => trimmed.includes(p))) {
    return placeholders.length === 1
      ? `URL に ${placeholders[0]} を入れてください`
      : `URL に ${placeholders.join(' / ')} のどれかを入れてください`;
  }
  return null;
}

/** メニューに出せる状態か（表示オン かつ 名前・URL が正しい） */
export function isUsable(kind: ClientLinkKind, link: ClientLink): boolean {
  return link.enabled && validateName(link.name) === null && validateUrl(kind, link.url) === null;
}

function replaceAllLiteral(source: string, search: string, value: string): string {
  return source.split(search).join(value);
}

/** シェア先 URL の {text} をシェアする文章で置き換える */
export function fillShareUrl(template: string, text: string): string {
  return replaceAllLiteral(template.trim(), SHARE_PLACEHOLDER, encodeURIComponent(text));
}

export interface EventIds {
  nevent: string;
  note: string;
  /** 16 進のイベント ID */
  id: string;
}

/** 「○○で開く」URL の {nevent} / {note} / {id} を投稿の ID で置き換える */
export function fillOpenUrl(template: string, ids: EventIds): string {
  let url = template.trim();
  url = replaceAllLiteral(url, '{nevent}', encodeURIComponent(ids.nevent));
  url = replaceAllLiteral(url, '{note}', encodeURIComponent(ids.note));
  url = replaceAllLiteral(url, '{id}', encodeURIComponent(ids.id));
  return url;
}

function originOf(url: string): string | null {
  try {
    return new URL(url.trim()).origin;
  } catch {
    return null;
  }
}

/**
 * アイコン URL。既定のアイコンはシェア先と同じサイトのときだけ使い、
 * それ以外はシェア先サイトの /favicon.ico を使う。URL が不正なら null。
 */
export function clientIconUrl(link: ClientLink): string | null {
  const origin = originOf(link.url);
  if (!origin || !isHttpUrl(link.url.trim())) return null;
  if (link.icon && originOf(link.icon) === origin) return link.icon;
  return `${origin}/favicon.ico`;
}

/**
 * localStorage から読んだ値を ClientLink[] に整える。
 * 形の合わない要素は捨て、配列でなければ null（＝既定値を使う）を返す。
 */
export function sanitizeClientLinks(value: unknown): ClientLink[] | null {
  if (!Array.isArray(value)) return null;
  const result: ClientLink[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const { id, name, url, icon, enabled } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !id || seen.has(id)) continue;
    if (typeof name !== 'string' || typeof url !== 'string') continue;
    seen.add(id);
    const link: ClientLink = { id, name, url, enabled: enabled !== false };
    if (typeof icon === 'string' && isHttpUrl(icon)) link.icon = icon;
    result.push(link);
  }
  return result;
}

/** 種類ごとの一覧。null は「変更していない（既定値を使う）」 */
export type ClientSettingsData = Record<ClientLinkKind, ClientLink[] | null>;

/** 設定データの形式バージョン（localStorage と Nostr 同期で共通） */
export const SETTINGS_FORMAT_VERSION = 1;

export function emptySettingsData(): ClientSettingsData {
  return { share: null, open: null };
}

/** 設定データを保存用のオブジェクトにする。変更していない種類は書かない */
export function settingsDataToJson(data: ClientSettingsData): Record<string, unknown> {
  const json: Record<string, unknown> = { v: SETTINGS_FORMAT_VERSION };
  if (data.share !== null) json.share = data.share;
  if (data.open !== null) json.open = data.open;
  return json;
}

/** 保存されていたオブジェクトを設定データに戻す。形式が違えば null */
export function settingsDataFromJson(value: unknown): ClientSettingsData | null {
  if (!value || typeof value !== 'object') return null;
  const json = value as Record<string, unknown>;
  if (json.v !== SETTINGS_FORMAT_VERSION) return null;
  return {
    share: sanitizeClientLinks(json.share),
    open: sanitizeClientLinks(json.open)
  };
}

/** この端末の設定と、最後に設定を変えた時刻 */
export interface LocalSettingsState {
  data: ClientSettingsData;
  /** この端末で最後に設定が変わった時刻（ミリ秒）。0 = 一度も変えていない */
  updatedAt: number;
}

/** Nostr と最後にそろえた時点の記録（アカウントごと） */
export interface SyncRecord {
  /** そろえた kind:30078 の created_at（秒） */
  remoteCreatedAt: number;
  /** そのときのこの端末の設定の updatedAt（ミリ秒） */
  localUpdatedAt: number;
}

/** Nostr へ保存していない変更があるか */
export function hasUnsavedChanges(
  state: LocalSettingsState,
  record: SyncRecord | undefined
): boolean {
  if (record) return state.updatedAt !== record.localUpdatedAt;
  return state.updatedAt > 0 || state.data.share !== null || state.data.open !== null;
}

/** 前回そろえた後に、Nostr 側の設定が（別の端末で）保存されたか */
export function remoteChangedSinceSync(
  remoteCreatedAt: number,
  record: SyncRecord | undefined
): boolean {
  return !record || remoteCreatedAt > record.remoteCreatedAt;
}

/**
 * Nostr の設定（created_at 秒）とこの端末の設定をどうするか。
 * - up-to-date: 前回そろえた後に Nostr 側が更新されていない（復号もしない）
 * - apply: Nostr 側だけが更新されている → 読み込む
 * - conflict: 両方が更新されている → どちらを使うか利用者に選んでもらう
 */
export function decideAutoPull(
  remoteCreatedAt: number,
  state: LocalSettingsState,
  record: SyncRecord | undefined
): 'apply' | 'up-to-date' | 'conflict' {
  if (!remoteChangedSinceSync(remoteCreatedAt, record)) return 'up-to-date';
  return hasUnsavedChanges(state, record) ? 'conflict' : 'apply';
}
