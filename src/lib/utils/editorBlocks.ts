import type { EditorBlock, MatomeBlock } from '$lib/types';

// 公開済みまとめのブロック列をエディタ用に変換する（編集・インポート共通）。
// matome_layout タグが失われたイベントでは本文が段落として解析されるため、
// 段落はコメントとして取り込み、編集で本文が消えないようにする。
export function matomeBlocksToEditorBlocks(matomeBlocks: MatomeBlock[]): EditorBlock[] {
  const result: EditorBlock[] = [];
  for (const b of matomeBlocks) {
    if (b.type === 'nevent') {
      result.push({ id: crypto.randomUUID(), type: 'nevent', nevent: b.content });
    } else if (b.type === 'comment') {
      result.push({ id: crypto.randomUUID(), type: 'comment', text: b.content });
    } else if (b.type === 'heading') {
      result.push({ id: crypto.randomUUID(), type: 'heading', text: b.content });
    } else if (b.type === 'paragraph' && b.content.trim()) {
      result.push({ id: crypto.randomUUID(), type: 'comment', text: b.content });
    }
  }
  return result;
}
