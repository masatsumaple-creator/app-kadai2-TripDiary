import { expect, test } from '@playwright/test'
import { PASSWORD, registerUser, signIn } from '../fixtures/api'
import { E2E_EMAIL_PREFIX } from '../support/env'
import { LoginPage } from '../pages/login.page'

const newEmail = () => `${E2E_EMAIL_PREFIX}ui_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@example.com`

test.describe('認証', () => {
  test('未ログインでログインが必要な画面を開くと、ログイン画面へ移動する', async ({ page }) => {
    await page.goto('/spots/new')
    await expect(page).toHaveURL(/\/login\?redirect=%2Fspots%2Fnew$|\/login\?redirect=\/spots\/new$/)
    await expect(page.getByTestId('submit')).toBeVisible()
  })

  test('新規登録すると、元の画面に戻り、ヘッダーにユーザー名が出る', async ({ page }) => {
    const login = new LoginPage(page)
    const name = `登録テスト${Date.now().toString(36)}`
    await login.goto('/spots/new')
    await login.switchToRegister()
    await login.fill({ name, email: newEmail(), password: PASSWORD })
    await login.submit()

    // ログイン画面の URL(/login?redirect=/spots/new)にも「/spots/new」が含まれるため、パス名で厳密に判定する
    await expect(page).toHaveURL((url) => url.pathname === '/spots/new')
    await expect(page.getByRole('heading', { name: 'スポットを投稿' })).toBeVisible()
    await expect(page.getByTestId('user-name')).toHaveText(name)
  })

  test('入力が不正なら、項目ごとのエラーが出て、登録されない', async ({ page }) => {
    const login = new LoginPage(page)
    await login.goto()
    await login.switchToRegister()
    await login.fill({ name: '', email: newEmail(), password: 'short' })
    await login.submit()

    await expect(page.getByText('表示名は 1〜50 文字で入力してください。')).toBeVisible()
    await expect(page.getByText('パスワードは 8 文字以上で入力してください。')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('登録済みのメールアドレスでは登録できない', async ({ page, request }) => {
    const existing = await registerUser(request, 'dup')
    const login = new LoginPage(page)
    await login.goto()
    await login.switchToRegister()
    await login.fill({ name: '重複', email: existing.email, password: PASSWORD })
    await login.submit()

    await login.expectFormError('既に登録されています')
    await expect(page).toHaveURL(/\/login/)
  })

  test('ログインできる。誤ったパスワードではエラーになる', async ({ page, request }) => {
    const user = await registerUser(request, 'login')
    const login = new LoginPage(page)

    await login.goto()
    await login.fill({ email: user.email, password: 'wrong-password' })
    await login.submit()
    await login.expectFormError('メールアドレスまたはパスワードが正しくありません。')
    await expect(page.getByTestId('user-name')).toHaveCount(0)

    await login.fill({ email: user.email, password: user.password })
    await login.submit()
    await expect(page).toHaveURL('/')
    await expect(page.getByTestId('user-name')).toHaveText(user.name)
  })

  test('ログイン後にリロードしても、ログイン状態が復元される', async ({ page, request }) => {
    const user = await registerUser(request, 'reload')
    await signIn(page, user)

    await page.goto('/')
    await expect(page.getByTestId('user-name')).toHaveText(user.name)
    await page.reload()
    await expect(page.getByTestId('user-name')).toHaveText(user.name)
  })

  test('ログアウトすると、リロードしても未ログインのまま。保護された画面にも入れない', async ({ page, request }) => {
    const user = await registerUser(request, 'logout')
    await signIn(page, user)
    await page.goto('/')
    await expect(page.getByTestId('user-name')).toBeVisible()

    await page.getByTestId('logout').click()
    await expect(page.getByTestId('user-name')).toHaveCount(0)

    await page.reload()
    await expect(page.getByTestId('user-name')).toHaveCount(0)
    await page.goto('/spots/new')
    await expect(page).toHaveURL(/\/login/)
  })

  test('ログイン済みでログイン画面を開くと、ログイン画面は出ずに移動する', async ({ page, request }) => {
    const user = await registerUser(request, 'already')
    await signIn(page, user)
    await page.goto('/login')
    await expect(page).toHaveURL('/')
  })
})
