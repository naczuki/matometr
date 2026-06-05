import { createRxForwardReq } from 'rx-nostr';
import type { EventPacket } from 'rx-nostr';
import type { Subscription } from 'rxjs';
import type { Note } from '$lib/types';
import { toNote, getClient } from './nostrCore';

/**
 * リアクション(kind:7)・リポスト(kind:6/16) の共有購読マネージャ（段取り3〜5）。
 *
 * 段取り3（集約・参照カウント）:
 * - 購読は対象ポスト id 単位で管理し、参照カウントで複数カードを 1 本に集約。
 * - forward 戦略の「同一 subId・新 emit で旧 REQ を上書き終了」を利用し、active な
 *   id 集合が変わるたび `#e:[...ids]`（CHUNK 分割）を 1 本の forward REQ に emit し直す。
 * - 届いたイベントは e タグで対象 id のキャッシュへ振り分け、イベント id で重複排除
 *   （潰さない）。キャッシュは参照ゼロでも捨てない。
 *
 * 段取り4〜5（ライフサイクル・画面外停止/復帰）:
 * - 3 状態を可視性で表現する:
 *   - **フル**: 可視な open がある id。常に filter に載せる（live も受け続ける）。
 *   - **バックグラウンド継続**: open だが全カードが画面外。画面外化から GRACE_MS の間は
 *     filter に残し裏で取得を続ける。「重いポストを開いて待つ間に他を読み、戻ったら
 *     終わっている」を満たす。同時本数は BG_LIMIT 本まで（超過分は待機）。
 *   - **一時停止**: グレース切れ or BG_LIMIT 超過の画面外 open。filter から外す。
 *     キャッシュは保持し、再可視時に再開（イベント id 重複排除で続きから安全に再取得）。
 * - 復帰トリガーは NoteCard 側の IntersectionObserver（setVisible で通知）。
 * - emit はデバウンス。idle なエントリは LRU でキャッシュ上限を超えたら破棄。
 *
 * NOTE: リレーごと until カーソルによる「再取得の帯域節約」は未実装（重複排除で
 *       再開の正しさは担保済み。帯域最適化として後続で足せる）。
 */

type Listener = (events: Note[]) => void;

interface Entry {
  id: string;
  refCount: number; // 開いている listener 数
  visibleCount: number; // そのうち画面内の listener 数
  graceUntil: number; // 画面外化した時刻 + GRACE_MS（可視中は 0）
  events: Note[];
  seen: Set<string>;
  listeners: Set<Listener>;
  touchedAt: number; // LRU 用
}

export interface ReactionHandle {
  close(): void;
  setVisible(visible: boolean): void;
}

// 1 フィルタに並べる #e の上限（巨大 #e フィルタを避けるためチャンク分割）。
const CHUNK = 20;
// 連打・大量オープン時に emit を畳むデバウンス（ms）。
const EMIT_DEBOUNCE = 80;
// 画面外化してから filter に残す猶予（ms）。chapi 補足「30秒程度維持して降格」。
const GRACE_MS = 30_000;
// 裏で同時に取得継続する本数の上限（耐久ポスト複数仕掛けを想定）。
const BG_LIMIT = 4;
// キャッシュ保持する idle エントリ数の上限（超過分は LRU 破棄）。
const MAX_IDLE_ENTRIES = 60;

const entries = new Map<string, Entry>();
let forwardReq: ReturnType<typeof createRxForwardReq> | null = null;
let sub: Subscription | null = null;
let emitTimer: ReturnType<typeof setTimeout> | null = null;
let graceTimer: ReturnType<typeof setTimeout> | null = null;

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
      listeners: new Set(),
      touchedAt: now()
    };
    entries.set(id, e);
  }
  return e;
}

function notify(entry: Entry): void {
  const snapshot = entry.events;
  for (const fn of entry.listeners) fn(snapshot);
}

function route(packet: EventPacket): void {
  const event = packet.event;
  const note = toNote(event);
  // 購読中の #e は active な id だけなので、一致する開いている id に振り分ける。
  for (const tag of event.tags) {
    if (tag[0] !== 'e' || !tag[1]) continue;
    const entry = entries.get(tag[1]);
    if (!entry || entry.seen.has(note.id)) continue;
    entry.seen.add(note.id);
    entry.events = [...entry.events, note];
    entry.touchedAt = now();
    notify(entry);
  }
}

/**
 * filter に載せる id を決める。
 * - 可視な open（フル）は全部。
 * - 画面外 open はグレース内のものを、直近まで可視だった順に BG_LIMIT 本まで。
 */
function computeActiveIds(): string[] {
  const t = now();
  const full: Entry[] = [];
  const bg: Entry[] = [];
  for (const e of entries.values()) {
    if (e.refCount <= 0) continue;
    if (e.visibleCount > 0) full.push(e);
    else if (t < e.graceUntil) bg.push(e);
  }
  // 直近まで可視だった（graceUntil が大きい）ものを優先して継続。
  bg.sort((a, b) => b.graceUntil - a.graceUntil);
  return [...full, ...bg.slice(0, BG_LIMIT)].map((e) => e.id);
}

function applyFilters(): void {
  const ids = computeActiveIds();
  if (ids.length === 0) {
    sub?.unsubscribe();
    sub = null;
    forwardReq = null;
    scheduleGrace();
    return;
  }
  if (!forwardReq || !sub) {
    forwardReq = createRxForwardReq();
    // forward REQ は subscribe 確立後に emit する必要がある。
    sub = getClient()
      .use(forwardReq)
      .subscribe({ next: route, error: () => {} });
  }
  const filters = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    filters.push({ kinds: [7, 6, 16], '#e': ids.slice(i, i + CHUNK) });
  }
  forwardReq.emit(filters);
  scheduleGrace();
}

function scheduleApply(): void {
  if (emitTimer) clearTimeout(emitTimer);
  emitTimer = setTimeout(() => {
    emitTimer = null;
    applyFilters();
  }, EMIT_DEBOUNCE);
}

/** 次にグレースが切れる画面外エントリの時刻に再適用を仕込む（降格を反映するため）。 */
function scheduleGrace(): void {
  if (graceTimer) {
    clearTimeout(graceTimer);
    graceTimer = null;
  }
  const t = now();
  let soonest = Infinity;
  for (const e of entries.values()) {
    if (e.refCount > 0 && e.visibleCount === 0 && e.graceUntil > t) {
      soonest = Math.min(soonest, e.graceUntil);
    }
  }
  if (soonest !== Infinity) {
    graceTimer = setTimeout(
      () => {
        graceTimer = null;
        applyFilters();
      },
      Math.max(0, soonest - t) + 20
    );
  }
}

/** idle（参照ゼロ）エントリが上限を超えたら、古い順にキャッシュを破棄する。 */
function evictIdle(): void {
  const idle = [...entries.values()].filter((e) => e.refCount <= 0);
  if (idle.length <= MAX_IDLE_ENTRIES) return;
  idle.sort((a, b) => a.touchedAt - b.touchedAt);
  for (const e of idle.slice(0, idle.length - MAX_IDLE_ENTRIES)) entries.delete(e.id);
}

/**
 * 対象ポスト id のリアクション/リポストを購読する。
 * - 参照カウントを 1 増やし、現在のキャッシュを即座に listener へ再生する。
 * - 戻り値の `setVisible` で可視性を通知（フル/バックグラウンドの切り替え）。
 * - `close` で参照を 1 減らす。
 */
export function openReactions(id: string, listener: Listener): ReactionHandle {
  const entry = getEntry(id);
  entry.refCount++;
  entry.touchedAt = now();
  entry.listeners.add(listener);
  // キャッシュ即時再生（再オープンでも真っ白にならない）
  listener(entry.events);
  scheduleApply();

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
      scheduleApply();
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
      evictIdle();
      scheduleApply();
    }
  };
}
