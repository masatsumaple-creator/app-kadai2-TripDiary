import type { APIRequestContext, Page } from '@playwright/test'
import { E2E_EMAIL_PREFIX } from '../support/env'

export type Visibility = 'public' | 'followers' | 'private'

export interface TestUser {
  id: number
  name: string
  email: string
  password: string
  accessToken: string
}

export interface SpotInput {
  name: string
  review?: string | null
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  areas: string[]
  visibility: Visibility
}

export interface CreatedSpot extends SpotInput {
  id: number
}

const random = () => Math.random().toString(36).slice(2, 8)

// テストごとに一意の名前を作る。並列に実行しても、他のテストのデータと混ざらない
export const uniqueName = (label: string) => `${label}-${Date.now().toString(36)}${random()}`

export const PASSWORD = 'password-1234'

// API でユーザーを作る(画面を通さないので速く、テストの前提を用意するのに使う)
export async function registerUser(request: APIRequestContext, label = 'user'): Promise<TestUser> {
  const id = `${Date.now().toString(36)}${random()}`
  const email = `${E2E_EMAIL_PREFIX}${label}_${id}@example.com`
  const name = `${label}-${id}`
  const res = await request.post('/api/auth/register', { data: { name, email, password: PASSWORD } })
  if (res.status() !== 201) throw new Error(`ユーザー登録に失敗しました: ${res.status()} ${await res.text()}`)
  const body = (await res.json()) as { accessToken: string; user: { id: number } }
  return { id: body.user.id, name, email, password: PASSWORD, accessToken: body.accessToken }
}

export async function createSpot(
  request: APIRequestContext,
  user: TestUser,
  overrides: Partial<SpotInput> = {},
): Promise<CreatedSpot> {
  const input: SpotInput = {
    name: uniqueName('spot'),
    review: 'E2E で作った投稿です。',
    areas: ['京都府'],
    visibility: 'public',
    ...overrides,
  }
  const res = await request.post('/api/spots', {
    data: input,
    headers: { Authorization: `Bearer ${user.accessToken}` },
  })
  if (res.status() !== 201) throw new Error(`投稿の作成に失敗しました: ${res.status()} ${await res.text()}`)
  const body = (await res.json()) as { id: number }
  return { ...input, id: body.id }
}

// ブラウザをログイン済みにする。ログイン API の Set-Cookie(リフレッシュトークン)が、
// ページと同じ Cookie 領域に入り、次に開いたときにセッションが復元される
export async function signIn(page: Page, user: TestUser): Promise<void> {
  const res = await page.request.post('/api/auth/login', { data: { email: user.email, password: user.password } })
  if (res.status() !== 200) throw new Error(`ログインに失敗しました: ${res.status()}`)
}
