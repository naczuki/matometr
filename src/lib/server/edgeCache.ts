// Cloudflare Workers の Cache API（caches.default）。開発サーバーやテストでは無いので null。

export type EdgeCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

export function edgeCache(): EdgeCache | null {
  const c = (globalThis as { caches?: { default?: EdgeCache } }).caches;
  return c?.default ?? null;
}
