// まとめ一覧（MatomeList）は、一覧に戻ったときのために取得結果とスクロール位置を覚えている。
// まとめを作成・更新したあとは、覚えている一覧が古くなるので、次に開いたときに取り直させる。

let stale = false;

/** 一覧が古くなったことを記録する（まとめの作成・更新のあとに呼ぶ） */
export function markMatomeListStale(): void {
  stale = true;
}

/** 一覧が古くなっていたか。呼ぶと記録は消える */
export function consumeMatomeListStale(): boolean {
  const was = stale;
  stale = false;
  return was;
}
