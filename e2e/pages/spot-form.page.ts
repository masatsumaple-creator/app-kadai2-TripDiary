import type { Page } from '@playwright/test'
import type { Visibility } from '../fixtures/api'

const visibilityTestId: Record<Visibility, string> = {
  public: 'visibility-public',
  followers: 'visibility-followers',
  private: 'visibility-private',
}

export class SpotFormPage {
  constructor(private readonly page: Page) {}

  async goto(path = '/spots/new') {
    await this.page.goto(path)
  }

  async fill(values: { name?: string; review?: string; address?: string; areas?: string[]; visibility?: Visibility }) {
    if (values.name !== undefined) await this.page.getByTestId('name').fill(values.name)
    if (values.review !== undefined) await this.page.getByTestId('review').fill(values.review)
    if (values.address !== undefined) await this.page.getByTestId('address').fill(values.address)
    for (const area of values.areas ?? []) await this.page.getByTestId('area-select').selectOption(area)
    if (values.visibility) await this.page.getByTestId(visibilityTestId[values.visibility]).check()
  }

  async save() {
    await this.page.getByTestId('save').click()
  }
}
