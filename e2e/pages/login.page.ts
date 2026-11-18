import { expect, type Page } from '@playwright/test'

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto(redirect?: string) {
    await this.page.goto(redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login')
  }

  async switchToRegister() {
    await this.page.getByRole('button', { name: '新規登録' }).click()
  }

  async fill(values: { name?: string; email: string; password: string }) {
    if (values.name !== undefined) await this.page.getByTestId('name').fill(values.name)
    await this.page.getByTestId('email').fill(values.email)
    await this.page.getByTestId('password').fill(values.password)
  }

  async submit() {
    await this.page.getByTestId('submit').click()
  }

  async expectFormError(message: string | RegExp) {
    await expect(this.page.getByTestId('form-error')).toContainText(message)
  }
}
