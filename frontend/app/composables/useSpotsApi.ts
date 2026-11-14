import { useAuthStore } from '~/stores/auth'
import {
  buildListQuery,
  type ListParams,
  type Spot,
  type SpotInput,
  type SpotListResponse,
} from '~/utils/spots'

// スポット API の呼び出し。ログインしていればトークンを付け、期限切れなら自動でリフレッシュする
export function useSpotsApi() {
  const { authFetch } = useAuthStore()
  return {
    list: (params: ListParams = {}) =>
      authFetch<SpotListResponse>(`/api/spots${buildListQuery(params)}`),
    get: (id: number) => authFetch<Spot>(`/api/spots/${id}`),
    create: (input: SpotInput) =>
      authFetch<Spot>('/api/spots', { method: 'POST', json: input }),
    update: (id: number, input: SpotInput) =>
      authFetch<Spot>(`/api/spots/${id}`, { method: 'PUT', json: input }),
    remove: (id: number) =>
      authFetch<undefined>(`/api/spots/${id}`, { method: 'DELETE' }),
  }
}
