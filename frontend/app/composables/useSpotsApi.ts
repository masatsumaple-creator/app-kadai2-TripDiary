import { useAuthStore } from '~/stores/auth'
import { boundsToQuery, type Bounds } from '~/utils/map'
import {
  buildListQuery,
  type ListParams,
  type LikeState,
  type Spot,
  type SpotInput,
  type MapSpotsResponse,
  type SpotListResponse,
} from '~/utils/spots'

// スポット API の呼び出し。ログインしていればトークンを付け、期限切れなら自動でリフレッシュする
export function useSpotsApi() {
  const { authFetch } = useAuthStore()
  return {
    list: (params: ListParams = {}) =>
      authFetch<SpotListResponse>(`/api/spots${buildListQuery(params)}`),
    // 地図の表示範囲の中の投稿(位置のあるもの。最大 100 件)
    inBounds: (bounds: Bounds, area?: string) =>
      authFetch<MapSpotsResponse>(`/api/spots/map${boundsToQuery(bounds, area)}`),
    get: (id: number) => authFetch<Spot>(`/api/spots/${id}`),
    create: (input: SpotInput) =>
      authFetch<Spot>('/api/spots', { method: 'POST', json: input }),
    update: (id: number, input: SpotInput) =>
      authFetch<Spot>(`/api/spots/${id}`, { method: 'PUT', json: input }),
    remove: (id: number) =>
      authFetch<undefined>(`/api/spots/${id}`, { method: 'DELETE' }),
    like: (id: number) =>
      authFetch<LikeState>(`/api/spots/${id}/like`, { method: 'POST' }),
    unlike: (id: number) =>
      authFetch<LikeState>(`/api/spots/${id}/like`, { method: 'DELETE' }),
  }
}
