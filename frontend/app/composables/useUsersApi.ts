import { useAuthStore } from '~/stores/auth'
import type { FollowState, UserProfile } from '~/utils/users'

// プロフィール・フォロー API の呼び出し。ログインしていればトークンを付け、期限切れなら自動でリフレッシュする
export function useUsersApi() {
  const { authFetch } = useAuthStore()
  return {
    getProfile: (id: number) => authFetch<UserProfile>(`/api/users/${id}`),
    follow: (id: number) => authFetch<FollowState>(`/api/users/${id}/follow`, { method: 'POST' }),
    unfollow: (id: number) => authFetch<FollowState>(`/api/users/${id}/follow`, { method: 'DELETE' }),
  }
}
