import { describe, it, expect } from 'vitest';
import { isSafeUrl } from './nostrContent';

// isSafeUrl は「リンクとして安全に開いてよい URL か」を判定する。
// ユーザー投稿に javascript: などの危険な URL が混ざっても弾けることが大事
// （XSS の入口になるため）。ここはセキュリティ的に重要なテスト。
describe('isSafeUrl', () => {
  it('http / https は安全とみなす', () => {
    expect(isSafeUrl('http://example.com')).toBe(true);
    expect(isSafeUrl('https://example.com/path?a=1')).toBe(true);
  });

  it('javascript: スキームは危険なので false', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
  });

  it('data: スキームも false', () => {
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('URL として壊れている文字列は false', () => {
    expect(isSafeUrl('not a url')).toBe(false);
  });
});
