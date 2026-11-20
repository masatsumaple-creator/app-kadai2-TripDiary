import { expect, test, type Page } from '@playwright/test'
import { createSpot, registerUser, signIn, uniqueName } from '../fixtures/api'
import { SpotFormPage } from '../pages/spot-form.page'
import { scanA11y } from '../support/a11y'
import { pngFile } from '../support/png'

// 写真(F-04)。画像の縮小はブラウザ(canvas)、アップロードは S3 互換のサーバーへの署名付き URL。
// 「実際に画面で選んだ画像が、縮小されて保存され、表示される」ことを、通して確かめる

const naturalSize = (page: Page, testId: string) =>
  page.getByTestId(testId).first().evaluate((img: HTMLImageElement) => ({ w: img.naturalWidth, h: img.naturalHeight }))

const addPhotos = (page: Page, files: ReturnType<typeof pngFile>[]) =>
  page.getByTestId('photo-input').setInputFiles(files)

test.describe('写真', () => {
  test('選んだ画像は縮小(長辺 1600px の JPEG)され、投稿の詳細と一覧のカードに表示される', async ({ page, request }) => {
    const user = await registerUser(request, 'photo')
    await signIn(page, user)
    const form = new SpotFormPage(page)
    const name = uniqueName('写真つき')
    const area = '佐賀県'

    await form.goto()
    await form.fill({ name, review: '写真のテスト', areas: [area] })
    // 大きい画像(2400x1200)と、小さい画像(800x600)
    await addPhotos(page, [pngFile('big.png', 2400, 1200), pngFile('small.png', 800, 600, [200, 80, 40])])
    await expect(page.getByTestId('photo-item')).toHaveCount(2)
    await expect(page.getByRole('button', { name: '写真 1 を外す' })).toBeVisible()
    await form.save()

    // 詳細: 1 枚目は、縦横比を保って 1600x800 に縮小されている。2 つ目は、そのまま
    await expect(page).toHaveURL((url) => /^\/spots\/\d+$/.test(url.pathname))
    await expect(page.getByTestId('spot-photo-main')).toBeVisible()
    await expect(page.getByTestId('photo-counter')).toHaveText('1 / 2')
    await expect.poll(() => naturalSize(page, 'spot-photo-main')).toEqual({ w: 1600, h: 800 })

    // 保存されたのは JPEG(PNG からの変換)で、撮影場所などの情報を含まない
    const src = await page.getByTestId('spot-photo-main').getAttribute('src')
    const stored = await page.request.get(src!)
    expect(stored.status()).toBe(200)
    expect(stored.headers()['content-type']).toBe('image/jpeg')

    await page.getByTestId('photo-next').click()
    await expect(page.getByTestId('photo-counter')).toHaveText('2 / 2')
    await expect.poll(() => naturalSize(page, 'spot-photo-main')).toEqual({ w: 800, h: 600 })

    // 一覧のカードには、代表の写真(先頭の 1 枚)
    await page.goto('/')
    await page.getByTestId('area-filter').selectOption(area)
    const card = page.getByTestId('spot-card').filter({ hasText: name })
    await expect(card).toBeVisible()
    await expect(card.getByTestId('spot-card-photo')).toBeVisible()
    await expect
      .poll(() => card.getByTestId('spot-card-photo').evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(1600)
  })

  test('写真がない投稿は、これまでどおり(色のカード・写真の欄なし)', async ({ page, request }) => {
    const user = await registerUser(request, 'nophoto')
    const spot = await createSpot(request, user)
    await page.goto(`/spots/${spot.id}`)
    await expect(page.getByTestId('spot-name')).toHaveText(spot.name)
    await expect(page.getByTestId('spot-photos')).toHaveCount(0)
  })

  test('編集で、写真を外したり、足したりできる', async ({ page, request }) => {
    const user = await registerUser(request, 'photoedit')
    await signIn(page, user)
    const form = new SpotFormPage(page)
    const name = uniqueName('写真の編集')

    await form.goto()
    await form.fill({ name, areas: ['長崎県'] })
    await addPhotos(page, [pngFile('a.png', 400, 300), pngFile('b.png', 400, 300, [10, 200, 10])])
    await form.save()
    await expect(page.getByTestId('photo-counter')).toHaveText('1 / 2')
    const detailUrl = page.url()
    const id = Number(new URL(detailUrl).pathname.split('/').pop())

    await page.getByTestId('edit').click()
    await expect(page.getByTestId('photo-item')).toHaveCount(2)
    // 1 枚外して、1 枚足す
    await page.getByTestId('photo-remove').first().click()
    await expect(page.getByTestId('photo-item')).toHaveCount(1)
    await addPhotos(page, [pngFile('c.png', 300, 300, [200, 10, 10])])
    await expect(page.getByTestId('photo-item')).toHaveCount(2)
    await form.save()

    await expect(page).toHaveURL(detailUrl)
    await expect(page.getByTestId('photo-counter')).toHaveText('1 / 2')
    const res = await request.get(`/api/spots/${id}`, { headers: { Authorization: `Bearer ${user.accessToken}` } })
    expect(((await res.json()) as { photos: unknown[] }).photos).toHaveLength(2)

    // すべて外すと、写真の欄が消える
    await page.getByTestId('edit').click()
    await page.getByTestId('photo-remove').first().click()
    await page.getByTestId('photo-remove').first().click()
    await expect(page.getByTestId('photo-item')).toHaveCount(0)
    await form.save()
    await expect(page).toHaveURL(detailUrl)
    await expect(page.getByTestId('spot-photos')).toHaveCount(0)
  })

  test('写真以外のファイルは断り、20 枚を超える分は追加しない', async ({ page, request }) => {
    const user = await registerUser(request, 'photolimit')
    await signIn(page, user)
    await new SpotFormPage(page).goto()

    // 写真ではないファイル
    await page.getByTestId('photo-input').setInputFiles({ name: 'memo.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
    await expect(page.getByTestId('photo-message')).toContainText('memo.txt')
    await expect(page.getByTestId('photo-item')).toHaveCount(0)

    // 21 枚を一度に選ぶと、20 枚だけが入り、残りは断る
    const files = Array.from({ length: 21 }, (_, i) => pngFile(`p${i}.png`, 40, 30, [i * 10, 100, 100]))
    await addPhotos(page, files)
    await expect(page.getByTestId('photo-item')).toHaveCount(20)
    await expect(page.getByTestId('photo-message')).toContainText('最大 20 枚')
    // 上限に達したら、追加ボタンは押せない
    await expect(page.getByTestId('photo-input')).toBeDisabled()
  })

  test('写真の送信に失敗しても、投稿は保存済みで、もう一度保存すると、写真だけを送り直す(投稿は重複しない)', async ({ page, request }) => {
    const user = await registerUser(request, 'photoretry')
    await signIn(page, user)
    const form = new SpotFormPage(page)
    const name = uniqueName('送信の失敗')

    // S3 への PUT を、最初の 1 回だけ失敗させる
    let failed = false
    await page.route('**/tripdiary-e2e/**', async (route) => {
      if (route.request().method() === 'PUT' && !failed) {
        failed = true
        await route.fulfill({ status: 500, body: 'boom' })
        return
      }
      await route.continue()
    })

    await form.goto()
    await form.fill({ name, areas: ['大分県'] })
    await addPhotos(page, [pngFile('a.png', 300, 200)])
    await form.save()

    await expect(page.getByTestId('form-error')).toContainText('投稿は保存しましたが、1 枚の写真を送信できませんでした')
    await expect(page.getByTestId('photo-item')).toHaveAttribute('data-status', 'failed')
    await expect(page).toHaveURL((url) => url.pathname === '/spots/new')

    // もう一度保存 → 写真が送られ、詳細へ
    await form.save()
    await expect(page).toHaveURL((url) => /^\/spots\/\d+$/.test(url.pathname))
    await expect(page.getByTestId('photo-counter')).toHaveCount(0) // 1 枚だけなので、カウンターは出ない
    await expect(page.getByTestId('spot-photo-main')).toBeVisible()

    // 投稿は 1 件だけ
    const list = await request.get(`/api/spots?author=${user.id}`, { headers: { Authorization: `Bearer ${user.accessToken}` } })
    const items = ((await list.json()) as { items: { name: string }[] }).items.filter((s) => s.name === name)
    expect(items).toHaveLength(1)
  })

  test('投稿を削除しても、画面の流れが壊れない(写真つきの投稿の削除)', async ({ page, request }) => {
    const user = await registerUser(request, 'photodelete')
    await signIn(page, user)
    const form = new SpotFormPage(page)
    await form.goto()
    await form.fill({ name: uniqueName('削除する写真つき'), areas: ['宮崎県'] })
    await addPhotos(page, [pngFile('a.png', 300, 200)])
    await form.save()
    await expect(page.getByTestId('spot-photo-main')).toBeVisible()

    const src = (await page.getByTestId('spot-photo-main').getAttribute('src'))!
    expect((await page.request.get(src)).status()).toBe(200)

    page.once('dialog', (d) => d.accept())
    await page.getByTestId('delete').click()
    await expect(page).toHaveURL((url) => url.pathname === '/')
    // 画像も消えている
    await expect.poll(async () => (await page.request.get(src)).status()).toBe(404)
  })

  test('アクセシビリティ: 投稿フォーム(写真つき)と、複数枚の詳細', async ({ page, request }) => {
    const user = await registerUser(request, 'photoa11y')
    await signIn(page, user)
    const form = new SpotFormPage(page)
    await form.goto()
    await form.fill({ name: uniqueName('a11y写真'), areas: ['熊本県'] })
    await addPhotos(page, [pngFile('a.png', 300, 200), pngFile('b.png', 300, 200, [10, 120, 10])])
    await expect(page.getByTestId('photo-item')).toHaveCount(2)
    expect(await scanA11y(page)).toEqual([])

    await form.save()
    await expect(page.getByTestId('photo-counter')).toHaveText('1 / 2')
    await expect.poll(() => naturalSize(page, 'spot-photo-main')).toEqual({ w: 300, h: 200 })
    expect(await scanA11y(page)).toEqual([])
  })
})
