import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { createSpot, registerUser, signIn, uniqueName, type TestUser } from '../fixtures/api'
import { LoginPage } from '../pages/login.page'

const bearer = (u: TestUser) => ({ Authorization: `Bearer ${u.accessToken}` })

async function addComment(request: APIRequestContext, user: TestUser, spotId: number, body: string): Promise<number> {
  const res = await request.post(`/api/spots/${spotId}/comments`, { data: { body }, headers: bearer(user) })
  if (res.status() !== 201) throw new Error(`コメントの作成に失敗しました: ${res.status()} ${await res.text()}`)
  return ((await res.json()) as { id: number }).id
}

const commentOf = (page: Page, text: string) => page.getByTestId('comment').filter({ hasText: text })

test.describe('いいね', () => {
  test('いいねすると件数が増え、リロードしても残る。もう一度押すと取り消せる', async ({ page, request }) => {
    const owner = await registerUser(request, 'owner')
    const fan = await registerUser(request, 'fan')
    const spot = await createSpot(request, owner)
    await signIn(page, fan)

    await page.goto(`/spots/${spot.id}`)
    const button = page.getByTestId('like-button')
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    await expect(button).toContainText('0')

    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect(button).toContainText('1')

    await page.reload()
    await expect(page.getByTestId('like-button')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('like-button')).toContainText('1')

    await page.getByTestId('like-button').click()
    await expect(page.getByTestId('like-button')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('like-button')).toContainText('0')
  })

  test('他の人のいいねも数に入り、一覧とプロフィールのカードにも件数が出る', async ({ page, request }) => {
    const owner = await registerUser(request, 'owner')
    const a = await registerUser(request, 'a')
    const b = await registerUser(request, 'b')
    const spot = await createSpot(request, owner)
    for (const u of [a, b]) await request.post(`/api/spots/${spot.id}/like`, { headers: bearer(u) })

    // 未ログインでも件数は見える(いいね済みにはならない)
    await page.goto(`/spots/${spot.id}`)
    await expect(page.getByTestId('like-button')).toContainText('2')
    await expect(page.getByTestId('like-button')).toHaveAttribute('aria-pressed', 'false')

    await page.goto(`/users/${owner.id}`)
    await expect(page.getByTestId('spot-card').filter({ hasText: spot.name })).toContainText('♥ 2')
  })

  test('自分の投稿には、いいねのボタンがなく、件数だけが出る', async ({ page, request }) => {
    const owner = await registerUser(request, 'owner')
    const spot = await createSpot(request, owner)
    await signIn(page, owner)
    await page.goto(`/spots/${spot.id}`)
    await expect(page.getByTestId('spot-name')).toBeVisible()
    await expect(page.getByTestId('like-button')).toHaveCount(0)
    await expect(page.getByTestId('like-count')).toContainText('0')
  })

  test('未ログインでいいねを押すと、ログイン画面へ移動し、ログイン後に戻る(自動ではいいねしない)', async ({
    page,
    request,
  }) => {
    const owner = await registerUser(request, 'owner')
    const fan = await registerUser(request, 'fan')
    const spot = await createSpot(request, owner)
    await page.goto(`/spots/${spot.id}`)
    await page.getByTestId('like-button').click()

    await expect(page).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('redirect') === `/spots/${spot.id}`)
    const login = new LoginPage(page)
    await login.fill({ email: fan.email, password: fan.password })
    await login.submit()
    await expect(page).toHaveURL((url) => url.pathname === `/spots/${spot.id}`)
    await expect(page.getByTestId('like-button')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('like-button')).toContainText('0')
  })
})

test.describe('コメント', () => {
  test('コメントを投稿すると、一覧に出て、件数が増え、入力欄が空になる。リロードしても残る', async ({ page, request }) => {
    const owner = await registerUser(request, 'owner')
    const asker = await registerUser(request, 'asker')
    const spot = await createSpot(request, owner)
    await signIn(page, asker)
    await page.goto(`/spots/${spot.id}`)

    await expect(page.getByTestId('comment-empty')).toBeVisible()
    await expect(page.getByTestId('comment-count')).toHaveText('0')

    await page.getByTestId('comment-input').fill('来月行く予定です。\nおすすめの時間帯は?')
    await page.getByTestId('comment-submit').click()

    await expect(commentOf(page, '来月行く予定です。')).toBeVisible()
    await expect(commentOf(page, '来月行く予定です。').getByTestId('comment-author')).toHaveText(asker.name)
    await expect(page.getByTestId('comment-count')).toHaveText('1')
    await expect(page.getByTestId('comment-input')).toHaveValue('')
    await expect(page.getByTestId('comment-empty')).toHaveCount(0)

    await page.reload()
    await expect(commentOf(page, 'おすすめの時間帯は?')).toBeVisible()
    await expect(page.getByTestId('comment-count')).toHaveText('1')
  })

  test('空・空白だけでは送信できない。入力は 500 文字までで、文字数が表示される', async ({ page, request }) => {
    const owner = await registerUser(request, 'owner')
    const fan = await registerUser(request, 'fan')
    const spot = await createSpot(request, owner)
    await signIn(page, fan)
    await page.goto(`/spots/${spot.id}`)

    const input = page.getByTestId('comment-input')
    const submit = page.getByTestId('comment-submit')
    await expect(submit).toBeDisabled()
    await input.fill('   ')
    await expect(submit).toBeDisabled()
    await input.fill('あ'.repeat(600))
    await expect(page.getByTestId('comment-counter')).toHaveText('500 / 500')
    await expect(submit).toBeEnabled()
    await input.fill('こんにちは')
    await expect(page.getByTestId('comment-counter')).toHaveText('5 / 500')
  })

  test('投稿者も、自分の投稿のコメントに返信できる。コメントは古い順に並ぶ', async ({ page, request }) => {
    const owner = await registerUser(request, 'owner')
    const asker = await registerUser(request, 'asker')
    const spot = await createSpot(request, owner)
    await addComment(request, asker, spot.id, '質問です')

    await signIn(page, owner)
    await page.goto(`/spots/${spot.id}`)
    await page.getByTestId('comment-input').fill('開門直後がおすすめです')
    await page.getByTestId('comment-submit').click()
    await expect(page.getByTestId('comment')).toHaveCount(2)

    const bodies = await page.getByTestId('comment-body').allTextContents()
    expect(bodies).toEqual(['質問です', '開門直後がおすすめです'])
  })

  test('削除できるのは、コメントした本人と投稿者だけ。第三者・未ログインには削除ボタンが出ない', async ({
    page,
    browser,
    request,
  }) => {
    const owner = await registerUser(request, 'owner')
    const asker = await registerUser(request, 'asker')
    const third = await registerUser(request, 'third')
    const spot = await createSpot(request, owner)
    await addComment(request, asker, spot.id, '質問者のコメント')
    await addComment(request, third, spot.id, '第三者のコメント')

    const deleteButtons = async (user?: TestUser) => {
      const ctx = await browser.newContext()
      const p = await ctx.newPage()
      if (user) await signIn(p, user)
      await p.goto(`/spots/${spot.id}`)
      await expect(p.getByTestId('comment')).toHaveCount(2)
      const count = await p.getByTestId('comment-delete').count()
      await ctx.close()
      return count
    }
    expect(await deleteButtons()).toBe(0) // 未ログイン
    expect(await deleteButtons(asker)).toBe(1) // 自分のコメントだけ
    expect(await deleteButtons(owner)).toBe(2) // 投稿者はすべて

    // 本人が、自分のコメントを削除(確認ダイアログを承認)
    await signIn(page, asker)
    await page.goto(`/spots/${spot.id}`)
    page.once('dialog', (d) => void d.accept())
    await commentOf(page, '質問者のコメント').getByTestId('comment-delete').click()
    await expect(commentOf(page, '質問者のコメント')).toHaveCount(0)
    await expect(page.getByTestId('comment-count')).toHaveText('1')
  })

  test('投稿者は、他人のコメントを削除できる。確認ダイアログで取り消すと、削除されない', async ({ page, request }) => {
    const owner = await registerUser(request, 'owner')
    const fan = await registerUser(request, 'fan')
    const spot = await createSpot(request, owner)
    await addComment(request, fan, spot.id, '不適切なコメント')
    await signIn(page, owner)
    await page.goto(`/spots/${spot.id}`)

    page.once('dialog', (d) => void d.dismiss())
    await commentOf(page, '不適切なコメント').getByTestId('comment-delete').click()
    await expect(commentOf(page, '不適切なコメント')).toBeVisible()
    await expect(page.getByTestId('comment-count')).toHaveText('1')

    page.once('dialog', (d) => void d.accept())
    await commentOf(page, '不適切なコメント').getByTestId('comment-delete').click()
    await expect(commentOf(page, '不適切なコメント')).toHaveCount(0)
    await expect(page.getByTestId('comment-empty')).toBeVisible()
    await expect(page.getByTestId('comment-count')).toHaveText('0')
  })

  test('未ログインでは、コメントを読めるが、入力欄はなく、ログインへの案内が出る', async ({ page, request }) => {
    const owner = await registerUser(request, 'owner')
    const fan = await registerUser(request, 'fan')
    const spot = await createSpot(request, owner)
    await addComment(request, fan, spot.id, '読めるコメント')

    await page.goto(`/spots/${spot.id}`)
    await expect(commentOf(page, '読めるコメント')).toBeVisible()
    await expect(page.getByTestId('comment-input')).toHaveCount(0)
    await page.getByTestId('comment-login').click()
    await expect(page).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('redirect') === `/spots/${spot.id}`)
  })

  test('コメントが多いときは、20 件ずつ表示され、「もっと見る」で続きが出る。投稿すると、最後に付く', async ({
    page,
    request,
  }) => {
    const owner = await registerUser(request, 'owner')
    const fan = await registerUser(request, 'fan')
    const spot = await createSpot(request, owner)
    for (let i = 1; i <= 22; i++) await addComment(request, fan, spot.id, `コメント-${String(i).padStart(2, '0')}`)

    await signIn(page, fan)
    await page.goto(`/spots/${spot.id}`)
    await expect(page.getByTestId('comment')).toHaveCount(20)
    await expect(page.getByTestId('comment-count')).toHaveText('22')
    await expect(page.getByTestId('comment-body').first()).toHaveText('コメント-01')

    // 続きを読み込む前に投稿しても、順序が崩れず、最後に付く
    await page.getByTestId('comment-input').fill('新しいコメント')
    await page.getByTestId('comment-submit').click()
    await expect(page.getByTestId('comment')).toHaveCount(23)
    await expect(page.getByTestId('comments-load-more')).toHaveCount(0)
    const bodies = await page.getByTestId('comment-body').allTextContents()
    expect(bodies.at(-1)).toBe('新しいコメント')
    expect(bodies.at(-2)).toBe('コメント-22')
    expect(new Set(bodies).size).toBe(23)
  })

  test('コメント内の HTML・スクリプトは、実行されず、文字として表示される', async ({ page, request }) => {
    const owner = await registerUser(request, 'owner')
    const fan = await registerUser(request, 'fan')
    const spot = await createSpot(request, owner)
    const payload = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>${uniqueName('x')}`
    await addComment(request, fan, spot.id, payload)

    let dialogOpened = false
    page.on('dialog', async (d) => {
      dialogOpened = true
      await d.dismiss()
    })
    await signIn(page, owner)
    await page.goto(`/spots/${spot.id}`)
    await expect(page.getByTestId('comment-body')).toHaveText(payload)
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
    expect(await page.locator('img[src="x"], [onerror]').count()).toBe(0)
    expect(dialogOpened).toBe(false)

    // 自分で投稿した直後の表示でも、同じ
    await signIn(page, fan)
    await page.goto(`/spots/${spot.id}`)
    await page.getByTestId('comment-input').fill('<b onmouseover="window.__xss=3">太字</b>')
    await page.getByTestId('comment-submit').click()
    await expect(commentOf(page, '<b onmouseover=')).toBeVisible()
    expect(await page.locator('b[onmouseover]').count()).toBe(0)
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
  })

  test('閲覧できない投稿には、コメント欄もなく、「見つかりません」と表示される', async ({ page, request }) => {
    const owner = await registerUser(request, 'owner')
    const stranger = await registerUser(request, 'stranger')
    const secret = await createSpot(request, owner, { visibility: 'private' })
    await signIn(page, stranger)
    await page.goto(`/spots/${secret.id}`)
    await expect(page.getByTestId('not-found')).toBeVisible()
    await expect(page.getByTestId('comments')).toHaveCount(0)
    await expect(page.getByTestId('like-button')).toHaveCount(0)
  })
})

test.describe('フォロー中の一覧(S-03)', () => {
  test('フォローしている人の、見られる投稿だけが、新着順に出る。解除すると消える', async ({ page, request }) => {
    const me = await registerUser(request, 'me')
    const followed = await registerUser(request, 'followed')
    const stranger = await registerUser(request, 'stranger')
    const open = await createSpot(request, followed, { name: uniqueName('公開') })
    const followersOnly = await createSpot(request, followed, { name: uniqueName('限定'), visibility: 'followers' })
    const secret = await createSpot(request, followed, { name: uniqueName('非公開'), visibility: 'private' })
    const other = await createSpot(request, stranger, { name: uniqueName('他人') })
    const mine = await createSpot(request, me, { name: uniqueName('自分') })

    await signIn(page, me)
    await page.goto('/following')
    await expect(page.getByTestId('list-empty')).toBeVisible() // まだ誰もフォローしていない

    await page.goto(`/users/${followed.id}`)
    await page.getByTestId('follow-button').click()
    await expect(page.getByTestId('follow-button')).toHaveText('フォロー中')

    await page.getByRole('navigation').getByRole('link', { name: 'フォロー中' }).first().click()
    await expect(page).toHaveURL((url) => url.pathname === '/following')
    // allTextContents() は自動で待たないため、一覧が読み込まれる(件数が揃う)のを待ってから読み取る
    await expect(page.getByTestId('spot-card')).toHaveCount(2)
    const names = await page.getByTestId('spot-card').locator('h3').allTextContents()
    // 新しい順: フォロワー限定(後に作成)→ 公開。非公開・他人・自分の投稿は出ない
    expect(names).toEqual([followersOnly.name, open.name])
    for (const hidden of [secret.name, other.name, mine.name]) expect(names).not.toContain(hidden)

    // 解除すると、消える
    await page.goto(`/users/${followed.id}`)
    await page.getByTestId('follow-button').click()
    await expect(page.getByTestId('follow-button')).toHaveText('フォロー')
    await page.goto('/following')
    await expect(page.getByTestId('list-empty')).toBeVisible()
  })

  test('投稿が多いときは、20 件ずつ表示され、「もっと見る」で続きが出る', async ({ page, request }) => {
    const me = await registerUser(request, 'me')
    const followed = await registerUser(request, 'prolific')
    for (let i = 1; i <= 22; i++) await createSpot(request, followed, { name: `フォロー中-${String(i).padStart(2, '0')}` })
    await request.post(`/api/users/${followed.id}/follow`, { headers: bearer(me) })

    await signIn(page, me)
    await page.goto('/following')
    await expect(page.getByTestId('spot-card')).toHaveCount(20)
    await expect(page.getByTestId('spot-card').first()).toContainText('フォロー中-22')
    await page.getByTestId('load-more').click()
    await expect(page.getByTestId('spot-card')).toHaveCount(22)
    await expect(page.getByTestId('load-more')).toHaveCount(0)
  })

  test('未ログインで開くと、ログイン画面へ移動する', async ({ page }) => {
    await page.goto('/following')
    await expect(page).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('redirect') === '/following')
  })

  test('「フォロー中」のページに、モックの表示(ダミーのデータ)が出ない', async ({ page, request }) => {
    const me = await registerUser(request, 'me')
    await signIn(page, me)
    await page.goto('/following')
    await expect(page.getByTestId('list-empty')).toBeVisible()
    await expect(page.getByTestId('mock-notice')).toHaveCount(0)
  })
})
