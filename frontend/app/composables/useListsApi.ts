import { useAuthStore } from '~/stores/auth'
import type { ListEntryState, ListStatus, MyListResponse } from '~/utils/lists'

// マイリスト API の呼び出し。ログインしていればトークンを付け、期限切れなら自動でリフレッシュする
export function useListsApi() {
  const { authFetch } = useAuthStore()
  return {
    // リストに入れる / 状態を変える
    set: (spotId: number, status: ListStatus) =>
      authFetch<ListEntryState>(`/api/spots/${spotId}/list`, { method: 'PUT', json: { status } }),
    remove: (spotId: number) => authFetch<ListEntryState>(`/api/spots/${spotId}/list`, { method: 'DELETE' }),
    // 自分のマイリスト(リストに入れた新しい順)。cursor は前のページの nextCursor
    list: (status: ListStatus, cursor?: number | null) =>
      authFetch<MyListResponse>(`/api/me/list?status=${status}${cursor ? `&cursor=${cursor}` : ''}`),
  }
}
