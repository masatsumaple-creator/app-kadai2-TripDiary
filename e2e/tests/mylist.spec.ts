import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { createSpot, registerUser, signIn, uniqueName, type TestUser, type Visibility } from '../fixtures/api'
import { LoginPage } from '../pages/login.page'

const bearer = (u: TestUser) => ({ Authorization: `Bearer ${u.accessToken}` })
const item = (page: Page, name: string) => page.getByTestId('list-item').filter({ hasText: name })

async function addToList(request: APIRequestContext, user: TestUser, spotId: number, status: 'visited' | 'wishlist') {
  const res = await request.put(`/api/spots/${spotId}/list`, { data: { status }, headers: bearer(user) })
  if (res.status() !== 200) throw new Error(`リストへの追加に失敗しました: ${res.status()} ${await res.text()}`)
}

async function setVisibility(request: APIRequestContext, owner: TestUser, spotId: number, visibility: Visibility) {
  const res = await request.put(`/api/spots/${spotId}`, {
    data: { name: uniqueName('変更'), areas: ['京都府'], visibility },
    headers: bearer(owner),
  })
  if (res.status() !== 200) throw new Error(`公開範囲の変更に失敗しました: ${res.status()}`)
}

test.describe('詳細のマイリストボタン', () => {
  test('「行きたい」で入れ、「訪問済み」に変え、外せる。リロードしても状態が残る', async ({ page, request }) => {
    const author = await registerUser(request, 'author')
    const me = await registerUser(request, 'me')
    const spot = await createSpot(request, author)
    await signIn(page, me)
    await page.goto(`/spots/${spot.id}`)

    // リストにない: 追加のボタンが 2 つ
    await expect(page.getByTestId('list-add-wishlist')).toBeVisible()
    await expect(page.getByTestId('list-add-visited')).toBeVisible()
    await expect(page.getByTestId('list-status')).toHaveCount(0)

    // 行きたいに追加
    await page.getByTestId('list-add-wishlist').click()
    await expect(page.getByTestId('list-status')).toHaveText('行きたい')
    await expect(page.getByTestId('list-to-visited')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('list-status')).toHaveText('行きたい')

    // 訪問済みにする → 行きたいに戻す
    await page.getByTestId('list-to-visited').click()
    await expect(page.getByTestId('list-status')).toHaveText('訪問済み')
    await expect(page.getByTestId('list-to-wishlist')).toBeVisible()
    await page.getByTestId('list-to-wishlist').click()
    await expect(page.getByTestId('list-status')).toHaveText('行きたい')

    // 外す
    await page.getByTestId('list-remove').click()
    await expect(page.getByTestId('list-status')).toHaveCount(0)
    await expect(page.getByTestId('list-add-wishlist')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('list-add-wishlist')).toBeVisible()
  })

  test('いきなり「訪問済み」でも追加できる', async ({ page, request }) => {
    const author = await registerUser(request, 'author')
    const me = await registerUser(request, 'me')
    const spot = await createSpot(request, author)
    await signIn(page, me)
    await page.goto(`/spots/${spot.id}`)
    await page.getByTestId('list-add-visited').click()
    await expect(page.getByTestId('list-status')).toHaveText('訪問済み')
  })

  test('自分の投稿は、自動で「訪問済み」。操作のボタンは出ない', async ({ page, request }) => {
    const me = await registerUser(request, 'me')
    const spot = await createSpot(request, me)
    await signIn(page, me)
    await page.goto(`/spots/${spot.id}`)
    await expect(page.getByTestId('list-status')).toHaveText('訪問済み')
    await expect(page.getByTestId('list-buttons')).toContainText('自動で訪問済み')
    await expect(page.getByTestId('list-add-wishlist')).toHaveCount(0)
    await expect(page.getByTestId('list-remove')).toHaveCount(0)
  })

  test('未ログインで押すと、ログイン画面へ移動し、ログイン後に戻る(自動では追加しない)', async ({ page, request }) => {
    const author = await registerUser(request, 'author')
    const me = await registerUser(request, 'me')
    const spot = await createSpot(request, author)
    await page.goto(`/spots/${spot.id}`)
    await page.getByTestId('list-add-wishlist').click()

    await expect(page).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('redirect') === `/spots/${spot.id}`)
    const login = new LoginPage(page)
    await login.fill({ email: me.email, password: me.password })
    await login.submit()
    await expect(page).toHaveURL((url) => url.pathname === `/spots/${spot.id}`)
    await expect(page.getByTestId('list-add-wishlist')).toBeVisible()
    await expect(page.getByTestId('list-status')).toHaveCount(0)
  })
})

test.describe('マイリスト(S-06)', () => {
  test('自分の投稿が訪問済みに入り、他人の投稿を入れた順(新しい順)に、タブごとに件数つきで出る', async ({ page, request }) => {
    const author = await registerUser(request, 'author')
    const me = await registerUser(request, 'me')
    const mine = await createSpot(request, me, { name: uniqueName('自分の投稿') })
    const s1 = await createSpot(request, author, { name: uniqueName('一番目') })
    const s2 = await createSpot(request, author, { name: uniqueName('二番目') })
    const s3 = await createSpot(request, author, { name: uniqueName('三番目') })
    // 入れた順: s2 → s1 → s3(投稿の順とは違う)
    await addToList(request, me, s2.id, 'wishlist')
    await addToList(request, me, s1.id, 'wishlist')
    await addToList(request, me, s3.id, 'visited')

    await signIn(page, me)
    await page.goto('/me/list')
    // 訪問済み(既定のタブ): 後から入れた s3 が先、自分の投稿が後
    await expect(page.getByTestId('count-visited')).toHaveText('2')
    await expect(page.getByTestId('count-wishlist')).toHaveText('2')
    await expect(page.getByTestId('list-item')).toHaveCount(2)
    expect(await page.getByTestId('list-item').locator('p.font-semibold').allTextContents()).toEqual([s3.name, mine.name])

    // 行きたい: s1(後に入れた)が先
    await page.getByTestId('tab-wishlist').click()
    await expect(page.getByTestId('tab-wishlist')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('list-item')).toHaveCount(2)
    expect(await page.getByTestId('list-item').locator('p.font-semibold').allTextContents()).toEqual([s1.name, s2.name])

    // 項目から詳細へ移動できる
    await item(page, s1.name).getByTestId('list-item-link').click()
    await expect(page.getByTestId('spot-name')).toHaveText(s1.name)
  })

  test('自分の投稿の行には、操作のボタンがなく、「自分の投稿」と表示される', async ({ page, request }) => {
    const me = await registerUser(request, 'me')
    const mine = await createSpot(request, me)
    await signIn(page, me)
    await page.goto('/me/list')
    await expect(item(page, mine.name)).toBeVisible()
    await expect(item(page, mine.name).getByTestId('list-item-own')).toBeVisible()
    await expect(item(page, mine.name).getByTestId('item-remove')).toHaveCount(0)
    await expect(item(page, mine.name).getByTestId('item-to-wishlist')).toHaveCount(0)
  })

  test('「行きたい」から「訪問済みにする」と、一覧から消え、両方の件数が変わる。「行きたいに戻す」で戻せる', async ({
    page,
    request,
  }) => {
    const author = await registerUser(request, 'author')
    const me = await registerUser(request, 'me')
    const spot = await createSpot(request, author, { name: uniqueName('行ってきた') })
    await addToList(request, me, spot.id, 'wishlist')
    await signIn(page, me)
    await page.goto('/me/list')
    await page.getByTestId('tab-wishlist').click()
    await expect(page.getByTestId('count-wishlist')).toHaveText('1')
    await expect(page.getByTestId('count-visited')).toHaveText('0')

    await item(page, spot.name).getByTestId('item-to-visited').click()
    await expect(page.getByTestId('list-empty')).toBeVisible()
    await expect(page.getByTestId('count-wishlist')).toHaveText('0')
    await expect(page.getByTestId('count-visited')).toHaveText('1')

    // 訪問済みのタブに移っている
    await page.getByTestId('tab-visited').click()
    await expect(item(page, spot.name)).toBeVisible()
    await item(page, spot.name).getByTestId('item-to-wishlist').click()
    await expect(page.getByTestId('count-visited')).toHaveText('0')
    await expect(page.getByTestId('count-wishlist')).toHaveText('1')
  })

  test('「外す」でリストから消え、件数も減る。外した投稿は、詳細で、またリストに追加できる', async ({ page, request }) => {
    const author = await registerUser(request, 'author')
    const me = await registerUser(request, 'me')
    const spot = await createSpot(request, author, { name: uniqueName('外す') })
    await addToList(request, me, spot.id, 'wishlist')
    await signIn(page, me)
    await page.goto('/me/list')
    await page.getByTestId('tab-wishlist').click()
    await item(page, spot.name).getByTestId('item-remove').click()
    await expect(page.getByTestId('list-empty')).toBeVisible()
    await expect(page.getByTestId('count-wishlist')).toHaveText('0')

    await page.goto(`/spots/${spot.id}`)
    await expect(page.getByTestId('list-add-wishlist')).toBeVisible()
  })

  test('空のときは、案内が出る(訪問済み・行きたいそれぞれ)', async ({ page, request }) => {
    const me = await registerUser(request, 'me')
    await signIn(page, me)
    await page.goto('/me/list')
    await expect(page.getByTestId('list-empty')).toContainText('訪問済みのスポットはまだありません')
    await page.getByTestId('tab-wishlist').click()
    await expect(page.getByTestId('list-empty')).toContainText('行きたいスポットはまだありません')
  })

  test('件数が多いときは、20 件ずつ表示され、「もっと見る」で続きが出る', async ({ page, request }) => {
    const author = await registerUser(request, 'author')
    const me = await registerUser(request, 'me')
    for (let i = 1; i <= 22; i++) {
      const spot = await createSpot(request, author, { name: `リスト-${String(i).padStart(2, '0')}` })
      await addToList(request, me, spot.id, 'wishlist')
    }
    await signIn(page, me)
    await page.goto('/me/list')
    await page.getByTestId('tab-wishlist').click()
    await expect(page.getByTestId('count-wishlist')).toHaveText('22')
    await expect(page.getByTestId('list-item')).toHaveCount(20)
    await expect(page.getByTestId('list-item').first()).toContainText('リスト-22')
    await page.getByTestId('load-more').click()
    await expect(page.getByTestId('list-item')).toHaveCount(22)
    await expect(page.getByTestId('load-more')).toHaveCount(0)
    const names = await page.getByTestId('list-item').locator('p.font-semibold').allTextContents()
    expect(new Set(names).size).toBe(22)
  })

  test('入れたあとに非公開にされた投稿は、リストにも件数にも出ない。公開に戻すと、また出る', async ({ page, request }) => {
    const author = await registerUser(request, 'author')
    const me = await registerUser(request, 'me')
    const spot = await createSpot(request, author, { name: uniqueName('隠れる') })
    await addToList(request, me, spot.id, 'wishlist')
    await signIn(page, me)

    await page.goto('/me/list')
    await page.getByTestId('tab-wishlist').click()
    await expect(page.getByTestId('count-wishlist')).toHaveText('1')

    await setVisibility(request, author, spot.id, 'private')
    await page.reload()
    await page.getByTestId('tab-wishlist').click()
    await expect(page.getByTestId('list-empty')).toBeVisible()
    await expect(page.getByTestId('count-wishlist')).toHaveText('0')
    await expect(page.getByTestId('list-item')).toHaveCount(0)

    await setVisibility(request, author, spot.id, 'public')
    await page.reload()
    await page.getByTestId('tab-wishlist').click()
    await expect(page.getByTestId('count-wishlist')).toHaveText('1')
  })

  test('リストは本人だけのもの: 他のユーザーのリストには、自分が入れた投稿が出ない', async ({ page, request }) => {
    const author = await registerUser(request, 'author')
    const a = await registerUser(request, 'a')
    const b = await registerUser(request, 'b')
    const spot = await createSpot(request, author, { name: uniqueName('Aだけ') })
    await addToList(request, a, spot.id, 'wishlist')

    await signIn(page, b)
    await page.goto('/me/list')
    await page.getByTestId('tab-wishlist').click()
    await expect(page.getByTestId('list-empty')).toBeVisible()
    await expect(item(page, spot.name)).toHaveCount(0)
  })

  test('未ログインで開くと、ログイン画面へ移動する。ヘッダーの「マイリスト」から開ける', async ({ page, request }) => {
    await page.goto('/me/list')
    await expect(page).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('redirect') === '/me/list')

    const me = await registerUser(request, 'me')
    await signIn(page, me)
    await page.goto('/')
    await page.getByRole('banner').getByRole('link', { name: 'マイリスト' }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/me/list')
    await expect(page.getByRole('heading', { name: 'マイリスト' })).toBeVisible()
  })

  test('「マイリスト」のページに、モックの表示(ダミーのデータ)が出ない', async ({ page, request }) => {
    const me = await registerUser(request, 'me')
    await signIn(page, me)
    await page.goto('/me/list')
    await expect(page.getByTestId('list-empty')).toBeVisible()
  })
})
