import { expect, test, type Page } from '@playwright/test'
import { createSpot, registerUser, signIn, uniqueName } from '../fixtures/api'
import { scanA11y } from '../support/a11y'

// スマートフォン幅(Pixel 7 相当)での表示。playwright.config.ts の `mobile` プロジェクトで実行する。
// 要件定義書の「スマートフォン幅でも利用可能なレスポンシブ対応」を確認する。

// 横にはみ出していない(横スクロールが出ない)こと
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, '横スクロールが出ている').toBeLessThanOrEqual(0)
}

test.describe('スマートフォン幅', () => {
  test('下部のタブバーが出て、上部のナビゲーションは出ない。タブで画面を移動できる', async ({ page }) => {
    await page.goto('/')
    const tabBar = page.locator('nav.fixed')
    await expect(tabBar).toBeVisible()
    await expect(page.locator('header nav')).toBeHidden()

    await tabBar.getByRole('link', { name: '地図' }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/map')
    await tabBar.getByRole('link', { name: '新着' }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/')
  })

  test('ログイン済みのタブバーには、マイリストとプロフィールが加わる。未ログインでは出ない', async ({ page, request }) => {
    await page.goto('/')
    const tabBar = page.locator('nav.fixed')
    await expect(tabBar.getByRole('link')).toHaveCount(3)

    const user = await registerUser(request, 'mobile')
    await signIn(page, user)
    await page.goto('/')
    await expect(tabBar.getByRole('link')).toHaveCount(5)
    await expect(tabBar.getByRole('link', { name: 'マイリスト' })).toBeVisible()
    await expect(tabBar.getByRole('link', { name: 'プロフィール' })).toBeVisible()
  })

  test('新着一覧は、横にはみ出さず、カードが 1 列で並ぶ。最後のカードがタブバーに隠れない', async ({ page, request }) => {
    const user = await registerUser(request, 'mobile')
    // このテスト専用のエリア
    for (let i = 0; i < 3; i++) await createSpot(request, user, { name: uniqueName('スマホ'), areas: ['徳島県'] })

    await page.goto('/')
    await page.getByTestId('area-filter').selectOption('徳島県')
    const cards = page.getByTestId('spot-card')
    await expect(cards).toHaveCount(3)
    await expectNoHorizontalScroll(page)

    // 1 列: すべてのカードの左端が同じ
    const lefts = await cards.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)))
    expect(new Set(lefts).size).toBe(1)

    // 最後のカードまでスクロールすると、固定のタブバーに重ならない
    const last = cards.last()
    await last.scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    const lastBox = (await last.boundingBox())!
    const tabBox = (await page.locator('nav.fixed').boundingBox())!
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(tabBox.y + 1)
  })

  test('ログイン・新規登録が、スマートフォン幅でも操作できる', async ({ page }) => {
    await page.goto('/login')
    await expectNoHorizontalScroll(page)
    await page.getByRole('button', { name: '新規登録' }).click()
    await expect(page.getByTestId('name')).toBeVisible()
    await expect(page.getByTestId('submit')).toBeInViewport()
    await expectNoHorizontalScroll(page)
  })

  test('投稿フォームが、横にはみ出さず、最後まで操作できる(保存ボタンがタブバーに隠れない)', async ({ page, request }) => {
    const user = await registerUser(request, 'mobile')
    await signIn(page, user)
    await page.goto('/spots/new')
    await expect(page.getByTestId('name')).toBeVisible()
    await expectNoHorizontalScroll(page)

    await page.getByTestId('name').fill(uniqueName('スマホ投稿'))
    await page.getByTestId('area-select').selectOption('北海道')
    const save = page.getByTestId('save')
    await save.scrollIntoViewIfNeeded()
    await expect(save).toBeEnabled()
    // 固定のタブバーに重ならずにタップできる(Playwright は、他の要素に覆われていると失敗する)
    await save.click()
    await expect(page).toHaveURL(/\/spots\/\d+$/)
  })

  test('詳細が、横にはみ出さない。編集・削除のボタンを押せる', async ({ page, request }) => {
    const user = await registerUser(request, 'mobile')
    const spot = await createSpot(request, user, {
      areas: ['香川県'],
      review: '長い感想 '.repeat(60),
      address: '香川県高松市',
      latitude: 34.34,
      longitude: 134.04,
    })
    await signIn(page, user)
    await page.goto(`/spots/${spot.id}`)
    await expect(page.getByTestId('spot-name')).toBeVisible()
    await expectNoHorizontalScroll(page)
    await page.getByTestId('edit').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('edit')).toBeInViewport()
  })

  test('プロフィールが、横にはみ出さない。フォローのボタンを押せ、タブバーのプロフィールから自分の画面へ移動できる', async ({
    page,
    request,
  }) => {
    const author = await registerUser(request, 'mobile')
    const reader = await registerUser(request, 'mobile')
    for (let i = 0; i < 3; i++) await createSpot(request, author, { name: uniqueName('プロフィール') })
    await signIn(page, reader)

    await page.goto(`/users/${author.id}`)
    await expect(page.getByTestId('profile-name')).toBeVisible()
    await expectNoHorizontalScroll(page)
    await expect(page.getByTestId('follow-button')).toBeInViewport()
    await page.getByTestId('follow-button').click()
    await expect(page.getByTestId('follow-button')).toHaveText('フォロー中')

    // 下部のタブバーから、自分のプロフィールへ(フォロー数が反映されている)
    await page.locator('nav.fixed').getByRole('link', { name: 'プロフィール' }).click()
    await expect(page).toHaveURL((url) => url.pathname === `/users/${reader.id}`)
    await expect(page.getByTestId('following-count')).toHaveText('1')
    await expectNoHorizontalScroll(page)
  })

  test('詳細のいいね・コメントが、横にはみ出さず、入力欄と送信ボタンがタブバーに隠れずに操作できる', async ({
    page,
    request,
  }) => {
    const owner = await registerUser(request, 'mobile')
    const fan = await registerUser(request, 'mobile')
    const spot = await createSpot(request, owner)
    // 長い単語や URL でも、横にはみ出さない
    await request.post(`/api/spots/${spot.id}/comments`, {
      data: { body: 'https://example.com/' + 'a'.repeat(200) },
      headers: { Authorization: `Bearer ${fan.accessToken}` },
    })
    await signIn(page, fan)
    await page.goto(`/spots/${spot.id}`)
    await expect(page.getByTestId('comment')).toBeVisible()
    await expectNoHorizontalScroll(page)

    await page.getByTestId('like-button').click()
    await expect(page.getByTestId('like-button')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('comment-input').scrollIntoViewIfNeeded()
    await page.getByTestId('comment-input').fill('スマホからのコメント')
    // 固定のタブバーに重ならずにタップできる(Playwright は、他の要素に覆われていると失敗する)
    await page.getByTestId('comment-submit').click()
    await expect(page.getByTestId('comment-count')).toHaveText('2')
    await expectNoHorizontalScroll(page)
  })

  test('フォロー中の一覧が、スマートフォン幅でも横にはみ出さず、1 列で並ぶ', async ({ page, request }) => {
    const me = await registerUser(request, 'mobile')
    const followed = await registerUser(request, 'mobile')
    for (let i = 0; i < 2; i++) await createSpot(request, followed, { name: uniqueName('フォロー中') })
    await request.post(`/api/users/${followed.id}/follow`, { headers: { Authorization: `Bearer ${me.accessToken}` } })
    await signIn(page, me)
    await page.goto('/following')
    await expect(page.getByTestId('spot-card')).toHaveCount(2)
    await expectNoHorizontalScroll(page)
    const lefts = await page.getByTestId('spot-card').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)))
    expect(new Set(lefts).size).toBe(1)
  })

  test('マイリストが、横にはみ出さず、タブ・ボタンをタブバーに隠れずに操作できる(長い名前でもはみ出さない)', async ({
    page,
    request,
  }) => {
    const author = await registerUser(request, 'mobile')
    const me = await registerUser(request, 'mobile')
    const longName = `とても長い名前のスポット${'あ'.repeat(60)}`
    const spot = await createSpot(request, author, { name: longName })
    for (let i = 0; i < 3; i++) {
      const s = await createSpot(request, author, { name: uniqueName('リスト') })
      await request.put(`/api/spots/${s.id}/list`, { data: { status: 'wishlist' }, headers: { Authorization: `Bearer ${me.accessToken}` } })
    }
    await request.put(`/api/spots/${spot.id}/list`, { data: { status: 'wishlist' }, headers: { Authorization: `Bearer ${me.accessToken}` } })
    await signIn(page, me)

    await page.goto('/me/list')
    await page.getByTestId('tab-wishlist').click()
    await expect(page.getByTestId('list-item')).toHaveCount(4)
    await expectNoHorizontalScroll(page)

    // 最後の項目まで見て、固定のタブバーに隠れずに「訪問済みにする」を押せる
    await page.getByTestId('list-item').last().scrollIntoViewIfNeeded()
    await page.getByTestId('list-item').last().getByTestId('item-to-visited').click()
    await expect(page.getByTestId('list-item')).toHaveCount(3)
    await expect(page.getByTestId('count-visited')).toHaveText('1')
    await expectNoHorizontalScroll(page)

    // タブバーの「マイリスト」から開ける
    await page.goto('/')
    await page.locator('nav.fixed').getByRole('link', { name: 'マイリスト' }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/me/list')
  })

  test('詳細のマイリストのボタンが、スマートフォン幅で折り返し、横にはみ出さず、押せる', async ({ page, request }) => {
    const author = await registerUser(request, 'mobile')
    const me = await registerUser(request, 'mobile')
    const spot = await createSpot(request, author)
    await signIn(page, me)
    await page.goto(`/spots/${spot.id}`)
    await page.getByTestId('list-add-wishlist').click()
    await expect(page.getByTestId('list-status')).toHaveText('行きたい')
    await expectNoHorizontalScroll(page)
    await page.getByTestId('list-to-visited').click()
    await expect(page.getByTestId('list-status')).toHaveText('訪問済み')
    await expectNoHorizontalScroll(page)
  })

  test('スマートフォン幅でも、アクセシビリティの違反がない(一覧・フォーム)', async ({ page, request }) => {
    const user = await registerUser(request, 'mobile')
    await createSpot(request, user, { areas: ['愛媛県'] })
    await signIn(page, user)
    await page.goto('/')
    await page.getByTestId('area-filter').selectOption('愛媛県')
    await expect(page.getByTestId('spot-card').first()).toBeVisible()
    expect(await scanA11y(page)).toEqual([])
    await page.goto('/spots/new')
    await expect(page.getByTestId('save')).toBeVisible()
    expect(await scanA11y(page)).toEqual([])
  })
})
