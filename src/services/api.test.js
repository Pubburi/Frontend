import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, api, pageQuery } from './api'

afterEach(() => {
  vi.restoreAllMocks()
})

function mockResponse(body, ok = true, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

function mockTextResponse(body, ok, status, statusText) {
  global.fetch = vi.fn().mockResolvedValue({ ok, status, statusText, text: () => Promise.resolve(body) })
}

describe('api client', () => {
  it('unwraps successful ApiResponse data', async () => {
    mockResponse({ data: { id: 'id01' }, message: 'ok', error: null })

    await expect(api.me()).resolves.toEqual({ id: 'id01' })
  })

  it('throws structured ApiClientError on wrapped errors', async () => {
    mockResponse(
      {
        data: null,
        message: null,
        error: { code: 'VALIDATION_FAILED', message: 'Invalid request', fields: { id: 'required' } },
      },
      false,
      400,
    )

    await expect(api.me()).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 400,
      code: 'VALIDATION_FAILED',
      fields: { id: 'required' },
    })
  })

  it('builds compact page query strings', () => {
    expect(pageQuery({ page: 2, size: 12, q: '', type: '탁주' })).toBe('page=2&size=12&type=%ED%83%81%EC%A3%BC')
  })

  it('normalizes non-json server failures into a friendly error', async () => {
    mockTextResponse('Internal Server Error', false, 500, 'Internal Server Error')

    await expect(api.me()).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 500,
      message: '서버에 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    })
  })

  it('normalizes network failures', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))

    await expect(api.me()).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
      message: '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    })
  })
})
