import { expect, test, type Page } from '@playwright/test'
import { createSpot, registerUser, signIn, uniqueName } from '../fixtures/api'
import { SpotFormPage } from '../pages/spot-form.page'
import { scanA11y } from '../support/a11y'

// 地図(F-16〜F-18)。ここでは、AWS に接続せず、地図の絵のない背景で、ピン・クリック・ドラッグの操作を確かめる。
// 実際の地図の表示(Amazon Location Service)は、AWS に環境を作った確認で行う。
// テストごとに、別の場所(南半球の海の上。ほかのテストの投稿と混ざらない)を、?lat=…&lng=…&zoom=… で開く

const pin = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const mapUrl = (lat: number, lng: number, zoom = 11) => `/map?lat=${lat}&lng=${lng}&zoom=${zoom}`

test.describe('地図(S-08)', () => {
  test('表示範囲の中の、閲覧できる投稿だけが、ピンで出る(外・他人の非公開・位置なしは出ない)', async ({ page, request }) => {
    const owner = await registerUser(request, 'maporder')
    const other = await registerUser(request, 'mapother')
    // 区画: 緯度 -45 付近、経度 170 付近
    const a = await createSpot(request, owner, { latitude: -45.0, longitude: 170.0 })
    const b = await createSpot(request, other, { latitude: -45.01, longitude: 170.03 })
    const priv = await createSpot(request, owner, { latitude: -45.02, longitude: 170.01, visibility: 'private' })
    const far = await createSpot(request, owner, { latitude: -40, longitude: 170 }) // 遠い
    const noPos = await createSpot(request, owner) // 位置なし

    // 未ログイン: 公開の 2 件だけ
    await page.goto(mapUrl(-45.0, 170.02))
    await expect(pin(page, a.name)).toBeVisible()
    await expect(pin(page, b.name)).toBeVisible()
    await expect(pin(page, priv.name)).toHaveCount(0)
    await expect(pin(page, far.name)).toHaveCount(0)
    await expect(pin(page, noPos.name)).toHaveCount(0)
    await expect(page.getByTestId('map-failed')).toHaveCount(0)

    // 本人: 自分の非公開も出る
    await signIn(page, owner)
    await page.goto(mapUrl(-45.0, 170.02))
    await expect(pin(page, priv.name)).toBeVisible()
    await expect(pin(page, a.name)).toBeVisible()
  })

  test('ピンを押すと概要が出て、概要から詳細へ移動できる', async ({ page, request }) => {
    const user = await registerUser(request, 'mapsummary')
    const spot = await createSpot(request, user, { latitude: -46.0, longitude: 171.0, areas: ['京都府', '大阪府'] })

    await page.goto(mapUrl(-46.0, 171.0))
    await expect(page.getByTestId('map-hint')).toBeVisible()
    await pin(page, spot.name).click()

    const summary = page.getByTestId('map-summary')
    await expect(summary).toContainText(spot.name)
    await expect(summary).toContainText('京都府')
    await expect(summary).toContainText('大阪府')

    await summary.click()
    await expect(page).toHaveURL((url) => url.pathname === `/spots/${spot.id}`)
    await expect(page.getByTestId('spot-name')).toHaveText(spot.name)
  })

  test('エリアで絞り込める', async ({ page, request }) => {
    const user = await registerUser(request, 'maparea')
    const kyoto = await createSpot(request, user, { latitude: -47.0, longitude: 172.0, areas: ['京都府'] })
    const hokkaido = await createSpot(request, user, { latitude: -47.0, longitude: 172.02, areas: ['北海道'] })

    await page.goto(mapUrl(-47.0, 172.01))
    await expect(pin(page, kyoto.name)).toBeVisible()
    await expect(pin(page, hokkaido.name)).toBeVisible()

    await page.getByTestId('area-filter').selectOption('北海道')
    await expect(pin(page, hokkaido.name)).toBeVisible()
    await expect(pin(page, kyoto.name)).toHaveCount(0)

    await page.getByTestId('area-filter').selectOption('')
    await expect(pin(page, kyoto.name)).toBeVisible()
  })

  test('範囲に投稿がなければ、その旨を表示する', async ({ page }) => {
    await page.goto(mapUrl(-60, 100, 9))
    await expect(page.getByTestId('map-hint')).toContainText('表示できるスポットがありません')
  })

  test('スマホ幅でも、地図が横にはみ出さず、ピンを操作できる', async ({ page, request }) => {
    const user = await registerUser(request, 'mapmobile')
    const spot = await createSpot(request, user, { latitude: -48.0, longitude: 173.0 })
    await page.setViewportSize({ width: 393, height: 851 })
    await page.goto(mapUrl(-48.0, 173.0))
    await pin(page, spot.name).click()
    await expect(page.getByTestId('map-summary')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('アクセシビリティ(axe)', async ({ page, request }) => {
    const user = await registerUser(request, 'mapa11y')
    const spot = await createSpot(request, user, { latitude: -49.0, longitude: 174.0 })
    await page.goto(mapUrl(-49.0, 174.0))
    await expect(pin(page, spot.name)).toBeVisible()
    await pin(page, spot.name).click()
    await expect(page.getByTestId('map-summary')).toBeVisible()
    expect(await scanA11y(page)).toEqual([])
  })
})

test.describe('スポット詳細の小さな地図', () => {
  test('位置のある投稿には、位置のピンが出る。位置のない投稿には、地図を出さない', async ({ page, request }) => {
    const user = await registerUser(request, 'detailmap')
    const withPos = await createSpot(request, user, { latitude: -50.0, longitude: 175.0 })
    const without = await createSpot(request, user)

    await page.goto(`/spots/${withPos.id}`)
    await expect(page.getByTestId('spot-map')).toBeVisible()
    await expect(pin(page, withPos.name)).toBeVisible()

    await page.goto(`/spots/${without.id}`)
    await expect(page.getByTestId('spot-name')).toHaveText(without.name)
    await expect(page.getByTestId('spot-map')).toHaveCount(0)
  })
})

test.describe('投稿フォームの位置の指定(S-05)', () => {
  const latLng = async (page: Page) => (await page.getByTestId('lat-lng').innerText()).replace('緯度経度:', '').trim()

  test('地図をタップして、ピンを置き、ドラッグで動かせる。保存すると、その位置が保存される', async ({ page, request }) => {
    const user = await registerUser(request, 'pick')
    await signIn(page, user)
    const form = new SpotFormPage(page)
    const name = uniqueName('位置の指定')
    await form.goto()
    await form.fill({ name, areas: ['京都府'] })

    expect(await latLng(page)).toBe('-, -')
    await expect(page.getByTestId('map-pin')).toHaveCount(0)

    // タップ: ピンが置かれ、緯度経度が入る
    await page.getByTestId('position-map').click({ position: { x: 200, y: 120 } })
    await expect(page.getByTestId('map-pin')).toHaveCount(1)
    const placed = await latLng(page)
    expect(placed).not.toBe('-, -')

    // ドラッグ: ピンを動かすと、緯度経度が変わる
    const box = (await page.getByTestId('map-pin').boundingBox())!
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 60, from.y + 40, { steps: 8 })
    await page.mouse.up()
    await expect.poll(() => latLng(page)).not.toBe(placed)
    const moved = await latLng(page)

    // 保存 → 詳細に、その位置のピン。API にも、同じ位置が保存されている
    await form.save()
    await expect(page).toHaveURL((url) => /^\/spots\/\d+$/.test(url.pathname))
    await expect(page.getByTestId('spot-map')).toBeVisible()
    const id = Number(new URL(page.url()).pathname.split('/').pop())
    const res = await request.get(`/api/spots/${id}`, { headers: { Authorization: `Bearer ${user.accessToken}` } })
    const spot = (await res.json()) as { latitude: number; longitude: number }
    expect(`${spot.latitude.toFixed(6)}, ${spot.longitude.toFixed(6)}`).toBe(moved)
  })

  test('位置情報を消すと、ピンも緯度経度も消える。編集では、保存済みの位置から始まる', async ({ page, request }) => {
    const user = await registerUser(request, 'clear')
    const spot = await createSpot(request, user, { latitude: -51.5, longitude: 176.25 })
    await signIn(page, user)
    await page.goto(`/spots/${spot.id}/edit`)

    await expect(page.getByTestId('map-pin')).toHaveCount(1)
    expect(await latLng(page)).toBe('-51.500000, 176.250000')

    await page.getByTestId('clear-location').click()
    await expect(page.getByTestId('map-pin')).toHaveCount(0)
    expect(await latLng(page)).toBe('-, -')
  })

  test.describe('現在地から入力', () => {
    test.use({ permissions: ['geolocation'], geolocation: { latitude: 35.0123, longitude: 135.7654 } })

    test('位置と住所が自動で入る(住所は、書き換えられる)', async ({ page, request }) => {
      const user = await registerUser(request, 'here')
      await signIn(page, user)
      // AWS には接続しない(住所の取得 API の応答を、差し替える)
      let asked = ''
      await page.route('**/api/geocode/reverse*', async (route) => {
        asked = new URL(route.request().url()).search
        await route.fulfill({ json: { address: '京都府京都市テスト区1丁目2-3' } })
      })

      await new SpotFormPage(page).goto()
      await page.getByTestId('current-location').click()

      await expect(page.getByTestId('address')).toHaveValue('京都府京都市テスト区1丁目2-3')
      expect(await latLng(page)).toBe('35.012300, 135.765400')
      await expect(page.getByTestId('map-pin')).toHaveCount(1)
      expect(asked).toContain('lat=35.0123')
      expect(asked).toContain('lng=135.7654')
      await expect(page.getByTestId('location-message')).toContainText('住所を入力しました')

      // 書き換えられる
      await page.getByTestId('address').fill('自分で直した住所')
      await expect(page.getByTestId('address')).toHaveValue('自分で直した住所')
    })

    test('住所を取得できなくても、位置は入り、住所の手入力に切り替えられる(502)', async ({ page, request }) => {
      const user = await registerUser(request, 'here502')
      await signIn(page, user)
      await page.route('**/api/geocode/reverse*', (route) =>
        route.fulfill({
          status: 502,
          json: { code: 'GEOCODE_UNAVAILABLE', message: '住所を取得できませんでした。住所を手入力してください。' },
        }),
      )

      await new SpotFormPage(page).goto()
      await page.getByTestId('address').fill('先に書いた住所')
      await page.getByTestId('current-location').click()

      await expect(page.getByTestId('location-message')).toContainText('手入力')
      expect(await latLng(page)).toBe('35.012300, 135.765400')
      // 書いてあった住所は、消さない
      await expect(page.getByTestId('address')).toHaveValue('先に書いた住所')
    })

    test('住所が見つからないときは、その旨を知らせ、住所は変えない(null)', async ({ page, request }) => {
      const user = await registerUser(request, 'herenull')
      await signIn(page, user)
      await page.route('**/api/geocode/reverse*', (route) => route.fulfill({ json: { address: null } }))

      await new SpotFormPage(page).goto()
      await page.getByTestId('current-location').click()
      await expect(page.getByTestId('location-message')).toContainText('見つかりませんでした')
      await expect(page.getByTestId('address')).toHaveValue('')
    })

    test('地図をタップした位置の住所も、ボタンで入れられる(自動では呼ばない)', async ({ page, request }) => {
      const user = await registerUser(request, 'tapaddress')
      await signIn(page, user)
      let calls = 0
      await page.route('**/api/geocode/reverse*', async (route) => {
        calls++
        await route.fulfill({ json: { address: 'タップした位置の住所' } })
      })

      await new SpotFormPage(page).goto()
      await page.getByTestId('position-map').click({ position: { x: 150, y: 100 } })
      await expect(page.getByTestId('map-pin')).toHaveCount(1)
      // タップしただけでは、問い合わせない
      expect(calls).toBe(0)

      await page.getByTestId('fill-address').click()
      await expect(page.getByTestId('address')).toHaveValue('タップした位置の住所')
      expect(calls).toBe(1)
    })
  })

  test('アクセシビリティ(axe): 位置を置いた状態のフォーム', async ({ page, request }) => {
    const user = await registerUser(request, 'formmapa11y')
    await signIn(page, user)
    await new SpotFormPage(page).goto()
    await page.getByTestId('position-map').click({ position: { x: 200, y: 100 } })
    await expect(page.getByTestId('map-pin')).toHaveCount(1)
    expect(await scanA11y(page)).toEqual([])
  })
})
