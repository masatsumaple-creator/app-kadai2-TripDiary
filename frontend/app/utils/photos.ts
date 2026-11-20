// 写真の決まりと、アップロードの手順(docs/20_設計書.md の「写真(アップロード)」)。
// ブラウザの機能に依存しない部分は、ここに置いてテストする(画像の縮小そのものは utils/image.ts)

import type { RequestOptions } from './api'

export interface SpotPhoto {
  id: number
  url: string
}

// 1 枚の上限(バイト)・1 投稿の上限・縮小後の長辺(px)・受け付ける形式(バックエンドと同じ値)
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024
export const PHOTO_MAX_COUNT = 20
export const PHOTO_MAX_EDGE = 1600
export const PHOTO_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

// 縮小後の大きさ。長辺が上限以下ならそのまま、超えるなら縦横比を保って、長辺を上限にする
export function planResize(width: number, height: number, maxEdge = PHOTO_MAX_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

// 選んだファイルを受け付けられるか。受け付けられないときは、利用者に見せるメッセージを返す
export function checkPhotoFile(file: { name: string; type: string }, currentCount: number): string | null {
  if (!(PHOTO_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return `${file.name}: JPEG・PNG・WebP の画像を選んでください。`
  }
  if (currentCount >= PHOTO_MAX_COUNT) {
    return `写真は最大 ${PHOTO_MAX_COUNT} 枚までです(${file.name} は追加しませんでした)。`
  }
  return null
}

interface UploadStart {
  photoId: number
  uploadUrl: string
  headers: Record<string, string>
}

export interface UploadDeps {
  // 自分の API(ログインのトークンつき)
  authFetch: <T>(path: string, options?: RequestOptions) => Promise<T>
  // S3 への PUT 用。**自分の API のトークンは付けない**(S3 は別のサーバーのため)
  fetchImpl: typeof fetch
}

export class PhotoUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PhotoUploadError'
  }
}

// 1 枚をアップロードする: ① URL の発行 → ② S3 へ直接 PUT → ③ 完了の確認(ここから表示される)
export async function uploadPhoto(deps: UploadDeps, spotId: number, blob: Blob): Promise<SpotPhoto> {
  const start = await deps.authFetch<UploadStart>(`/api/spots/${spotId}/photos`, {
    method: 'POST',
    json: { contentType: blob.type, size: blob.size },
  })

  let put: Response
  try {
    put = await deps.fetchImpl(start.uploadUrl, { method: 'PUT', headers: start.headers, body: blob })
  } catch {
    throw new PhotoUploadError('写真を送信できませんでした。通信を確認して、もう一度お試しください。')
  }
  if (!put.ok) throw new PhotoUploadError('写真を保存できませんでした。もう一度お試しください。')

  return deps.authFetch<SpotPhoto>(`/api/spots/${spotId}/photos/${start.photoId}/complete`, { method: 'POST' })
}

export function removePhoto(deps: Pick<UploadDeps, 'authFetch'>, spotId: number, photoId: number): Promise<undefined> {
  return deps.authFetch<undefined>(`/api/spots/${spotId}/photos/${photoId}`, { method: 'DELETE' })
}
