import { useAuthStore } from '~/stores/auth'

// 住所の取得(逆ジオコーディング)。バックエンドが、Amazon Location Service を呼ぶ(ログイン必須)
export function useGeocodeApi() {
  const { authFetch } = useAuthStore()
  return {
    // 見つからなければ null。外部のサービスが失敗したときは、ApiError(502)
    reverse: async (lat: number, lng: number) => {
      const res = await authFetch<{ address: string | null }>(`/api/geocode/reverse?lat=${lat}&lng=${lng}`)
      return res.address
    },
  }
}
