import { describe, it, expect } from 'vitest';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from 'nostr-tools';
import { Matome } from './Matome';
import type { EditorBlock } from '$lib/types';
import { blocksToContent, buildLayoutTag } from '$lib/services/nostrPublish';
import { matomeBlocksToEditorBlocks } from '$lib/utils/editorBlocks';

// エディタのブロック列 → content + matome_layout タグ → Matome.fromEvent → ブロック列
// のラウンドトリップを検証する。v1 レイアウトは種別を内容から推測していたため
// 「## で始まるコメント」「nostr: 参照のみのコメント」が壊れていた（v2 で修正）。

const EVENT_ID = 'a'.repeat(64);
const PUBKEY = 'b'.repeat(64);
const neventStr = `nostr:${nip19.neventEncode({ id: EVENT_ID })}`;

let blockSeq = 0;
function nb(nevent: string): EditorBlock {
  return { id: `t${blockSeq++}`, type: 'nevent', nevent };
}
function cb(text: string): EditorBlock {
  return { id: `t${blockSeq++}`, type: 'comment', text };
}
function hb(text: string): EditorBlock {
  return { id: `t${blockSeq++}`, type: 'heading', text };
}

function makeEvent(blocks: EditorBlock[], extraTags: string[][] = []): NostrEvent {
  return {
    id: EVENT_ID,
    pubkey: PUBKEY,
    kind: 30023,
    created_at: 1700000000,
    content: blocksToContent(blocks),
    tags: [
      ['d', 'test-dtag'],
      ['title', 'テストまとめ'],
      ['t', 'matometr'],
      ...buildLayoutTag(blocks),
      ...extraTags
    ],
    sig: ''
  };
}

function roundTrip(blocks: EditorBlock[]): { type: string; content: string }[] {
  const matome = Matome.fromEvent(makeEvent(blocks));
  expect(matome).not.toBeNull();
  return matome!.blocks.map((b) => ({ type: b.type, content: b.content }));
}

describe('Matome レイアウトのラウンドトリップ', () => {
  it('基本の並び（引用・コメント・見出し）が保持される', () => {
    const result = roundTrip([nb(neventStr), hb('見出し'), cb('コメント'), nb(neventStr)]);
    expect(result).toEqual([
      { type: 'nevent', content: neventStr },
      { type: 'heading', content: '見出し' },
      { type: 'comment', content: 'コメント' },
      { type: 'nevent', content: neventStr }
    ]);
  });

  it('「## 」で始まるコメントが見出しに化けない', () => {
    const result = roundTrip([cb('## 見出しっぽいコメント')]);
    expect(result).toEqual([{ type: 'comment', content: '## 見出しっぽいコメント' }]);
  });

  it('nostr: 参照だけのコメントが引用ポストに化けない', () => {
    const result = roundTrip([cb(neventStr), nb(neventStr)]);
    expect(result).toEqual([
      { type: 'comment', content: neventStr },
      { type: 'nevent', content: neventStr }
    ]);
  });

  it('空行を含むコメントが 1 ブロックのまま保持される', () => {
    const text = '一段落目\n\n二段落目';
    const result = roundTrip([cb(text), hb('次の見出し')]);
    expect(result).toEqual([
      { type: 'comment', content: text },
      { type: 'heading', content: '次の見出し' }
    ]);
  });

  it('v1 タグしか無い旧イベントは従来どおり推測でパースされる', () => {
    const blocks = [nb(neventStr), hb('見出し'), cb('コメント')];
    const event = makeEvent(blocks);
    event.tags = event.tags.filter((t) => !(t[0] === 'matome_layout' && t[1] === '2'));
    const matome = Matome.fromEvent(event);
    expect(matome).not.toBeNull();
    expect(matome!.blocks.map((b) => ({ type: b.type, content: b.content }))).toEqual([
      { type: 'nevent', content: neventStr },
      { type: 'heading', content: '見出し' },
      { type: 'comment', content: 'コメント' }
    ]);
  });

  it('v2 タグが content と整合しない場合は落ちずに退避パースされる', () => {
    const blocks = [hb('見出し'), cb('コメント')];
    const event = makeEvent(blocks);
    // ブロック数が合わない壊れた v2 を注入する
    event.tags = event.tags.map((t) =>
      t[0] === 'matome_layout' && t[1] === '2'
        ? ['matome_layout', '2', JSON.stringify(['e', 'e', 'e'])]
        : t
    );
    const matome = Matome.fromEvent(event);
    expect(matome).not.toBeNull();
    expect(matome!.blocks.length).toBeGreaterThan(0);
  });
});

// 他クライアントでの上書きで t:matometr や matome_layout が外れたまとめを、
// 本人がまとめたーで編集し直して復旧できるようにするための判定と変換。
describe('他クライアントで上書きされたまとめの救済', () => {
  function overwritten(blocks: EditorBlock[], dTag: string): NostrEvent {
    const event = makeEvent(blocks);
    event.tags = [
      ['d', dTag],
      ['title', 'テストまとめ'],
      ['client', 'other-client']
    ];
    return event;
  }

  it('まとめたーが採番した d タグなら t:matometr が無くても編集できる', () => {
    const matome = Matome.fromEvent(overwritten([nb(neventStr)], 'matometr-01ABC'));
    expect(matome!.isMatometr).toBe(false);
    expect(matome!.isMatometrEditable).toBe(true);
  });

  it('d タグも t タグも無関係な長文記事は編集できない', () => {
    const matome = Matome.fromEvent(overwritten([nb(neventStr)], 'my-article'));
    expect(matome!.isMatometrEditable).toBe(false);
  });

  it('matome_layout が外れても編集画面への変換でコメントの本文が失われない', () => {
    const blocks = [hb('見出し'), nb(neventStr), cb('一行目\n二行目'), cb('段落A\n\n段落B')];
    const matome = Matome.fromEvent(overwritten(blocks, 'matometr-01ABC'));
    const editor = matomeBlocksToEditorBlocks(matome!.blocks);
    const texts = editor.map((b) => (b.type === 'nevent' ? b.nevent : b.text));
    expect(texts).toEqual(['見出し', neventStr, '一行目', '二行目', '段落A', '段落B']);
  });
});
