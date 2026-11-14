import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ApiError, request, type RequestOptions } from '~/utils/api'

export interface AuthUser {
  id: number
  name: string
  email: string
}

interface AuthResponse {
  accessToken: string
  user: AuthUser
}

// アクセストークンはメモリ上にだけ保持する(localStorage には保存しない)。
// リロード後は HttpOnly Cookie のリフレッシュトークンで復元する。
export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const accessToken = ref<string | null>(null)
  const isLoggedIn = computed(() => user.value !== null)

  function setSession(res: AuthResponse) {
    user.value = res.user
    accessToken.value = res.accessToken
  }

  function clearSession() {
    user.value = null
    accessToken.value = null
  }

  async function register(name: string, email: string, password: string) {
    setSession(await request<AuthResponse>('/api/auth/register', { json: { name, email, password } }))
  }

  async function login(email: string, password: string) {
    setSession(await request<AuthResponse>('/api/auth/login', { json: { email, password } }))
  }

  async function logout() {
    try {
      await request<undefined>('/api/auth/logout', { method: 'POST' })
    } finally {
      clearSession()
    }
  }

  // 同時に複数のリクエストが 401 になっても、リフレッシュは 1 回だけ行う
  // (リフレッシュトークンは使い捨てなので、並行して送ると再利用と判定されて全端末が失効する)
  let inflight: Promise<boolean> | null = null

  function refresh(): Promise<boolean> {
    inflight ??= request<AuthResponse>('/api/auth/refresh', { method: 'POST' })
      .then((res) => {
        setSession(res)
        return true
      })
      .catch(() => {
        clearSession()
        return false
      })
      .finally(() => {
        inflight = null
      })
    return inflight
  }

  // アプリ起動時に呼ぶ。ログインしていなくてもエラーにはしない
  async function restore(): Promise<void> {
    await refresh()
  }

  // 認証が必要な API 用。期限切れ(401)ならリフレッシュして 1 回だけ再試行する
  async function authFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const send = () =>
      request<T>(path, {
        ...options,
        headers: { ...options.headers, ...(accessToken.value ? { Authorization: `Bearer ${accessToken.value}` } : {}) },
      })
    try {
      return await send()
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && user.value && (await refresh())) return send()
      throw e
    }
  }

  return { user, accessToken, isLoggedIn, register, login, logout, restore, authFetch }
})
