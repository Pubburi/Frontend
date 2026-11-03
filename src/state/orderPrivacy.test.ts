import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { ApiClientError } from '../services/api'
import { orderPrivacy } from './orderPrivacy'

describe('order detail unauthorized ownership', () => {
  it('binds401 to the actual account and mounted detail query;manual cache data is not fresh authority', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['session'], { id: 'member', role: 'USER' })
    const privacy = orderPrivacy(client), key = ['account', 'member', 'order-detail', 901, 1]
    await expect(client.fetchQuery({ queryKey: key, queryFn: () => { throw new ApiClientError({ code: 'UNAUTHORIZED' }, 401) } })).rejects.toMatchObject({ status: 401 })
    const failure = privacy.snapshot()[0]
    expect(failure.query).toBe(client.getQueryCache().find({ queryKey: key, exact: true }))
    client.setQueryData(key, { order: { oId: 901 } })
    expect(privacy.snapshot()).toContain(failure)
    await client.fetchQuery({ queryKey: key, queryFn: async () => ({ order: { oId: 901 } }), staleTime: 0 })
    expect(privacy.snapshot()).toEqual([])
    client.clear()
  })
  it('does not turn another account or public404 into the current order authorization failure', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['session'], { id: 'member', role: 'USER' })
    const privacy = orderPrivacy(client)
    for (const [key, status] of [[['account', 'other', 'order-detail', 901, 1], 401], [['catalog', 'market', 1], 401], [['account', 'member', 'order-detail', 901, 1], 404]] as const)
      await expect(client.fetchQuery({ queryKey: key, queryFn: () => { throw new ApiClientError({ code: 'REQUEST_FAILED' }, status) } })).rejects.toBeTruthy()
    expect(privacy.snapshot()).toEqual([])
    client.clear()
  })
})
