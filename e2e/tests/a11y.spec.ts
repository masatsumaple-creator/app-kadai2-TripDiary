import { expect, test } from '@playwright/test'
import { createSpot, registerUser, signIn } from '../fixtures/api'
import { scanA11y } from '../support/a11y'

// アクセシビリティ(WCAG 2.x の A・AA)を、主要な画面ごとに axe-core で検査する。
// 違反があると、どのルールのどの要素かを表示して失敗する。
test.describe('アクセシビリティ(WCAG A/AA)', () => {
  test('ログイン画面', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByTestId('submit')).toBeVisible()
    expect(await scanA11y(page)).toEqual([])
  })

  test('新規登録画面', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: '新規登録' }).click()
    await expect(page.getByTestId('name')).toBeVisible()
    expect(await scanA11y(page)).toEqual([])
  })

  test('新着一覧(未ログイン)', async ({ page, request }) => {
    const user = await registerUser(request, 'a11y')
    await createSpot(request, user, { areas: ['宮崎県'] })
    await page.goto('/')
    await page.getByTestId('area-filter').selectOption('宮崎県')
    await expect(page.getByTestId('spot-card').first()).toBeVisible()
    expect(await scanA11y(page)).toEqual([])
  })

  test('スポット詳細(本人: 編集・削除あり、近くのスポットあり)', async ({ page, request }) => {
    const user = await registerUser(request, 'a11y')
    await createSpot(request, user, { areas: ['大分県'] })
    const spot = await createSpot(request, user, { areas: ['大分県'], address: '大分県別府市', latitude: 33.28, longitude: 131.5 })
    await signIn(page, user)
    await page.goto(`/spots/${spot.id}`)
    await expect(page.getByTestId('edit')).toBeVisible()
    await expect(page.getByTestId('nearby')).toBeVisible()
    expect(await scanA11y(page)).toEqual([])
  })

  test('投稿フォーム', async ({ page, request }) => {
    const user = await registerUser(request, 'a11y')
    await signIn(page, user)
    await page.goto('/spots/new')
    await page.getByTestId('area-select').selectOption('北海道')
    await expect(page.getByTestId('save')).toBeVisible()
    expect(await scanA11y(page)).toEqual([])
  })

  test('編集フォーム', async ({ page, request }) => {
    const user = await registerUser(request, 'a11y')
    const spot = await createSpot(request, user, { areas: ['鹿児島県'] })
    await signIn(page, user)
    await page.goto(`/spots/${spot.id}/edit`)
    await expect(page.getByTestId('name')).toHaveValue(spot.name)
    expect(await scanA11y(page)).toEqual([])
  })

  test('「見つかりません」の表示', async ({ page }) => {
    await page.goto('/spots/2147483647')
    await expect(page.getByTestId('not-found')).toBeVisible()
    expect(await scanA11y(page)).toEqual([])
  })
})
