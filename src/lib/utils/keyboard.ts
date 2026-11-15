// 日本語入力（IME）の変換確定の Enter かどうか。
// 確定の Enter も keydown の key は 'Enter' で届くため、これを見ずに Enter で検索・追加すると
// 変換途中の文字列で実行されてしまう。
// isComposing だけでは足りない: Safari では compositionend が先に処理され、
// keydown を受け取った時点で isComposing が false に戻っていることがある。
// 変換中の keydown は keyCode が 229 になるので、それも合わせて見る。
export function isImeComposing(e: Pick<KeyboardEvent, 'isComposing' | 'keyCode'>): boolean {
  return e.isComposing || e.keyCode === 229;
}

/**
 * 入力欄の keydown で、Enter による実行（検索・追加）を扱う。
 * - 変換確定の Enter では実行しない（IME のキー操作には手を出さない）
 * - キーを押しっぱなしにしたときの繰り返しでは実行しない。確定の Enter を長く押すと、
 *   確定後の繰り返し分がふつうの Enter として届くため
 */
export function runOnEnter(
  e: Pick<KeyboardEvent, 'key' | 'isComposing' | 'keyCode' | 'repeat' | 'preventDefault'>,
  run: () => void
): void {
  if (e.key !== 'Enter' || isImeComposing(e)) return;
  e.preventDefault();
  if (!e.repeat) run();
}
