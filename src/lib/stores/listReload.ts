// まとめの作成・更新が成功した後、一覧へ戻ったときに
// スクロール位置を復元せずリロード（再取得）させるためのフラグ。
// 無事に作成・更新できたかを一覧で確認できるようにする目的。
let _forceReload = false;

export function requestListReload(): void {
  _forceReload = true;
}

// フラグを読み取り、同時にリセットする（一度きり有効）。
export function consumeListReload(): boolean {
  const v = _forceReload;
  _forceReload = false;
  return v;
}
