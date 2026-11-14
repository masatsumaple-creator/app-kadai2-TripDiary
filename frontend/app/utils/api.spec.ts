import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from './api'

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('request', () => {
  it('json を指定すると POST で JSON を送る', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(request('/api/x', { json: { a: 1 } })).resolves.toEqual({ ok: true })
    const [, init] = fetchMock.mock.calls[0]!
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"a":1}')
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('204 は undefined を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(request('/api/x', { method: 'POST' })).resolves.toBeUndefined()
  })

  it('エラー応答を ApiError に変換する(fieldErrors を含む)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(400, { code: 'VALIDATION_ERROR', message: '入力内容に誤りがあります。', fieldErrors: { email: ['形式が不正'] } }),
      ),
    )
    const error = await request('/api/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', fieldErrors: { email: ['形式が不正'] } })
  })

  it('JSON でないエラー応答でも ApiError になる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 })))
    await expect(request('/api/x')).rejects.toMatchObject({ status: 502, code: 'UNKNOWN_ERROR' })
  })

  it('通信できないときは NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')))
    await expect(request('/api/x')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' })
  })
})
