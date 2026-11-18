import { execSync } from 'node:child_process'
import { chromium } from '@playwright/test'
import { deleteE2eUsers } from './support/db'
import { BACKEND_DIR, BASE_URL, DATABASE_URL, JWT_SECRET } from './support/env'

// webServer(バックエンド・フロント)が起動した後に、テストの前に 1 回だけ実行される
export default async function globalSetup(): Promise<void> {
  // 1. E2E 用の DB にマイグレーションを適用する(適用済みなら何もしない)
  execSync('npx prisma migrate deploy', {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL, JWT_SECRET },
    stdio: 'inherit',
  })

  // 2. 前回の実行が途中で止まって残ったデータを消す
  const stale = await deleteE2eUsers()
  if (stale > 0) console.log(`[e2e] 前回の残りのユーザー ${stale} 件を削除しました`)

  // 3. 開発サーバーは、初回アクセス時に依存の最適化でページを再読み込みすることがある。
  //    テストの途中で再読み込みが起きて不安定にならないよう、先に一度アクセスして済ませておく
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    for (const path of ['/', '/login', '/spots/new']) {
      await page.goto(`${BASE_URL}${path}`)
      await page.waitForLoadState('networkidle')
    }
    await page.reload()
    await page.waitForLoadState('networkidle')
  } finally {
    await browser.close()
  }
}
