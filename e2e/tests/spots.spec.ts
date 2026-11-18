import { expect, test } from '@playwright/test'
import { createSpot, registerUser, signIn, uniqueName } from '../fixtures/api'
import { SpotFormPage } from '../pages/spot-form.page'

const card = (page: import('@playwright/test').Page, name: string) =>
  page.getByTestId('spot-card').filter({ hasText: name })

test.describe('スポットの投稿・閲覧', () => {
  test('投稿 → 詳細 → 編集 → 削除まで、画面で通して操作できる', async ({ page, request }) => {
    const user = await registerUser(request, 'owner')
    await signIn(page, user)
    const form = new SpotFormPage(page)
    const name = uniqueName('玉造温泉')

    // 投稿
    await form.goto()
    await form.fill({
      name,
      review: '夜の温泉街を散歩。\n次は朝飯を食べたい。',
      address: '島根県松江市玉湯町',
      areas: ['島根県'],
      visibility: 'public',
    })
    await form.save()

    // 詳細(感想の改行も保たれる)
    await expect(page).toHaveURL(/\/spots\/\d+$/)
    const detailUrl = page.url()
    await expect(page.getByTestId('spot-name')).toHaveText(name)
    await expect(page.getByTestId('spot-review')).toContainText('夜の温泉街を散歩。')
    await expect(page.getByTestId('spot-review')).toContainText('次は朝飯を食べたい。')
    await expect(page.getByText('島根県松江市玉湯町')).toBeVisible()

    // 編集(名前の変更・エリアの追加・非公開への変更)
    await page.getByTestId('edit').click()
    await expect(page.getByTestId('name')).toHaveValue(name)
    const renamed = `${name}-更新`
    await form.fill({ name: renamed, areas: ['鳥取県'], visibility: 'private' })
    await form.save()
    await expect(page).toHaveURL(detailUrl)
    await expect(page.getByTestId('spot-name')).toHaveText(renamed)
    await expect(page.getByRole('main').getByText('鳥取県').first()).toBeVisible()
    await expect(page.getByText('非公開').first()).toBeVisible()

    // 削除(確認ダイアログを承認)
    page.once('dialog', (dialog) => void dialog.accept())
    await page.getByTestId('delete').click()
    await expect(page).toHaveURL('/')
    await page.goto(detailUrl)
    await expect(page.getByTestId('not-found')).toBeVisible()
  })

  test('必須項目が空の間は保存できない。エリアは 3 個までしか選べない', async ({ page, request }) => {
    const user = await registerUser(request, 'form')
    await signIn(page, user)
    const form = new SpotFormPage(page)
    await form.goto()

    await expect(page.getByTestId('save')).toBeDisabled()
    await form.fill({ name: '名前だけ' })
    await expect(page.getByTestId('save')).toBeDisabled()
    await form.fill({ areas: ['北海道', '青森県', '岩手県'] })
    await expect(page.getByTestId('save')).toBeEnabled()
    await expect(page.getByTestId('area-select')).toBeDisabled()
  })

  test('新着一覧に投稿が出る。エリアで絞り込める', async ({ page, request }) => {
    const user = await registerUser(request, 'list')
    const inYamagata = await createSpot(request, user, { name: uniqueName('山形の宿'), areas: ['山形県'] })
    const inFukushima = await createSpot(request, user, { name: uniqueName('福島の宿'), areas: ['福島県'] })

    await page.goto('/')
    await page.getByTestId('area-filter').selectOption('山形県')
    await expect(card(page, inYamagata.name)).toBeVisible()
    await expect(card(page, inFukushima.name)).toHaveCount(0)

    await page.getByTestId('area-filter').selectOption('福島県')
    await expect(card(page, inFukushima.name)).toBeVisible()
    await expect(card(page, inYamagata.name)).toHaveCount(0)

    // 一覧のカードから詳細へ移動できる
    await card(page, inFukushima.name).click()
    await expect(page.getByTestId('spot-name')).toHaveText(inFukushima.name)
  })

  test('該当する投稿がないエリアでは、空の表示になる', async ({ page }) => {
    await page.goto('/')
    // 他のテストが使わない、このテスト専用のエリア
    await page.getByTestId('area-filter').selectOption('高知県')
    await expect(page.getByTestId('list-empty')).toBeVisible()
  })

  test('詳細に、同じエリアの他の投稿が「近くのスポット」として出る(自分自身は出ない)', async ({ page, request }) => {
    const user = await registerUser(request, 'nearby')
    // 他のテストと混ざらないよう、このテスト専用のエリアを使う
    const first = await createSpot(request, user, { name: uniqueName('近所A'), areas: ['佐賀県'] })
    const second = await createSpot(request, user, { name: uniqueName('近所B'), areas: ['佐賀県'] })

    await page.goto(`/spots/${second.id}`)
    const nearby = page.getByTestId('nearby')
    await expect(nearby.getByTestId('spot-card').filter({ hasText: first.name })).toBeVisible()
    await expect(nearby.getByTestId('spot-card').filter({ hasText: second.name })).toHaveCount(0)
  })
})

test.describe('公開範囲と権限', () => {
  test('他人の非公開の投稿は、一覧にも詳細にも出ない。本人には見える', async ({ page, browser, request }) => {
    const owner = await registerUser(request, 'owner')
    const other = await registerUser(request, 'other')
    const secret = await createSpot(request, owner, {
      name: uniqueName('秘密の宿'),
      areas: ['長崎県'],
      visibility: 'private',
    })
    const open = await createSpot(request, owner, { name: uniqueName('公開の宿'), areas: ['長崎県'] })

    // 他のユーザー(ログイン済み): 一覧に公開だけ、詳細は「見つかりません」
    await signIn(page, other)
    await page.goto('/')
    await page.getByTestId('area-filter').selectOption('長崎県')
    await expect(card(page, open.name)).toBeVisible()
    await expect(card(page, secret.name)).toHaveCount(0)
    await page.goto(`/spots/${secret.id}`)
    await expect(page.getByTestId('not-found')).toBeVisible()

    // 未ログイン(別のブラウザ環境)でも同じ
    const anonymous = await browser.newContext()
    const anonPage = await anonymous.newPage()
    await anonPage.goto(`/spots/${secret.id}`)
    await expect(anonPage.getByTestId('not-found')).toBeVisible()
    await anonymous.close()

    // 本人には見える
    const ownerContext = await browser.newContext()
    const ownerPage = await ownerContext.newPage()
    await signIn(ownerPage, owner)
    await ownerPage.goto(`/spots/${secret.id}`)
    await expect(ownerPage.getByTestId('spot-name')).toHaveText(secret.name)
    await ownerContext.close()
  })

  test('他人の公開投稿には、編集・削除が出ない。編集画面も開けない', async ({ page, request }) => {
    const owner = await registerUser(request, 'owner')
    const other = await registerUser(request, 'other')
    const spot = await createSpot(request, owner)

    await signIn(page, other)
    await page.goto(`/spots/${spot.id}`)
    await expect(page.getByTestId('spot-name')).toHaveText(spot.name)
    await expect(page.getByTestId('edit')).toHaveCount(0)
    await expect(page.getByTestId('delete')).toHaveCount(0)

    await page.goto(`/spots/${spot.id}/edit`)
    await expect(page.getByTestId('edit-unavailable')).toContainText('投稿者だけ')
  })
})
