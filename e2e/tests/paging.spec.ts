import { expect, test } from '@playwright/test'
import { createSpot, registerUser, type CreatedSpot } from '../fixtures/api'

// 一覧のページングは、件数を厳密に確認するため、他のテストが使わないエリア(沖縄県)を専用に使う。
// 同じエリアの投稿が同時に増減すると結果が変わるため、playwright.config.ts の `paging` プロジェクトで
// 他のファイルとは別に実行する。投稿は終了時に削除して、次の実行に影響を残さない(同じテストの複製を同時に走らせる --repeat-each は対象外)。
const AREA = '沖縄県'

test('20 件ずつ表示され、「もっと見る」で続きが出る。重複しない', async ({ page, request }) => {
  const user = await registerUser(request, 'paging')
  const created: CreatedSpot[] = []
  try {
    for (let i = 1; i <= 22; i++) {
      created.push(await createSpot(request, user, { name: `ページング-${String(i).padStart(2, '0')}`, areas: [AREA] }))
    }

    await page.goto('/')
    await page.getByTestId('area-filter').selectOption(AREA)
    await expect(page.getByTestId('spot-card')).toHaveCount(20)
    // 新しい順: 最後に作った 22 番が先頭
    await expect(page.getByTestId('spot-card').first()).toContainText('ページング-22')

    await page.getByTestId('load-more').click()
    await expect(page.getByTestId('spot-card')).toHaveCount(22)
    await expect(page.getByTestId('load-more')).toHaveCount(0)
    await expect(page.getByTestId('spot-card').last()).toContainText('ページング-01')

    const names = await page.getByTestId('spot-card').locator('h3').allTextContents()
    expect(new Set(names).size).toBe(22)
  } finally {
    for (const spot of created) {
      await request.delete(`/api/spots/${spot.id}`, { headers: { Authorization: `Bearer ${user.accessToken}` } })
    }
  }
})
