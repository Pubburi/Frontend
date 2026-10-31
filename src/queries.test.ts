import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiClientError } from './services/api'
import { createQueryClient, readSession, safeRedirect } from './queries'

vi.mock('./services/api', async (original) => {
  const module = await original<typeof import('./services/api')>()
  return { ...module, api: { ...module.api, me: vi.fn() } }
})
describe('React session and routing boundary', () => {
  beforeEach(() => vi.clearAllMocks())
  it('treats only a 401 as an unauthenticated session', async () => {
    vi.mocked(api.me).mockRejectedValueOnce(
      new ApiClientError({ code: 'UNAUTHORIZED' }, 401),
    )
    await expect(readSession()).resolves.toBeNull()
    const unavailable = new ApiClientError({ code: 'SERVICE_UNAVAILABLE' }, 503)
    vi.mocked(api.me).mockRejectedValueOnce(unavailable)
    await expect(readSession()).rejects.toBe(unavailable)
  })
  it('restores the same session request for multiple route/header observers', async () => {
    const client = createQueryClient()
    let release: (value: unknown) => void = () => {}
    vi.mocked(api.me).mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    const options = {
      queryKey: ['session'],
      queryFn: readSession,
      staleTime: Infinity,
    }
    const header = client.fetchQuery(options)
    const guard = client.fetchQuery(options)
    release({ id: 'member', name: '회원', role: 'USER' })
    expect(await header).toEqual(await guard)
    expect(api.me).toHaveBeenCalledTimes(1)
    client.clear()
  })
  it('permits internal return paths and rejects protocol-relative or backslash paths', () => {
    expect(safeRedirect('/products?q=탁주')).toBe('/products?q=탁주')
    for (const path of [
      null,
      'https://example.com',
      '//example.com',
      '/\\example.com',
    ])
      expect(safeRedirect(path)).toBe('/profile')
  })
})
