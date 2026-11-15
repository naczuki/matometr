import { describe, it, expect, vi } from 'vitest';
import { isImeComposing, runOnEnter } from './keyboard';

describe('isImeComposing', () => {
  it('変換中（isComposing が true）なら true', () => {
    expect(isImeComposing({ isComposing: true, keyCode: 229 })).toBe(true);
  });

  it('isComposing が true なら keyCode が 229 でなくても true', () => {
    expect(isImeComposing({ isComposing: true, keyCode: 13 })).toBe(true);
  });

  it('isComposing が false に戻っていても keyCode が 229 なら true（Safari の確定 Enter）', () => {
    expect(isImeComposing({ isComposing: false, keyCode: 229 })).toBe(true);
  });

  it('ふつうの Enter（keyCode 13）なら false', () => {
    expect(isImeComposing({ isComposing: false, keyCode: 13 })).toBe(false);
  });
});

describe('runOnEnter', () => {
  function key(over: Partial<Pick<KeyboardEvent, 'key' | 'isComposing' | 'keyCode' | 'repeat'>>) {
    return {
      key: 'Enter',
      isComposing: false,
      keyCode: 13,
      repeat: false,
      preventDefault: vi.fn(),
      ...over
    };
  }

  it('ふつうの Enter で実行する', () => {
    const run = vi.fn();
    const e = key({});
    runOnEnter(e, run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('Enter 以外では何もしない', () => {
    const run = vi.fn();
    const e = key({ key: 'a', keyCode: 65 });
    runOnEnter(e, run);
    expect(run).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('変換確定の Enter では実行せず、キー操作にも手を出さない', () => {
    const run = vi.fn();
    for (const e of [key({ isComposing: true, keyCode: 229 }), key({ keyCode: 229 })]) {
      runOnEnter(e, run);
      expect(e.preventDefault).not.toHaveBeenCalled();
    }
    expect(run).not.toHaveBeenCalled();
  });

  it('押しっぱなしの繰り返しでは実行しない（確定の Enter を長く押したあとの繰り返し）', () => {
    const run = vi.fn();
    const e = key({ repeat: true });
    runOnEnter(e, run);
    expect(run).not.toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
  });
});
