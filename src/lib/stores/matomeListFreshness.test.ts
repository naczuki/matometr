import { describe, it, expect } from 'vitest';
import { consumeMatomeListStale, markMatomeListStale } from './matomeListFreshness';

describe('まとめ一覧の取り直しの印', () => {
  it('印を付けると次の 1 回だけ true になる', () => {
    expect(consumeMatomeListStale()).toBe(false);
    markMatomeListStale();
    expect(consumeMatomeListStale()).toBe(true);
    expect(consumeMatomeListStale()).toBe(false);
  });
});
