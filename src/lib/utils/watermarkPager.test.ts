import { describe, it, expect } from 'vitest';
import { WatermarkPager } from './watermarkPager';

describe('WatermarkPager.finalize', () => {
  it('空の取得結果はソースを枯渇扱いにする', () => {
    const p = new WatermarkPager();
    p.finalize('a', undefined, []);
    expect(p.isExhausted('a')).toBe(true);
    expect(p.getCursor('a')).toBeUndefined();
  });

  it('進捗がある（oldest < prevCursor）ならカーソルを最古へ進める', () => {
    const p = new WatermarkPager();
    // 初回（prevCursor undefined）はガード無しでカーソル設定
    p.finalize('a', undefined, [100, 80, 90]);
    expect(p.getCursor('a')).toBe(80);
    expect(p.isExhausted('a')).toBe(false);
    // 2 ページ目（prevCursor=80）でさらに古い結果 → 進める
    p.finalize('a', 80, [70, 60]);
    expect(p.getCursor('a')).toBe(60);
    expect(p.isExhausted('a')).toBe(false);
  });

  it('進捗が無い（oldest >= prevCursor）ならソースを枯渇扱いにする', () => {
    const p = new WatermarkPager();
    p.finalize('a', undefined, [100, 90]);
    expect(p.getCursor('a')).toBe(90);
    // until を無視して同じ／新しい結果を返した → 枯渇
    p.finalize('a', 90, [120, 90]);
    expect(p.isExhausted('a')).toBe(true);
    // カーソルは進まない
    expect(p.getCursor('a')).toBe(90);
  });
});

describe('WatermarkPager.computeT / activeKeys / slowKeys', () => {
  const keys = ['a', 'b', 'c'];

  it('active なソースの最大カーソルを返す', () => {
    const p = new WatermarkPager();
    p.finalize('a', undefined, [100]);
    p.finalize('b', undefined, [80]);
    // c は未取得（カーソル無し）
    expect(p.computeT(keys)).toBe(100);
  });

  it('カーソルを持つソースが無ければ null', () => {
    const p = new WatermarkPager();
    expect(p.computeT(keys)).toBeNull();
  });

  it('枯渇したソースは active / computeT から除外される', () => {
    const p = new WatermarkPager();
    p.finalize('a', undefined, [100]);
    p.finalize('b', undefined, []); // 枯渇
    expect(p.activeKeys(keys)).toEqual(['a', 'c']);
    expect(p.computeT(keys)).toBe(100);
  });

  it('slowKeys は cursor === T の active ソースのみ', () => {
    const p = new WatermarkPager();
    p.finalize('a', undefined, [100]);
    p.finalize('b', undefined, [100]);
    p.finalize('c', undefined, [50]);
    expect(p.slowKeys(keys, 100).sort()).toEqual(['a', 'b']);
  });
});

describe('WatermarkPager.untilFor', () => {
  it('カーソルが無ければ undefined、あれば cursor - 1', () => {
    const p = new WatermarkPager();
    expect(p.untilFor('a')).toBeUndefined();
    p.finalize('a', undefined, [100]);
    expect(p.untilFor('a')).toBe(99);
  });
});

describe('WatermarkPager.loadPage', () => {
  it('active が空なら fetchedAny=false で何もしない', async () => {
    const p = new WatermarkPager();
    p.finalize('a', undefined, []); // 枯渇
    let calls = 0;
    const res = await p.loadPage(
      ['a'],
      async () => {
        calls++;
      },
      () => 0
    );
    expect(res.fetchedAny).toBe(false);
    expect(calls).toBe(0);
  });

  it('候補が batchSize に達したら内部ループを止める', async () => {
    const p = new WatermarkPager({ batchSize: 30, maxInnerIterations: 10 });
    const fetches: string[] = [];
    let ts = 100;
    const fetchOne = async (key: string) => {
      const prev = p.getCursor(key);
      fetches.push(key);
      // 毎回確実に古くなる結果を返す
      p.finalize(key, prev, [ts--]);
    };
    // 初回取得の時点で候補は十分（>= batchSize）とする
    const candidateCount = () => 30;
    const res = await p.loadPage(['a', 'b'], fetchOne, candidateCount);
    expect(res.fetchedAny).toBe(true);
    // 初回 active 一斉取得（a,b）のみ。内部ループ 1 回目で候補十分 → 追加取得なし
    expect(fetches).toEqual(['a', 'b']);
  });

  it('遅いソースだけ追加取得し、進捗が無くなれば枯渇して止まる', async () => {
    const p = new WatermarkPager({ batchSize: 30, maxInnerIterations: 10 });
    const fetches: string[] = [];
    // a は古い方へ進める、b は until を無視して同じ結果を返す
    const fetchOne = async (key: string) => {
      const prev = p.getCursor(key);
      fetches.push(key);
      if (key === 'a') {
        p.finalize(key, prev, [prev === undefined ? 100 : prev - 10]);
      } else {
        p.finalize(key, prev, [50]);
      }
    };
    const res = await p.loadPage(['a', 'b'], fetchOne, () => 0);
    expect(res.fetchedAny).toBe(true);
    // 初回 a,b。b は 50 のまま、a は 100→90→... と進む。T=100(a) の slow は a のみ。
    // a が進み続け、b はいずれ T 未満で active のまま、ループは maxInnerIterations で停止。
    expect(p.isExhausted('a')).toBe(false);
    expect(fetches.filter((k) => k === 'a').length).toBeGreaterThan(1);
  });
});
