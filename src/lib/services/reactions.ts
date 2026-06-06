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
 * NOTE: until はリレー横断の単一カーソルだが、**全リレーの最古（min）へ一気に飛ばすと
 *       高頻度リレーを取りこぼす**。あるリレーが 1 ページ（PAGE_LIMIT）で返し切れない大量の
 *       リアクションを持つ場合、別の過疎リレーが返した古いイベントに引っ張られて until が
 *       一気に過去へ飛ぶと、その間の高頻度リレー分が二度と取得されない。これが「1000件あるのに
 *       510件で止まる」現象の正体。対策として **まだ続きがある（フルページを返した）リレーの
 *       最古値のうち最も新しいもの（watermark）までしか until を進めない**。過疎リレーには
 *       既取得分が重複再送されるが seen で弾く。watermark 方式により全リレーを取りこぼさない。
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
  listeners: Set<Listener>;
  touchedAt: number; // LRU 用
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

const entries = new Map<string, Entry>();
let tickTimer: ReturnType<typeof setTimeout> | null = null;

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
      listeners: new Set(),
      touchedAt: now()
    };
    entries.set(id, e);
  }
  return e;
}

function notify(entry: Entry): void {
  const info: ReactionInfo = { complete: entry.complete };
  for (const fn of entry.listeners) fn(entry.events, info);
}

/** 対象 id の次ページ（until=cursor）を 1 つ取得する。EOSE で完了。 */
function startPage(entry: Entry): void {
  entry.loading = true;
  const until = entry.cursor;
  const filters = {
    kinds: [7, 6, 16],
    '#e': [entry.id],
    limit: PAGE_LIMIT,
    ...(until !== undefined ? { until } : {})
  };
  // リレーごとの返却件数と最古 created_at を集計する（watermark 算出用）。
  const relayCount = new Map<string, number>();
  const relayMin = new Map<string, number>();
  entry.pageSub = getClient()
    .use(createRxOneshotReq({ filters }))
    .subscribe({
      next: ({ event, from }) => {
        const note = toNote(event);
        relayCount.set(from, (relayCount.get(from) ?? 0) + 1);
        const prevMin = relayMin.get(from);
        if (prevMin === undefined || note.createdAt < prevMin) relayMin.set(from, note.createdAt);
        if (entry.seen.has(note.id)) return;
        entry.seen.add(note.id);
        entry.events = [...entry.events, note];
        entry.touchedAt = now();
        notify(entry);
      },
      complete: () => {
        entry.loading = false;
        entry.pageSub = null;
        // フルページ（=PAGE_LIMIT 到達）を返したリレーはまだ続きがある。その最古値のうち
        // 最も新しいもの（watermark）までしか until を進めない。これより古くへ飛ばすと
        // フルページを返したリレーの中間分を取りこぼす（単一カーソル問題）。
        let watermark = -Infinity;
        let anyActive = false;
        for (const [r, c] of relayCount) {
          if (c >= PAGE_LIMIT) {
            anyActive = true;
            const m = relayMin.get(r)!;
            if (m > watermark) watermark = m;
          }
        }
        if (!anyActive) {
          // どのリレーもフルページ未満＝全リレー取り切り。
          entry.complete = true;
        } else {
          let nextCursor = watermark;
          // 進捗が無い（同一秒に PAGE_LIMIT 超が集中する病的ケース）は強制的に 1 秒戻して
          // カーソルの単調減少＝必ず終了することを保証する。
          if (until !== undefined && nextCursor >= until) nextCursor = until - 1;
          entry.cursor = nextCursor;
        }
        notify(entry);
        scheduleTick();
      },
      error: () => {
        entry.loading = false;
        entry.pageSub = null;
        // エラーは完了扱いにしない（再可視で再試行できるよう cursor は維持）。
        notify(entry);
        scheduleTick();
      }
    });
}

/** 取得を進めるべきエントリを選び、ページ取得を起動する（可視優先・背景は上限内）。 */
function tick(): void {
  const t = now();
  let bgInFlight = 0;
  for (const e of entries.values()) {
    if (e.loading && e.visibleCount === 0 && e.refCount > 0) bgInFlight++;
  }

  const eligible: { e: Entry; visible: boolean }[] = [];
  for (const e of entries.values()) {
    if (e.refCount <= 0 || e.complete || e.loading) continue;
    if (e.visibleCount > 0) eligible.push({ e, visible: true });
    else if (t < e.graceUntil) eligible.push({ e, visible: false });
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
}

function scheduleTick(): void {
  if (tickTimer) clearTimeout(tickTimer);
  tickTimer = setTimeout(() => {
    tickTimer = null;
    tick();
  }, TICK_DEBOUNCE);
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
      }
      evictIdle();
      scheduleTick();
    }
  };
}
