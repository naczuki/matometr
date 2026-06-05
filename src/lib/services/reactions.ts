import { createRxForwardReq, uniq } from 'rx-nostr';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';
import type { Note } from '$lib/types';
import { toNote, withRelays, getClient } from './nostrCore';

/**
 * 指定ポスト（イベント id）へのリアクション(kind:7)・リポスト(kind:6/16)を購読する。
 *
 * - forward REQ で購読を維持し、届いた順に Note を流す（新着も拾う）。oneshot ではない。
 * - `uniq()` で **同一イベント id の二重取得のみ**を排除（複数リレーから同じイベントが
 *   届いたときの重複防止）。pubkey や絵文字での丸め込みはしない。
 * - 対象は 1 ポストの `#e:[postId]` 1 個だけなので、フィルターとしては軽い。
 *
 * NOTE: 段取り 1〜2 では「開いたら 1 本・閉じたら解除」の素直な購読。
 *       対象 id 単位の共有購読マネージャ（参照カウント・集約 REQ）や 3 状態
 *       ライフサイクルは次フェーズでこの関数の内部を差し替えて実現する。
 */
export function subscribeNoteReactions(postId: string, relays?: string[]): Observable<Note> {
  const client = getClient();
  const rxReq = createRxForwardReq();
  const obs = client.use(rxReq, withRelays(relays)).pipe(
    uniq(),
    map(({ event }) => toNote(event))
  );
  rxReq.emit({ kinds: [7, 6, 16], '#e': [postId] });
  return obs;
}
