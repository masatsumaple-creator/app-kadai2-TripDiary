import { useAuthStore } from '~/stores/auth'
import { removePhoto, uploadPhoto } from '~/utils/photos'

// 写真 API の呼び出し。画像は、S3 の署名付き URL へ、ブラウザから直接 PUT する
export function usePhotosApi() {
  const { authFetch } = useAuthStore()
  const deps = { authFetch, fetchImpl: (...args: Parameters<typeof fetch>) => fetch(...args) }
  return {
    upload: (spotId: number, blob: Blob) => uploadPhoto(deps, spotId, blob),
    remove: (spotId: number, photoId: number) => removePhoto(deps, spotId, photoId),
  }
}
