import { describe, expect, it, vi } from 'vitest'
import {
  checkPhotoFile,
  PHOTO_MAX_COUNT,
  PhotoUploadError,
  planResize,
  removePhoto,
  uploadPhoto,
  type UploadDeps,
} from './photos'

describe('planResize', () => {
  it('長辺が上限以下なら、そのまま', () => {
    expect(planResize(800, 600)).toEqual({ width: 800, height: 600 })
    expect(planResize(1600, 1200)).toEqual({ width: 1600, height: 1200 })
  })

  it('長辺が上限を超えるなら、縦横比を保って、長辺を 1600 にする', () => {
    expect(planResize(3200, 2400)).toEqual({ width: 1600, height: 1200 })
    expect(planResize(2400, 3200)).toEqual({ width: 1200, height: 1600 })
    expect(planResize(4000, 3000)).toEqual({ width: 1600, height: 1200 })
  })

  it('極端に細長くても、短辺は 1px 以上', () => {
    expect(planResize(32000, 10)).toEqual({ width: 1600, height: 1 })
  })

  it('上限を指定できる', () => {
    expect(planResize(1000, 500, 500)).toEqual({ width: 500, height: 250 })
  })
})

describe('checkPhotoFile', () => {
  const file = (type: string) => ({ name: 'a.bin', type })

  it('JPEG・PNG・WebP を受け付ける', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(checkPhotoFile(file(type), 0)).toBeNull()
    }
  })

  it('ほかの形式は、ファイル名つきのメッセージで断る', () => {
    for (const type of ['image/gif', 'image/svg+xml', 'application/pdf', 'text/plain', '']) {
      expect(checkPhotoFile(file(type), 0)).toContain('a.bin')
    }
  })

  it('20 枚まで。21 枚目は断る', () => {
    expect(checkPhotoFile(file('image/png'), PHOTO_MAX_COUNT - 1)).toBeNull()
    expect(checkPhotoFile(file('image/png'), PHOTO_MAX_COUNT)).toContain('20')
  })
})

describe('uploadPhoto(URL の発行 → S3 へ PUT → 完了の確認)', () => {
  const blob = new Blob(['jpeg-bytes'], { type: 'image/jpeg' })
  const start = { photoId: 7, uploadUrl: 'https://s3.example/put?sig=1', headers: { 'Content-Type': 'image/jpeg' } }

  const deps = (put: () => Promise<Response>) => {
    const authFetch = vi.fn((path: string) =>
      Promise.resolve(path.endsWith('/complete') ? { id: 7, url: 'https://s3.example/get' } : start),
    )
    const fetchImpl = vi.fn(put)
    return { authFetch, fetchImpl, deps: { authFetch, fetchImpl } as unknown as UploadDeps }
  }

  it('順に呼び、S3 への PUT には、発行されたヘッダーだけを付ける(自分の API のトークンは付けない)', async () => {
    const d = deps(() => Promise.resolve(new Response(null, { status: 200 })))
    const photo = await uploadPhoto(d.deps, 12, blob)

    expect(photo).toEqual({ id: 7, url: 'https://s3.example/get' })
    expect(d.authFetch.mock.calls[0]).toEqual([
      '/api/spots/12/photos',
      { method: 'POST', json: { contentType: 'image/jpeg', size: blob.size } },
    ])
    expect(d.fetchImpl).toHaveBeenCalledWith(start.uploadUrl, { method: 'PUT', headers: start.headers, body: blob })
    expect(d.authFetch.mock.calls[1]).toEqual(['/api/spots/12/photos/7/complete', { method: 'POST' }])
  })

  it('S3 への PUT が失敗したら、完了を呼ばずに、利用者向けのエラーにする', async () => {
    const d = deps(() => Promise.resolve(new Response(null, { status: 403 })))
    await expect(uploadPhoto(d.deps, 12, blob)).rejects.toBeInstanceOf(PhotoUploadError)
    expect(d.authFetch).toHaveBeenCalledTimes(1)
  })

  it('通信できなかったときも、完了を呼ばずに、利用者向けのエラーにする', async () => {
    const d = deps(() => Promise.reject(new TypeError('Failed to fetch')))
    await expect(uploadPhoto(d.deps, 12, blob)).rejects.toThrow('通信を確認')
    expect(d.authFetch).toHaveBeenCalledTimes(1)
  })

  it('URL の発行に失敗したら(上限・権限など)、そのエラーをそのまま返す', async () => {
    const authFetch = vi.fn(() => Promise.reject(new Error('limit')))
    const fetchImpl = vi.fn()
    await expect(uploadPhoto({ authFetch, fetchImpl } as unknown as UploadDeps, 1, blob)).rejects.toThrow('limit')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('removePhoto', () => {
  it('DELETE を呼ぶ', async () => {
    const authFetch = vi.fn(() => Promise.resolve(undefined))
    await removePhoto({ authFetch } as unknown as Pick<UploadDeps, 'authFetch'>, 3, 9)
    expect(authFetch).toHaveBeenCalledWith('/api/spots/3/photos/9', { method: 'DELETE' })
  })
})
