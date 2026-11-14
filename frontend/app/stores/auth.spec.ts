import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from './auth'

const user = { id: 1, name: 'テスト', email: 'a@example.com' }
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const authOk = (token: string) => json(200, { accessToken: token, user })
const unauthorized = () => json(401, { code: 'UNAUTHORIZED', message: 'ログインが必要です。' })

let fetchMock: ReturnType<typeof vi.fn>
const urls = () => fetchMock.mock.calls.map((c) => c[0] as string)

beforeEach(() => {
  setActivePinia(createPinia())
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('auth store', () => {
  it('ログインするとユーザーとトークンを保持する', async () => {
    fetchMock.mockResolvedValueOnce(authOk('t1'))
    const auth = useAuthStore()
    await auth.login('a@example.com', 'password-1234')
    expect(auth.isLoggedIn).toBe(true)
    expect(auth.user).toEqual(user)
    expect(auth.accessToken).toBe('t1')
  })

  it('ログインに失敗したら未ログインのまま', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { code: 'INVALID_CREDENTIALS', message: '違います' }))
    const auth = useAuthStore()
    await expect(auth.login('a@example.com', 'x')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    expect(auth.isLoggedIn).toBe(false)
  })

  it('ログアウトするとサーバーへ通知し、状態を消す', async () => {
    fetchMock.mockResolvedValueOnce(authOk('t1')).mockResolvedValueOnce(new Response(null, { status: 204 }))
    const auth = useAuthStore()
    await auth.login('a@example.com', 'password-1234')
    await auth.logout()
    expect(urls()).toContain('/api/auth/logout')
    expect(auth.user).toBeNull()
    expect(auth.accessToken).toBeNull()
  })

  it('ログアウト通信に失敗しても、画面側の状態は消す', async () => {
    fetchMock.mockResolvedValueOnce(authOk('t1')).mockRejectedValueOnce(new TypeError('offline'))
    const auth = useAuthStore()
    await auth.login('a@example.com', 'password-1234')
    await expect(auth.logout()).rejects.toBeDefined()
    expect(auth.isLoggedIn).toBe(false)
  })

  describe('restore', () => {
    it('リフレッシュトークンが有効ならログイン状態を復元する', async () => {
      fetchMock.mockResolvedValueOnce(authOk('t2'))
      const auth = useAuthStore()
      await auth.restore()
      expect(auth.isLoggedIn).toBe(true)
      expect(auth.accessToken).toBe('t2')
    })

    it('無効でもエラーにせず、未ログインのままにする', async () => {
      fetchMock.mockResolvedValueOnce(json(401, { code: 'INVALID_REFRESH_TOKEN', message: 'x' }))
      const auth = useAuthStore()
      await expect(auth.restore()).resolves.toBeUndefined()
      expect(auth.isLoggedIn).toBe(false)
    })
  })

  describe('authFetch', () => {
    it('アクセストークンを Authorization ヘッダーに付ける', async () => {
      fetchMock.mockResolvedValueOnce(authOk('t1')).mockResolvedValueOnce(json(200, { ok: 1 }))
      const auth = useAuthStore()
      await auth.login('a@example.com', 'password-1234')
      await auth.authFetch('/api/auth/me')
      expect(fetchMock.mock.calls[1]![1].headers.Authorization).toBe('Bearer t1')
    })

    it('401 ならリフレッシュして 1 回だけ再試行する', async () => {
      fetchMock
        .mockResolvedValueOnce(authOk('old'))
        .mockResolvedValueOnce(unauthorized())
        .mockResolvedValueOnce(authOk('new'))
        .mockResolvedValueOnce(json(200, { ok: 1 }))
      const auth = useAuthStore()
      await auth.login('a@example.com', 'password-1234')
      await expect(auth.authFetch('/api/data')).resolves.toEqual({ ok: 1 })
      expect(urls()).toEqual(['/api/auth/login', '/api/data', '/api/auth/refresh', '/api/data'])
      expect(fetchMock.mock.calls[3]![1].headers.Authorization).toBe('Bearer new')
    })

    it('リフレッシュも失敗したらログアウト状態にして 401 を返す', async () => {
      fetchMock
        .mockResolvedValueOnce(authOk('old'))
        .mockResolvedValueOnce(unauthorized())
        .mockResolvedValueOnce(json(401, { code: 'INVALID_REFRESH_TOKEN', message: 'x' }))
      const auth = useAuthStore()
      await auth.login('a@example.com', 'password-1234')
      await expect(auth.authFetch('/api/data')).rejects.toMatchObject({ status: 401 })
      expect(auth.isLoggedIn).toBe(false)
    })

    it('同時に 401 になってもリフレッシュは 1 回だけ', async () => {
      let refreshCalls = 0
      fetchMock.mockImplementation((url: string, init: { headers?: Record<string, string> }) => {
        if (url === '/api/auth/login') return Promise.resolve(authOk('old'))
        if (url === '/api/auth/refresh') {
          refreshCalls++
          return Promise.resolve(authOk('new'))
        }
        return Promise.resolve(init.headers?.Authorization === 'Bearer new' ? json(200, { ok: 1 }) : unauthorized())
      })
      const auth = useAuthStore()
      await auth.login('a@example.com', 'password-1234')
      await Promise.all([auth.authFetch('/api/a'), auth.authFetch('/api/b'), auth.authFetch('/api/c')])
      expect(refreshCalls).toBe(1)
    })

    it('未ログインの 401 ではリフレッシュしない', async () => {
      fetchMock.mockResolvedValueOnce(unauthorized())
      const auth = useAuthStore()
      await expect(auth.authFetch('/api/data')).rejects.toMatchObject({ status: 401 })
      expect(urls()).toEqual(['/api/data'])
    })
  })
})
