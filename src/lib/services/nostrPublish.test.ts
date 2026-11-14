import { describe, it, expect } from 'vitest';
import { newMatomeDTag, replacingCreatedAt } from './nostrPublish';

describe('newMatomeDTag', () => {
  it('まとめたーの形式（matometr-{ULID}）で、呼ぶたびに違う値になる', () => {
    const a = newMatomeDTag();
    const b = newMatomeDTag();
    expect(a).toMatch(/^matometr-[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(a).not.toBe(b);
  });
});

describe('replacingCreatedAt：置き換え可能イベントを上書きするときの created_at', () => {
  it('ふつうは現在時刻', () => {
    expect(replacingCreatedAt(2000, 1000)).toBe(2000);
    expect(replacingCreatedAt(2000)).toBe(2000);
  });

  it('前の版と同じ秒なら 1 秒進める（同じ秒では置き換わらないため）', () => {
    expect(replacingCreatedAt(2000, 2000)).toBe(2001);
  });

  it('前の版の方が未来（保存した端末の時計が進んでいた）なら、その 1 秒後', () => {
    expect(replacingCreatedAt(2000, 2500)).toBe(2501);
  });
});
