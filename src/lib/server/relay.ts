/**
 * エッジ（Cloudflare Workers）からリレーへ 1 回だけ REQ を投げ、最初の EVENT を取る
 * 軽量ヘルパー。rx-nostr は使わない（rxjs を含み重く、Workers の WebSocket クライアント
 * モデルと噛み合わないため）。hooks.server.ts（OGP注入）からのみ使う。
 *
 * Workers の WebSocket クライアントは `fetch(httpUrl, { headers: { Upgrade: 'websocket' } })`
 * → `resp.webSocket.accept()` で確立する（標準 fetch 型には webSocket が無いのでキャストする）。
 */

// OGP 用の高速リレー（src/lib/stores/relays.ts の DEFAULT_RELAYS のうち応答が速いもの）。
const RELAYS = ['wss://yabu.me/', 'wss://r.kojira.io/', 'wss://nos.lol/'];

export interface NostrEvent {
  id: string;
  pubkey: string;
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

type Filter = Record<string, unknown>;

/* Cloudflare Workers 固有の WebSocket（accept() を持つ）。標準型に無いので最小限に定義。 */
interface CfWebSocket {
  accept(): void;
  send(data: string): void;
  close(): void;
  addEventListener(type: string, listener: (ev: { data?: unknown }) => void): void;
}

/** 1 リレーへ接続し、最初に一致した EVENT を返す。EOSE / タイムアウト / エラー時は null。 */
async function queryOne(
  relay: string,
  filter: Filter,
  timeoutMs: number
): Promise<NostrEvent | null> {
  const httpUrl = relay.replace(/^ws/, 'http');
  const resp = await fetch(httpUrl, { headers: { Upgrade: 'websocket' } });
  const ws = (resp as unknown as { webSocket?: CfWebSocket | null }).webSocket;
  if (!ws) return null;
  ws.accept();

  return await new Promise<NostrEvent | null>((resolve) => {
    const subId = crypto.randomUUID();
    let settled = false;
    const done = (v: NostrEvent | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(v);
    };
    const timer = setTimeout(() => done(null), timeoutMs);

    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
        if (Array.isArray(msg) && msg[1] === subId) {
          if (msg[0] === 'EVENT') done(msg[2] as NostrEvent);
          else if (msg[0] === 'EOSE') done(null);
        }
      } catch {
        /* ignore malformed frames */
      }
    });
    ws.addEventListener('close', () => done(null));
    ws.addEventListener('error', () => done(null));

    ws.send(JSON.stringify(['REQ', subId, filter]));
  });
}

/** 複数リレーをレースし、最初に得られた EVENT を返す。全滅なら null。 */
export async function fetchFirstEvent(
  filter: Filter,
  timeoutMs = 2500
): Promise<NostrEvent | null> {
  const tasks = RELAYS.map((relay) =>
    queryOne(relay, filter, timeoutMs).then((ev) => (ev ? ev : Promise.reject(new Error('none'))))
  );
  try {
    return await Promise.any(tasks);
  } catch {
    return null;
  }
}

/** イベントから指定タグの最初の値を取り出す。 */
export function tagValue(event: NostrEvent, key: string): string | undefined {
  return event.tags.find((t) => t[0] === key)?.[1];
}
