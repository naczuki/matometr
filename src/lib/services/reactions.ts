import { createRxForwardReq } from 'rx-nostr';
import type { EventPacket } from 'rx-nostr';
import type { Subscription } from 'rxjs';
import type { Note } from '$lib/types';
import { toNote, getClient } from './nostrCore';

/**
 * リアクション(kind:7)・リポスト(kind:6/16) の共有購読マネージャ（段取り3）。
 *
 * 設計の要点:
 * - 購読は NoteCard 単位ではなく **対象ポスト id 単位**で管理する。
 * - **参照カウント**: 同一イベントが複数カードに登場し両方開かれても、id 単位で
 *   購読は1本に集約。最後の参照が閉じたら filter から外す。
 * - 開いている id を束ねて **forward REQ 1 本**に集約する。rx-nostr の forward 戦略は
 *   「同一 subId・新しい emit で古い REQ を上書き終了」なので、開いている id 集合が
 *   変わるたびに `#e:[...allIds]`（多ければチャンク分割した複数フィルタ）を emit し直す
 *   だけで、id ごとに REQ を乱発せず 1 本にまとめられる。
 * - 届いたイベントは `e` タグで対象 id ごとのキャッシュに振り分ける。**潰さない**
 *   （同一 pubkey の同一絵文字も回数ぶん保持）。重複排除はイベント id の二重取得防止のみ。
 * - キャッシュは参照ゼロでも捨てない（staleTime 無限相当）。再オープン時に即再生。
 *
 * NOTE: 3 状態ライフサイクル・同時完走上限・LRU・画面外停止/復帰・カーソル継続
 *       （段取り4〜5）は本マネージャの上に後から載せる。
 */

type Listener = (events: Note[]) => void;

interface Entry {
  id: string;
  refCount: number;
  events: Note[];
  seen: Set<string>;
  listeners: Set<Listener>;
}

// 1 フィルタに並べる #e の上限。巨大 #e フィルタ（数百並べ）を避けるためチャンク分割する。
const CHUNK = 20;
// 連打・大量オープン時に emit を畳むデバウンス（ms）。
const EMIT_DEBOUNCE = 80;

const entries = new Map<string, Entry>();
let forwardReq: ReturnType<typeof createRxForwardReq> | null = null;
let sub: Subscription | null = null;
let emitTimer: ReturnType<typeof setTimeout> | null = null;

function getEntry(id: string): Entry {
  let e = entries.get(id);
  if (!e) {
    e = { id, refCount: 0, events: [], seen: new Set(), listeners: new Set() };
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
  // 購読中の #e は activeIds だけなので、e タグが一致する開いている id に振り分ける。
  for (const tag of event.tags) {
    if (tag[0] !== 'e' || !tag[1]) continue;
    const entry = entries.get(tag[1]);
    if (!entry || entry.seen.has(note.id)) continue;
    entry.seen.add(note.id);
    entry.events = [...entry.events, note];
    notify(entry);
  }
}

function activeIds(): string[] {
  const ids: string[] = [];
  for (const e of entries.values()) if (e.refCount > 0) ids.push(e.id);
  return ids;
}

function applyFilters(): void {
  const ids = activeIds();
  if (ids.length === 0) {
    // 開いている id がなくなったら REQ ごと閉じる。
    sub?.unsubscribe();
    sub = null;
    forwardReq = null;
    return;
  }
  if (!forwardReq || !sub) {
    forwardReq = createRxForwardReq();
    // forward REQ は subscribe 確立後に emit する必要がある（先に emit すると流れない）。
    sub = getClient()
      .use(forwardReq)
      .subscribe({ next: route, error: () => {} });
  }
  const filters = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    filters.push({ kinds: [7, 6, 16], '#e': ids.slice(i, i + CHUNK) });
  }
  forwardReq.emit(filters);
}

function scheduleApply(): void {
  if (emitTimer) clearTimeout(emitTimer);
  emitTimer = setTimeout(() => {
    emitTimer = null;
    applyFilters();
  }, EMIT_DEBOUNCE);
}

/**
 * 対象ポスト id のリアクション/リポストを購読する。
 * - 参照カウントを 1 増やし、現在のキャッシュを即座に listener へ再生する。
 * - 戻り値の関数を呼ぶと参照を 1 減らす（最後の参照が外れたら filter から除外）。
 */
export function openReactions(id: string, listener: Listener): () => void {
  const entry = getEntry(id);
  entry.refCount++;
  entry.listeners.add(listener);
  // キャッシュ即時再生（再オープンでも真っ白にならない）
  listener(entry.events);
  scheduleApply();

  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    entry.listeners.delete(listener);
    entry.refCount = Math.max(0, entry.refCount - 1);
    // キャッシュ(entry.events / seen)は捨てない。filter から外すだけ。
    scheduleApply();
  };
}
