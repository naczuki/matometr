/**
 * リレーごとに独立した until カーソルを持つ watermark ページングの共通ブックキーピング。
 *
 * - cursors: ソースキー -> これまでに取得した最古タイムスタンプ
 * - exhausted: もう取得対象が無いソースキー
 *
 * タイムスタンプの種類（createdAt / reactedAt）には依存せず、呼び出し側が生の数値を渡す。
 * 実際のネットワーク取得（fetchOne）と候補収集はコンポーネント側に残す。
 */
export interface WatermarkPagerOptions {
  batchSize?: number;
  maxInnerIterations?: number;
}

export class WatermarkPager {
  private readonly cursors = new Map<string, number>();
  private readonly exhausted = new Set<string>();
  private readonly batchSize: number;
  private readonly maxInnerIterations: number;

  constructor(opts: WatermarkPagerOptions = {}) {
    this.batchSize = opts.batchSize ?? 30;
    this.maxInnerIterations = opts.maxInnerIterations ?? 10;
  }

  reset(): void {
    this.cursors.clear();
    this.exhausted.clear();
  }

  getCursor(key: string): number | undefined {
    return this.cursors.get(key);
  }

  /** 次リクエストの until 値（cursor - 1）。初回（カーソル未設定）は undefined。 */
  untilFor(key: string): number | undefined {
    const c = this.cursors.get(key);
    return c !== undefined ? c - 1 : undefined;
  }

  isExhausted(key: string): boolean {
    return this.exhausted.has(key);
  }

  /** 枯渇していないソースキー。 */
  activeKeys(allKeys: readonly string[]): string[] {
    return allKeys.filter((k) => !this.exhausted.has(k));
  }

  /** watermark T = active なソースの最大カーソル（どれも未設定なら null）。 */
  computeT(allKeys: readonly string[]): number | null {
    let max: number | null = null;
    for (const k of this.activeKeys(allKeys)) {
      const c = this.cursors.get(k);
      if (c === undefined) continue;
      if (max === null || c > max) max = c;
    }
    return max;
  }

  /** カーソルがちょうど T に張り付いている（=足並みの遅い）active ソース。 */
  slowKeys(allKeys: readonly string[], T: number): string[] {
    return this.activeKeys(allKeys).filter((k) => this.cursors.get(k) === T);
  }

  /**
   * complete／error の両方で呼ぶ統一確定処理。
   * - timestamps が空 → 枯渇扱い
   * - 進捗が無い（until を無視して同じ／新しい結果を返すリレー、oldest >= prevCursor）→ 枯渇扱いにして
   *   無限ループを防ぐ
   * - それ以外 → カーソルを最古へ進める
   */
  finalize(key: string, prevCursor: number | undefined, timestamps: readonly number[]): void {
    if (timestamps.length === 0) {
      this.exhausted.add(key);
      return;
    }
    let oldest = timestamps[0];
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] < oldest) oldest = timestamps[i];
    }
    if (prevCursor !== undefined && oldest >= prevCursor) {
      this.exhausted.add(key);
    } else {
      this.cursors.set(key, oldest);
    }
  }

  /**
   * 1 ページ分の取得をオーケストレーションする。
   *  1. active な全ソースを 1 回ずつ fetchOne
   *  2. candidateCount(T) >= batchSize になるまで、最大 maxInnerIterations 回、
   *     T に張り付く遅いソースを追加取得する
   *
   * fetchOne は内部で必ず pager.finalize(...) を呼ぶ契約。
   * 戻り値 fetchedAny: 取得対象の active ソースが 1 つでもあったか。
   */
  async loadPage(
    allKeys: readonly string[],
    fetchOne: (key: string) => Promise<void>,
    candidateCount: (T: number) => number
  ): Promise<{ fetchedAny: boolean }> {
    const active = this.activeKeys(allKeys);
    if (active.length === 0) return { fetchedAny: false };

    await Promise.all(active.map((k) => fetchOne(k)));

    for (let iter = 0; iter < this.maxInnerIterations; iter++) {
      const T = this.computeT(allKeys);
      if (T === null) break;
      if (candidateCount(T) >= this.batchSize) break;
      const slow = this.slowKeys(allKeys, T);
      if (slow.length === 0) break;
      await Promise.all(slow.map((k) => fetchOne(k)));
    }
    return { fetchedAny: true };
  }
}
