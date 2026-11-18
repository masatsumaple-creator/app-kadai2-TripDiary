import { expect, test, type APIRequestContext } from '@playwright/test'
import { PASSWORD, createSpot, registerUser, signIn, uniqueName } from '../fixtures/api'

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })
const spotBody = () => ({ name: uniqueName('sec'), areas: ['京都府'], visibility: 'public' })

async function expectStatus(res: Awaited<ReturnType<APIRequestContext['get']>>, status: number) {
  expect(res.status(), `${res.url()} → ${await res.text()}`).toBe(status)
}

test.describe('セキュリティ: 認証・権限(API)', () => {
  test('未ログインでは、ログインが必要な API が 401 を返す', async ({ request }) => {
    await expectStatus(await request.get('/api/auth/me'), 401)
    await expectStatus(await request.post('/api/spots', { data: spotBody() }), 401)
    await expectStatus(await request.put('/api/spots/1', { data: spotBody() }), 401)
    await expectStatus(await request.delete('/api/spots/1'), 401)
  })

  test('不正なトークンは 401。未ログイン扱いにはしない(期限切れが権限不足に見えないように)', async ({ request }) => {
    const bad = { Authorization: 'Bearer invalid.token.value' }
    await expectStatus(await request.get('/api/auth/me', { headers: bad }), 401)
    await expectStatus(await request.get('/api/spots', { headers: bad }), 401)
    await expectStatus(await request.get('/api/spots/1', { headers: bad }), 401)
  })

  test('他人の投稿を、変更・削除できない(公開は 403、非公開は 404)。変更されない', async ({ request }) => {
    const owner = await registerUser(request, 'owner')
    const other = await registerUser(request, 'other')
    const open = await createSpot(request, owner)
    const secret = await createSpot(request, owner, { visibility: 'private' })

    await expectStatus(
      await request.put(`/api/spots/${open.id}`, { data: spotBody(), headers: bearer(other.accessToken) }),
      403,
    )
    await expectStatus(await request.delete(`/api/spots/${open.id}`, { headers: bearer(other.accessToken) }), 403)
    await expectStatus(
      await request.put(`/api/spots/${secret.id}`, { data: spotBody(), headers: bearer(other.accessToken) }),
      404,
    )
    await expectStatus(await request.delete(`/api/spots/${secret.id}`, { headers: bearer(other.accessToken) }), 404)

    // 元のまま残っている
    const after = await request.get(`/api/spots/${open.id}`)
    expect((await after.json()).name).toBe(open.name)
  })

  test('閲覧できない投稿は、存在しない投稿と同じ応答で、存在を知らせない', async ({ request }) => {
    const owner = await registerUser(request, 'owner')
    const other = await registerUser(request, 'other')
    const secret = await createSpot(request, owner, { visibility: 'private' })
    const hidden = await request.get(`/api/spots/${secret.id}`, { headers: bearer(other.accessToken) })
    const missing = await request.get('/api/spots/2147483647', { headers: bearer(other.accessToken) })
    expect(hidden.status()).toBe(404)
    expect(await hidden.json()).toEqual(await missing.json())
  })

  test('一覧の API は、他人の非公開・フォロワー限定の投稿を返さない', async ({ request }) => {
    const owner = await registerUser(request, 'owner')
    const other = await registerUser(request, 'other')
    // このテスト専用のエリア
    const area = ['岩手県']
    const secret = await createSpot(request, owner, { areas: area, visibility: 'private' })
    const followersOnly = await createSpot(request, owner, { areas: area, visibility: 'followers' })

    const res = await request.get('/api/spots?area=岩手県&limit=50', { headers: bearer(other.accessToken) })
    const ids = ((await res.json()).items as { id: number }[]).map((i) => i.id)
    expect(ids).not.toContain(secret.id)
    expect(ids).not.toContain(followersOnly.id)
  })

  test('フォロワー限定の投稿は、フォローすると見られ、解除すると再び見られなくなる(非公開はフォローしても見えない)', async ({
    request,
  }) => {
    const author = await registerUser(request, 'author')
    const reader = await registerUser(request, 'reader')
    // このテスト専用のエリア
    const followersOnly = await createSpot(request, author, { areas: ['奈良県'], visibility: 'followers' })
    const secret = await createSpot(request, author, { areas: ['奈良県'], visibility: 'private' })
    const status = async (id: number) => (await request.get(`/api/spots/${id}`, { headers: bearer(reader.accessToken) })).status()

    expect(await status(followersOnly.id)).toBe(404)

    const followed = await request.post(`/api/users/${author.id}/follow`, { headers: bearer(reader.accessToken) })
    expect(await followed.json()).toEqual({ isFollowing: true, followerCount: 1 })
    expect(await status(followersOnly.id)).toBe(200)
    expect(await status(secret.id)).toBe(404)

    await request.delete(`/api/users/${author.id}/follow`, { headers: bearer(reader.accessToken) })
    expect(await status(followersOnly.id)).toBe(404)
  })

  test('フォローは、ログインしていないと 401。自分自身はフォローできない', async ({ request }) => {
    const me = await registerUser(request, 'self')
    await expectStatus(await request.post(`/api/users/${me.id}/follow`), 401)
    await expectStatus(await request.post(`/api/users/${me.id}/follow`, { headers: bearer(me.accessToken) }), 400)
  })

  test('プロフィールにメールアドレスなどの個人情報が含まれない', async ({ request }) => {
    const user = await registerUser(request, 'private-info')
    const res = await request.get(`/api/users/${user.id}`)
    expect(res.status()).toBe(200)
    const text = await res.text()
    expect(text).not.toContain(user.email)
    expect(text).not.toContain('@')
    expect(text).not.toMatch(/password|hash/i)
  })

  test('いいね・コメントは、ログインが必要。閲覧できない投稿には使えない(存在を知らせない)', async ({ request }) => {
    const owner = await registerUser(request, 'owner')
    const stranger = await registerUser(request, 'stranger')
    const open = await createSpot(request, owner)
    const secret = await createSpot(request, owner, { visibility: 'private' })

    // 未ログイン
    await expectStatus(await request.post(`/api/spots/${open.id}/like`), 401)
    await expectStatus(await request.delete(`/api/spots/${open.id}/like`), 401)
    await expectStatus(await request.post(`/api/spots/${open.id}/comments`, { data: { body: 'こんにちは' } }), 401)
    // 閲覧できない投稿: 存在しない投稿と同じ 404(いいね、コメントの投稿・一覧)
    const h = bearer(stranger.accessToken)
    await expectStatus(await request.post(`/api/spots/${secret.id}/like`, { headers: h }), 404)
    await expectStatus(
      await request.post(`/api/spots/${secret.id}/comments`, { data: { body: 'こんにちは' }, headers: h }),
      404,
    )
    await expectStatus(await request.get(`/api/spots/${secret.id}/comments`, { headers: h }), 404)
    await expectStatus(await request.get(`/api/spots/${secret.id}/comments`), 404)
  })

  test('自分の投稿にはいいねできない。他人のコメントを削除できるのは、投稿者とコメントした本人だけ', async ({ request }) => {
    const owner = await registerUser(request, 'owner')
    const fan = await registerUser(request, 'fan')
    const third = await registerUser(request, 'third')
    const spot = await createSpot(request, owner)
    const own = bearer(owner.accessToken)

    await expectStatus(await request.post(`/api/spots/${spot.id}/like`, { headers: own }), 400)

    const created = await request.post(`/api/spots/${spot.id}/comments`, {
      data: { body: '質問です' },
      headers: bearer(fan.accessToken),
    })
    expect(created.status()).toBe(201)
    const commentId = ((await created.json()) as { id: number }).id
    const url = `/api/spots/${spot.id}/comments/${commentId}`

    await expectStatus(await request.delete(url, { headers: bearer(third.accessToken) }), 403)
    await expectStatus(await request.delete(url, { headers: own }), 204) // 投稿者は消せる
    await expectStatus(await request.delete(url, { headers: own }), 404) // 消した後は存在しない
  })

  test('コメントの内容は HTML として解釈されず、API は内容をそのまま返す(エスケープは表示側の責務)', async ({
    request,
  }) => {
    const owner = await registerUser(request, 'owner')
    const fan = await registerUser(request, 'fan')
    const spot = await createSpot(request, owner)
    const body = '<img src=x onerror="window.__xss=1"><script>alert(1)</script>'
    const res = await request.post(`/api/spots/${spot.id}/comments`, { data: { body }, headers: bearer(fan.accessToken) })
    expect(res.status()).toBe(201)
    expect(((await res.json()) as { body: string }).body).toBe(body)
  })

  test('パスワードの誤りと、未登録のメールで、応答が同じ(アカウントの有無を知らせない)', async ({ request }) => {
    const user = await registerUser(request, 'enum')
    const wrong = await request.post('/api/auth/login', { data: { email: user.email, password: 'wrong-password' } })
    const unknown = await request.post('/api/auth/login', {
      data: { email: `e2e_nobody_${Date.now()}@example.com`, password: PASSWORD },
    })
    expect(wrong.status()).toBe(401)
    expect(unknown.status()).toBe(401)
    expect(await wrong.json()).toEqual(await unknown.json())
  })

  test('想定外の項目(他人の userId など)は受け付けない', async ({ request }) => {
    const a = await registerUser(request, 'a')
    const b = await registerUser(request, 'b')
    const res = await request.post('/api/spots', {
      data: { ...spotBody(), userId: b.id },
      headers: bearer(a.accessToken),
    })
    expect(res.status()).toBe(400)
  })
})

test.describe('セキュリティ: トークンの保管(ブラウザ)', () => {
  test('リフレッシュトークンは、HttpOnly・SameSite=Strict・Path=/api/auth の Cookie にだけ入る', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request, 'cookie')
    await signIn(page, user)
    await page.goto('/')
    await expect(page.getByTestId('user-name')).toBeVisible()

    const cookies = await page.context().cookies()
    const refresh = cookies.find((c) => c.name === 'refresh_token')
    expect(refresh, 'refresh_token の Cookie がある').toBeDefined()
    expect(refresh).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/auth' })

    // JavaScript からは読めない
    const visibleToScript = await page.evaluate(() => document.cookie)
    expect(visibleToScript).not.toContain('refresh_token')
  })

  test('アクセストークンやリフレッシュトークンが、localStorage・sessionStorage・URL に残らない', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request, 'storage')
    await signIn(page, user)
    await page.goto('/')
    await expect(page.getByTestId('user-name')).toBeVisible()
    await page.goto('/spots/new')
    await expect(page.getByRole('heading', { name: 'スポットを投稿' })).toBeVisible()

    const stored = await page.evaluate(() => {
      const dump = (s: Storage) => Object.keys(s).map((k) => `${k}=${s.getItem(k)}`)
      return [...dump(localStorage), ...dump(sessionStorage)].join('\n')
    })
    // JWT は「xxx.yyy.zzz」の形。保存領域にも URL にも、トークンらしい文字列がないこと
    expect(stored).not.toMatch(/eyJ[\w-]+\.[\w-]+\.[\w-]+/)
    expect(stored).not.toContain(user.accessToken)
    expect(page.url()).not.toContain(user.accessToken)
    expect(page.url()).not.toMatch(/token/i)
  })

  test('ログアウトすると、リフレッシュトークンが使えなくなる(盗まれた Cookie も無効)', async ({ page, request }) => {
    const user = await registerUser(request, 'logout')
    await signIn(page, user)
    await page.goto('/')
    await expect(page.getByTestId('user-name')).toBeVisible()
    const before = (await page.context().cookies()).find((c) => c.name === 'refresh_token')!

    await page.getByTestId('logout').click()
    await expect(page.getByTestId('user-name')).toHaveCount(0)

    // ログアウト前の Cookie 値を送っても、リフレッシュできない
    const replay = await request.post('/api/auth/refresh', {
      headers: { Cookie: `refresh_token=${before.value}` },
    })
    expect(replay.status()).toBe(401)
  })
})

test.describe('セキュリティ: XSS・リダイレクト', () => {
  // 投稿者が入力した文字列は、HTML として解釈されず、そのまま文字として表示される。
  // 並列に実行される他のテストと、一覧で混ざらないよう、名前には一意の印を付ける
  const makePayload = () => ({
    name: `<img src=x onerror="window.__xss=1">${uniqueName('x')}`,
    review: '<script>window.__xss=2</script><b onmouseover="window.__xss=3">太字</b>',
    address: '"><svg onload="window.__xss=4">',
  })

  test('投稿の内容に含まれる HTML・スクリプトは、実行されず、文字として表示される', async ({ page, request }) => {
    const payload = makePayload()
    const owner = await registerUser(request, 'xss')
    // このテスト専用のエリア
    const spot = await createSpot(request, owner, { ...payload, areas: ['山口県'] })
    let dialogOpened = false
    page.on('dialog', async (d) => {
      dialogOpened = true
      await d.dismiss()
    })

    // 詳細
    await page.goto(`/spots/${spot.id}`)
    await expect(page.getByTestId('spot-name')).toHaveText(payload.name)
    await expect(page.getByTestId('spot-review')).toContainText('<script>window.__xss=2</script>')
    await expect(page.getByText(payload.address)).toBeVisible()
    // 一覧
    await page.goto('/')
    await page.getByTestId('area-filter').selectOption('山口県')
    await expect(page.getByTestId('spot-card').filter({ hasText: payload.name })).toBeVisible()

    // 実行されていない: 注入されたスクリプトの痕跡・要素・ダイアログがない
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
    expect(await page.locator('img[src="x"], svg[onload], [onmouseover]').count()).toBe(0)
    expect(dialogOpened).toBe(false)
  })

  test('編集フォームにも、入力した文字列がそのまま入り、実行されない', async ({ page, request }) => {
    const payload = makePayload()
    const owner = await registerUser(request, 'xssedit')
    const spot = await createSpot(request, owner, { ...payload, areas: ['山口県'] })
    await signIn(page, owner)
    await page.goto(`/spots/${spot.id}/edit`)
    await expect(page.getByTestId('name')).toHaveValue(payload.name)
    await expect(page.getByTestId('review')).toHaveValue(payload.review)
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
  })

  test('ログイン後の戻り先に、外部サイトの URL を指定しても、移動しない(オープンリダイレクト対策)', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request, 'redirect')
    for (const evil of ['https://evil.example.com/', '//evil.example.com/', '/\\evil.example.com']) {
      await page.goto(`/login?redirect=${encodeURIComponent(evil)}`)
      await page.getByTestId('email').fill(user.email)
      await page.getByTestId('password').fill(user.password)
      await page.getByTestId('submit').click()
      // 同じサイト内の「/」に着地し、外部には出ない。
      // ユーザー名はページ移動より先に表示されるため、URL は移動の完了を待って(再試行つきで)確認する
      await expect(page).toHaveURL((url) => url.hostname === 'localhost' && url.pathname === '/')
      await expect(page.getByTestId('user-name')).toBeVisible()
      await page.getByTestId('logout').click()
      await expect(page.getByTestId('user-name')).toHaveCount(0)
    }
  })
})
