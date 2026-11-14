// 日本語入力（IME）の変換確定の Enter かどうか。
// 確定の Enter も keydown の key は 'Enter' で届くため、これを見ずに Enter で検索・追加すると
// 変換途中の文字列で実行されてしまう。
// isComposing だけでは足りない: Safari では compositionend が先に処理され、
// keydown を受け取った時点で isComposing が false に戻っていることがある。
// 変換中の keydown は keyCode が 229 になるので、それも合わせて見る。
export function isImeComposing(e: Pick<KeyboardEvent, 'isComposing' | 'keyCode'>): boolean {
  return e.isComposing || e.keyCode === 229;
}
