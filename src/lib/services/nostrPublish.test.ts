import { describe, it, expect } from 'vitest';
import type { EditorBlock } from '$lib/types';
import { buildLayoutTag, newMatomeDTag, replacingCreatedAt } from './nostrPublish';

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

describe('buildLayoutTag', () => {
  const NEVENT = 'nostr:nevent1qqqqqqqqqqqqqqqqqqqq';
  const blocks: EditorBlock[] = [
    { id: '1', type: 'heading', text: '見出し' },
    { id: '2', type: 'nevent', nevent: NEVENT },
    { id: '3', type: 'comment', text: '一段落目\n\n二段落目' },
    { id: '4', type: 'comment', text: '   ' },
    { id: '5', type: 'nevent', nevent: '' },
    { id: '6', type: 'nevent', nevent: NEVENT }
  ];

  it('v2 だけを書き出す（見出し・コメントがあっても v1 は付けない）', () => {
    expect(buildLayoutTag(blocks)).toEqual([
      ['matome_layout', '2', JSON.stringify(['h', 'e', 2, 'e'])]
    ]);
  });

  it('中身が無ければタグを付けない', () => {
    expect(buildLayoutTag([])).toEqual([]);
    expect(buildLayoutTag([{ id: '1', type: 'comment', text: '' }])).toEqual([]);
  });
});
