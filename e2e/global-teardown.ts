import { deleteE2eUsers } from './support/db'

// 全テストの後に、E2E が作ったユーザーと、それに連動するデータを削除する。
// 失敗の原因を調べたいときは、E2E_KEEP_DATA=1 を付けて実行すると残せる。
export default async function globalTeardown(): Promise<void> {
  if (process.env['E2E_KEEP_DATA'] === '1') {
    console.log('[e2e] E2E_KEEP_DATA=1 のため、テストデータを残します')
    return
  }
  const deleted = await deleteE2eUsers()
  console.log(`[e2e] テスト用ユーザー ${deleted} 件を削除しました`)
}
