import mysql from 'mysql2/promise'
import { DATABASE_URL, E2E_EMAIL_PREFIX } from './env'

// E2E が作ったユーザーを削除する。投稿・エリアタグの紐づけ・フォロー・リフレッシュトークンは、
// 外部キーの ON DELETE CASCADE で一緒に消える。
// 接頭辞の `_` は LIKE のワイルドカードなので、エスケープして完全一致にする。
export async function deleteE2eUsers(): Promise<number> {
  const url = new URL(DATABASE_URL)
  const conn = await mysql.createConnection({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
  })
  try {
    const escaped = E2E_EMAIL_PREFIX.replace(/[\\%_]/g, (c) => `\\${c}`)
    const [result] = await conn.execute('DELETE FROM users WHERE email LIKE ?', [`${escaped}%`])
    return (result as { affectedRows: number }).affectedRows
  } finally {
    await conn.end()
  }
}
