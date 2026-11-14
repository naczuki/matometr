import { describe, it, expect } from 'vitest';
import { isImeComposing } from './keyboard';

describe('isImeComposing', () => {
  it('変換中（isComposing が true）なら true', () => {
    expect(isImeComposing({ isComposing: true, keyCode: 229 })).toBe(true);
  });

  it('isComposing が false に戻っていても keyCode が 229 なら true（Safari の確定 Enter）', () => {
    expect(isImeComposing({ isComposing: false, keyCode: 229 })).toBe(true);
  });

  it('ふつうの Enter（keyCode 13）なら false', () => {
    expect(isImeComposing({ isComposing: false, keyCode: 13 })).toBe(false);
  });
});
