import { expect, test } from '@playwright/test'
import { createSpot, registerUser, signIn, uniqueName } from '../fixtures/api'
import { LoginPage } from '../pages/login.page'

const card = (page: import('@playwright/test').Page, name: string) =>
  page.getByTestId('spot-card').filter({ hasText: name })

// プロフィールの画面(S-07)とフォロー。ユーザーごとに投稿が分かれるので、件数も厳密に確認できる
test.describe('プロフィールとフォロー', () => {
  test('他人のプロフィールを、未ログインでも見られる。見られる投稿だけが出て、数にも反映される', async ({ page, request }) => {
    const author = await registerUser(request, 'author')
    const open = await createSpot(request, author, { name: uniqueName('公開'), visibility: 'public' })
    const followersOnly = await createSpot(request, author, { name: uniqueName('限定'), visibility: 'followers' })
    const secret = await createSpot(request, author, { name: uniqueName('非公開'), visibility: 'private' })

    await page.goto(`/users/${author.id}`)
    await expect(page.getByTestId('profile-name')).toHaveText(author.name)
    await expect(page.getByTestId('spot-count')).toHaveText('1')
    await expect(page.getByTestId('follower-count')).toHaveText('0')
    await expect(page.getByTestId('following-count')).toHaveText('0')
    await expect(card(page, open.name)).toBeVisible()
    await expect(card(page, followersOnly.name)).toHaveCount(0)
    await expect(card(page, secret.name)).toHaveCount(0)
    await expect(page.getByTestId('follow-button')).toHaveText('フォロー')
  })

  test('フォローすると、フォロワー限定の投稿が見えるようになり、解除すると見えなくなる', async ({ page, request }) => {
    const author = await registerUser(request, 'author')
    const reader = await registerUser(request, 'reader')
    const open = await createSpot(request, author, { name: uniqueName('公開'), visibility: 'public' })
    const followersOnly = await createSpot(request, author, { name: uniqueName('限定'), visibility: 'followers' })
    await signIn(page, reader)

    await page.goto(`/users/${author.id}`)
    await expect(card(page, open.name)).toBeVisible()
    await expect(card(page, followersOnly.name)).toHaveCount(0)
    await expect(page.getByTestId('follower-count')).toHaveText('0')

    // フォロー
    await page.getByTestId('follow-button').click()
    await expect(page.getByTestId('follow-button')).toHaveText('フォロー中')
    await expect(page.getByTestId('follower-count')).toHaveText('1')
    await expect(page.getByTestId('spot-count')).toHaveText('2')
    await expect(card(page, followersOnly.name)).toBeVisible()
    // 自分のプロフィールには、フォロー数が反映される
    await page.goto(`/users/${reader.id}`)
    await expect(page.getByTestId('following-count')).toHaveText('1')

    // リロードしても、フォロー中のまま
    await page.goto(`/users/${author.id}`)
    await expect(page.getByTestId('follow-button')).toHaveText('フォロー中')

    // 解除
    await page.getByTestId('follow-button').click()
    await expect(page.getByTestId('follow-button')).toHaveText('フォロー')
    await expect(page.getByTestId('follower-count')).toHaveText('0')
    await expect(page.getByTestId('spot-count')).toHaveText('1')
    await expect(card(page, followersOnly.name)).toHaveCount(0)
  })

  test('未ログインでフォローを押すと、ログイン画面へ移動し、ログイン後にプロフィールへ戻る(自動ではフォローしない)', async ({
    page,
    request,
  }) => {
    const author = await registerUser(request, 'author')
    const reader = await registerUser(request, 'reader')
    await page.goto(`/users/${author.id}`)
    await page.getByTestId('follow-button').click()

    await expect(page).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('redirect') === `/users/${author.id}`)
    const login = new LoginPage(page)
    await login.fill({ email: reader.email, password: reader.password })
    await login.submit()

    await expect(page).toHaveURL((url) => url.pathname === `/users/${author.id}`)
    await expect(page.getByTestId('profile-name')).toHaveText(author.name)
    await expect(page.getByTestId('follow-button')).toHaveText('フォロー')
    await expect(page.getByTestId('follower-count')).toHaveText('0')
  })

  test('自分のプロフィールには、フォローのボタンがなく、非公開を含むすべての投稿が出る', async ({ page, request }) => {
    const me = await registerUser(request, 'me')
    const open = await createSpot(request, me, { name: uniqueName('公開'), visibility: 'public' })
    const secret = await createSpot(request, me, { name: uniqueName('非公開'), visibility: 'private' })
    await signIn(page, me)

    // ヘッダーの「プロフィール」から、自分のプロフィールへ
    await page.goto('/')
    await page.getByRole('banner').getByRole('link', { name: 'プロフィール' }).click()
    await expect(page).toHaveURL((url) => url.pathname === `/users/${me.id}`)
    await expect(page.getByTestId('profile-name')).toHaveText(me.name)
    await expect(page.getByTestId('follow-button')).toHaveCount(0)
    await expect(page.getByTestId('spot-count')).toHaveText('2')
    await expect(card(page, open.name)).toBeVisible()
    await expect(card(page, secret.name)).toBeVisible()
  })

  test('詳細の投稿者名から、プロフィールへ移動できる。投稿のカードから詳細へも戻れる', async ({ page, request }) => {
    const author = await registerUser(request, 'author')
    const spot = await createSpot(request, author)
    await page.goto(`/spots/${spot.id}`)
    await page.getByTestId('author-link').click()
    await expect(page).toHaveURL((url) => url.pathname === `/users/${author.id}`)
    await card(page, spot.name).click()
    await expect(page.getByTestId('spot-name')).toHaveText(spot.name)
  })

  test('投稿が多いときは、20 件ずつ表示され、「もっと見る」で続きが出る', async ({ page, request }) => {
    const author = await registerUser(request, 'prolific')
    for (let i = 1; i <= 22; i++) await createSpot(request, author, { name: `プロフィール-${String(i).padStart(2, '0')}` })

    await page.goto(`/users/${author.id}`)
    await expect(page.getByTestId('spot-count')).toHaveText('22')
    await expect(page.getByTestId('spot-card')).toHaveCount(20)
    await expect(page.getByTestId('spot-card').first()).toContainText('プロフィール-22')
    await page.getByTestId('load-more').click()
    await expect(page.getByTestId('spot-card')).toHaveCount(22)
    await expect(page.getByTestId('load-more')).toHaveCount(0)
    const names = await page.getByTestId('spot-card').locator('h3').allTextContents()
    expect(new Set(names).size).toBe(22)
  })

  test('投稿のないユーザーでは、空の表示になる', async ({ page, request }) => {
    const user = await registerUser(request, 'empty')
    await page.goto(`/users/${user.id}`)
    await expect(page.getByTestId('list-empty')).toBeVisible()
  })

  test('存在しないユーザーや不正な ID では、「見つかりません」と表示される', async ({ page }) => {
    for (const id of ['2147483647', 'abc', '0']) {
      await page.goto(`/users/${id}`)
      await expect(page.getByTestId('not-found')).toBeVisible()
    }
  })

  test('プロフィールには、メールアドレスが表示されない', async ({ page, request }) => {
    const user = await registerUser(request, 'privacy')
    await page.goto(`/users/${user.id}`)
    await expect(page.getByTestId('profile-name')).toBeVisible()
    await expect(page.locator('body')).not.toContainText(user.email)
    await expect(page.locator('body')).not.toContainText('@')
  })
})
