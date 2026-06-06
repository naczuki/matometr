import { createRxOneshotReq } from 'rx-nostr';
import type { Subscription } from 'rxjs';
import type { Note } from '$lib/types';
import { toNote, getClient } from './nostrCore';

/**
 * リアクション(kind:7)・リポスト(kind:6/16) の共有取得マネージャ。
 *
 * 方針: **履歴取得のみ**（live forward は持たない）。まとめは過去のまとめなので、
 * 見たいのは「そのポストに付いた既存のリアクション」。新着のリアルタイム反映は本質では
 * ないため、`oneshot` REQ で履歴を取り切る方式にする。これにより:
 * - oneshot は **EOSE で完了**するので、「読み込み中…」の終了・件数完了が正確。
 * - 耐久ポスト（数百リアクション）は `limit` ＋ `until:最古` で**ページング**できる。
 *   forward 上書きで履歴ストリームが途切れる問題が無い。
 * - カーソル（until）が本来の用途で機能する。画面外で一時停止 → 再可視で続きから再開。
 *
 * 設計:
 * - 取得は対象ポスト id 単位で管理し、参照カウントで複数カードを 1 つのキャッシュに集約。
 * - 届いたイベントはイベント id で重複排除（**潰さない**：同一 pubkey の同一絵文字も
 *   回数ぶん保持）。キャッシュは参照ゼロでも捨てない（再オープンで即再生）。
 * - ライフサイクル: 可視 or（画面外でも GRACE_MS 内かつ BG_LIMIT 本まで）の間だけ
 *   ページ取得を進める。グレース切れ/上限超過の画面外は一時停止し、cursor から再開。
 *
 * NOTE: until はリレー横断の単一カーソル。あるリレーが他より古いイベントを持つ場合でも
 *       until は全リレーの最古なので取りこぼさない（既取得分は重複排除で弾く）。同一秒に
 *       PAGE_LIMIT を超えるリアクションが集中する病的ケースのみページングが止まる。
 */

export interface ReactionInfo {
  complete: boolean;
}
type Listener = (events: Note[], info: ReactionInfo) => void;

interface Entry {
  id: string;
  refCount: number; // 開いている listener 数
  visibleCount: number; // そのうち画面内の listener 数
  graceUntil: number; // 画面外化した時刻 + GRACE_MS（可視中は 0）
  events: Note[];
  seen: Set<string>;
  cursor: number | undefined; // 取得済み最古 created_at（次ページの until）
  complete: boolean; // これ以上 stored は無い
  loading: boolean; // ページ取得中
  pageSub: Subscription | null;
  pageTimer: ReturnType<typeof setTimeout> | null; // ページ完了の番人（EOSE 不達リレー対策）
  listeners: Set<Listener>;
  touchedAt: number; // LRU 用
  failCount: number; // 連続エラー回数（バックオフ用、成功で 0 に戻す）
  retryAt: number; // これ以前は再取得しない時刻（エラー時のバックオフ）
}

export interface ReactionHandle {
  close(): void;
  setVisible(visible: boolean): void;
}

// 1 ページの取得件数。多くのポストは 1 ページで取り切る。
const PAGE_LIMIT = 100;
// 画面外化してから取得を続ける猶予（ms）。chapi 補足「30秒程度維持して降格」。
const GRACE_MS = 30_000;
// 画面外で同時にページ取得を進める本数の上限（耐久ポスト複数仕掛けを想定）。
const BG_LIMIT = 4;
// キャッシュ保持する idle エントリ数の上限（超過分は LRU 破棄）。
const MAX_IDLE_ENTRIES = 60;
// 開閉・可視性変化を畳むデバウンス（ms）。
const TICK_DEBOUNCE = 80;
// エラー再試行の基準待機（ms）。failCount に応じて指数的に伸ばす。
const RETRY_BASE_MS = 2_000;
// エラー再試行の上限待機（ms）。恒久故障でも最悪この間隔までしか詰めない。
const RETRY_MAX_MS = 60_000;
// 1 ページの完了を待つ最大時間（ms）。EOSE を返さない/イベントを流し続けて
// rx-nostr の eoseTimeout が発火しないリレーに当たっても、ここで打ち切って前進させる。
const PAGE_TIMEOUT_MS = 20_000;

const entries = new Map<string, Entry>();
let tickTimer: ReturnType<typeof setTimeout> | null = null;
// バックオフ待ちエントリを起こすための専用タイマ（最短の retryAt に合わせて 1 本だけ張る）。
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimerAt = 0;

const now = (): number => Date.now();

function getEntry(id: string): Entry {
  let e = entries.get(id);
  if (!e) {
    e = {
      id,
      refCount: 0,
      visibleCount: 0,
      graceUntil: 0,
      events: [],
      seen: new Set(),
      cursor: undefined,
      complete: false,
      loading: false,
      pageSub: null,
      pageTimer: null,
      listeners: new Set(),
      touchedAt: now(),
      failCount: 0,
      retryAt: 0
    };
    entries.set(id, e);
  }
  return e;
}

function notify(entry: Entry): void {
  const info: ReactionInfo = { complete: entry.complete };
  for (const fn of entry.listeners) fn(entry.events, info);
}

/** エラー/タイムアウトを指数バックオフに変換する（完了扱いにはしない）。 */
function applyBackoff(entry: Entry): void {
  entry.failCount++;
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (entry.failCount - 1));
  entry.retryAt = now() + delay;
}

/** 取得済みページぶんを events に取り込み、cursor を最古へ進める（成功＝バックオフ解除）。 */
function absorbPage(entry: Entry, pageEvents: Note[], pageMin: number): void {
  entry.failCount = 0;
  entry.retryAt = 0;
  entry.events = entry.events.concat(pageEvents); // ページ単位で 1 度だけ複製
  entry.touchedAt = now();
  if (pageMin !== Infinity) {
    entry.cursor = entry.cursor === undefined ? pageMin : Math.min(entry.cursor, pageMin);
  }
}

/** 対象 id の次ページ（until=cursor）を 1 つ取得する。EOSE または番人タイマで完了。 */
function startPage(entry: Entry): void {
  entry.loading = true;
  const until = entry.cursor;
  const filters = {
    kinds: [7, 6, 16],
    '#e': [entry.id],
    limit: PAGE_LIMIT,
    ...(until !== undefined ? { until } : {})
  };
  // ページ受信中はバッファに溜め、EOSE（complete）で 1 度だけ反映・通知する。
  // 1 件ごとに events をコピー＆全 listener へ通知すると、耐久ポストで O(n^2) の
  // 配列コピー・再レンダリングになるため、ページ単位のバッチに畳む。
  const pageEvents: Note[] = [];
  let pageMin = Infinity;
  let settled = false;

  // complete / error / timeout のいずれか最初の 1 回だけ後始末する。
  const settle = (apply: () => void): void => {
    if (settled) return;
    settled = true;
    if (entry.pageTimer) {
      clearTimeout(entry.pageTimer);
      entry.pageTimer = null;
    }
    entry.loading = false;
    entry.pageSub = null;
    apply();
    notify(entry);
    scheduleTick();
  };

  entry.pageSub = getClient()
    .use(createRxOneshotReq({ filters }))
    .subscribe({
      next: ({ event }) => {
        const note = toNote(event);
        if (note.createdAt < pageMin) pageMin = note.createdAt;
        if (entry.seen.has(note.id)) return;
        entry.seen.add(note.id);
        pageEvents.push(note);
      },
      complete: () => {
        settle(() => {
          if (pageEvents.length === 0) {
            // 新規ゼロ＝これ以上古いものは無い（取り切り）。バックオフも解除。
            entry.failCount = 0;
            entry.retryAt = 0;
            entry.complete = true;
          } else {
            absorbPage(entry, pageEvents, pageMin);
          }
        });
      },
      error: () => {
        // エラーは完了扱いにしない（cursor は維持）。指数バックオフで再試行間隔を空け、
        // 恒久故障時に ~TICK_DEBOUNCE 間隔でリレーを叩き続けないようにする。
        settle(() => applyBackoff(entry));
      }
    });

  // 番人: rx-nostr の eoseTimeout が発火しない（EOSE 不達かつイベントを流し続ける）
  // リレーで oneshot が完了しないと loading に張り付くため、ここで打ち切る。
  entry.pageTimer = setTimeout(() => {
    const sub = entry.pageSub; // settle が null 化する前に確保
    settle(() => {
      if (pageEvents.length > 0) {
        // 部分取得済み。得たぶんを反映し cursor を進めて続行（complete にはしない）。
        absorbPage(entry, pageEvents, pageMin);
      } else {
        // 1 件も来ずにタイムアウト＝「無し」と確証できない。complete せずバックオフ再試行。
        applyBackoff(entry);
      }
    });
    sub?.unsubscribe(); // リレーへ CLOSE を送る
  }, PAGE_TIMEOUT_MS);
}

/** 取得を進めるべきエントリを選び、ページ取得を起動する（可視優先・背景は上限内）。 */
function tick(): void {
  const t = now();
  let bgInFlight = 0;
  for (const e of entries.values()) {
    if (e.loading && e.visibleCount === 0 && e.refCount > 0) bgInFlight++;
  }

  const eligible: { e: Entry; visible: boolean }[] = [];
  let nextRetry = Infinity; // バックオフ待ちで今は走れないエントリの最短 retryAt
  for (const e of entries.values()) {
    if (e.refCount <= 0 || e.complete || e.loading) continue;
    const active = e.visibleCount > 0 || t < e.graceUntil;
    if (!active) continue;
    if (t < e.retryAt) {
      // バックオフ待ち。後で起こせるよう最短時刻を覚えておく。
      if (e.retryAt < nextRetry) nextRetry = e.retryAt;
      continue;
    }
    eligible.push({ e, visible: e.visibleCount > 0 });
  }
  // 可視を先に、背景は直近まで可視だった（graceUntil 大）順に。
  eligible.sort((a, b) =>
    a.visible === b.visible ? b.e.graceUntil - a.e.graceUntil : a.visible ? -1 : 1
  );

  for (const { e, visible } of eligible) {
    if (visible) {
      startPage(e);
    } else if (bgInFlight < BG_LIMIT) {
      startPage(e);
      bgInFlight++;
    }
  }

  // バックオフ待ちのエントリがあれば、その時刻に合わせて再 tick を予約する
  // （イベント駆動の scheduleTick は来ないため、ここで自前で起こす）。
  if (nextRetry !== Infinity) armRetryTimer(nextRetry);
}

function scheduleTick(): void {
  if (tickTimer) clearTimeout(tickTimer);
  tickTimer = setTimeout(() => {
    tickTimer = null;
    tick();
  }, TICK_DEBOUNCE);
}

/** 指定時刻に tick を 1 回起こす（最短の予約だけを残す）。 */
function armRetryTimer(when: number): void {
  if (retryTimer && retryTimerAt <= when) return; // 既により早い予約がある
  if (retryTimer) clearTimeout(retryTimer);
  retryTimerAt = when;
  retryTimer = setTimeout(
    () => {
      retryTimer = null;
      retryTimerAt = 0;
      tick();
    },
    Math.max(0, when - now())
  );
}

/** idle（参照ゼロ）エントリが上限を超えたら、古い順にキャッシュを破棄する。 */
function evictIdle(): void {
  const idle = [...entries.values()].filter((e) => e.refCount <= 0);
  if (idle.length <= MAX_IDLE_ENTRIES) return;
  idle.sort((a, b) => a.touchedAt - b.touchedAt);
  for (const e of idle.slice(0, idle.length - MAX_IDLE_ENTRIES)) entries.delete(e.id);
}

/**
 * 対象ポスト id のリアクション/リポスト履歴を取得する。
 * - 参照カウントを 1 増やし、現在のキャッシュを即座に listener へ再生する。
 * - `setVisible` で可視性を通知（画面外の取得継続/一時停止の切替）。
 * - `close` で参照を 1 減らす。
 */
export function openReactions(id: string, listener: Listener): ReactionHandle {
  const entry = getEntry(id);
  entry.refCount++;
  entry.touchedAt = now();
  // 明示的な再オープンはユーザの「見たい」意思表示。バックオフ待ちなら解除して即試行。
  entry.retryAt = 0;
  entry.failCount = 0;
  entry.listeners.add(listener);
  // キャッシュ即時再生（再オープンでも真っ白にならない）
  listener(entry.events, { complete: entry.complete });
  scheduleTick();

  let closed = false;
  let visible = false;

  return {
    setVisible(v: boolean): void {
      if (closed || v === visible) return;
      visible = v;
      if (v) {
        entry.visibleCount++;
        entry.graceUntil = 0;
      } else {
        entry.visibleCount = Math.max(0, entry.visibleCount - 1);
        if (entry.visibleCount === 0) entry.graceUntil = now() + GRACE_MS;
      }
      scheduleTick();
    },
    close(): void {
      if (closed) return;
      closed = true;
      entry.listeners.delete(listener);
      if (visible) {
        entry.visibleCount = Math.max(0, entry.visibleCount - 1);
        if (entry.visibleCount === 0) entry.graceUntil = now() + GRACE_MS;
      }
      entry.refCount = Math.max(0, entry.refCount - 1);
      entry.touchedAt = now();
      // 誰も見ていないなら取得中ページを中断（cursor は維持、再オープンで再開）。
      if (entry.refCount === 0 && entry.pageSub) {
        entry.pageSub.unsubscribe();
        entry.pageSub = null;
        entry.loading = false;
        if (entry.pageTimer) {
          clearTimeout(entry.pageTimer);
          entry.pageTimer = null;
        }
      }
      evictIdle();
      scheduleTick();
    }
  };
}
