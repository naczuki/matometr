import { describe, it, expect, vi, afterEach } from 'vitest';
import { timeAgo, formatAbsoluteTime } from './time';

// テストの読み方:
//   describe(...) … テストのまとまり（グループ）
//   it(...)       … 「○○のとき△△になるべき」という1ケース
//   expect(実際).toBe(期待) … 実際の値が期待どおりかチェックする
//
// 「現在時刻」を 2024-06-01 12:00:00 (UTC) に固定して、結果が毎回同じになるようにする。
const NOW = new Date('2024-06-01T12:00:00Z');

afterEach(() => {
  // 固定した時計を毎回もとに戻す
  vi.useRealTimers();
});

function freezeNow() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
}

describe('timeAgo', () => {
  const nowSec = Math.floor(NOW.getTime() / 1000);

  it('1分未満は「たった今」', () => {
    freezeNow();
    expect(timeAgo(nowSec - 30)).toBe('たった今');
  });

  it('数分前は「N分前」', () => {
    freezeNow();
    expect(timeAgo(nowSec - 5 * 60)).toBe('5分前');
  });

  it('数時間前は「N時間前」', () => {
    freezeNow();
    expect(timeAgo(nowSec - 3 * 3600)).toBe('3時間前');
  });

  it('1日ちょっと前は「昨日」', () => {
    freezeNow();
    expect(timeAgo(nowSec - 30 * 3600)).toBe('昨日');
  });
});

describe('formatAbsoluteTime', () => {
  it('同じ年なら「月/日 時:分」', () => {
    freezeNow();
    // 2024-06-01 12:00:00 UTC をローカル時刻で表示する
    const result = formatAbsoluteTime(Math.floor(NOW.getTime() / 1000));
    // 環境のタイムゾーンに依存しないよう、形式だけを確認する
    expect(result).toMatch(/^\d{1,2}\/\d{1,2} \d{2}:\d{2}$/);
  });
});
