import { useAuthStore } from '~/stores/auth'
import type { Comment, CommentListResponse } from '~/utils/comments'

// コメント API の呼び出し。ログインしていればトークンを付け、期限切れなら自動でリフレッシュする
export function useCommentsApi() {
  const { authFetch } = useAuthStore()
  return {
    // 古い順。cursor は前のページの最後の ID
    list: (spotId: number, cursor?: number | null) =>
      authFetch<CommentListResponse>(`/api/spots/${spotId}/comments${cursor ? `?cursor=${cursor}` : ''}`),
    create: (spotId: number, body: string) =>
      authFetch<Comment>(`/api/spots/${spotId}/comments`, { method: 'POST', json: { body } }),
    remove: (spotId: number, commentId: number) =>
      authFetch<undefined>(`/api/spots/${spotId}/comments/${commentId}`, { method: 'DELETE' }),
  }
}
