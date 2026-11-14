import { fetchHealth } from './health'

describe('fetchHealth', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the body when the API responds 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', db: 'up' }) }),
    )
    await expect(fetchHealth()).resolves.toEqual({ status: 'ok', db: 'up' })
    expect(fetch).toHaveBeenCalledWith('/api/health')
  })

  it('throws when the API responds with an error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    await expect(fetchHealth()).rejects.toThrow('503')
  })
})
