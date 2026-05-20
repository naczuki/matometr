import type { Observable } from 'rxjs';

/**
 * Observable から最後の値を一度だけ取り出す。
 * complete・error・タイムアウトいずれの場合も fallback を resolve に渡す。
 */
export function collectObservable<T>(
  obs: Observable<T>,
  fallback: T,
  timeoutMs = 8000
): Promise<T> {
  return new Promise((resolve) => {
    let value: T = fallback;
    const sub = obs.subscribe({
      next: (v) => (value = v),
      complete: () => { sub.unsubscribe(); resolve(value); },
      error: () => { sub.unsubscribe(); resolve(value); }
    });
    setTimeout(() => { sub.unsubscribe(); resolve(value); }, timeoutMs);
  });
}
