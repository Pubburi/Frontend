import { afterEach, describe, expect, it } from 'vitest'
import { onlineManager } from '@tanstack/react-query'
import { createQueryClient } from '../queries'
import { ApiClientError } from '../services/api'
import { profilePrivacy } from './profilePrivacy'

const key = ['account', 'member', 'profile'] as const
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
afterEach(() => onlineManager.setOnline(true))

describe('본인 조회401 관측의 인증/query 수명', () => {
  it('cold error가 pending이 되어도 다른 개인 조회200은 관측을 해제하지 않고 해당 새 성공만 해제한다', async () => {
    const client = createQueryClient()
    client.setQueryData(['session'], { id: 'member' })
    const store = profilePrivacy(client)
    await expect(client.fetchQuery({ queryKey: key, queryFn: () => Promise.reject(new ApiClientError({}, 401)) })).rejects.toThrow()
    const owner = store.snapshot()[0]
    expect(owner.dataUpdates).toBe(0)
    client.setQueryData(['account', 'member', 'orders', 1], { items: [] })
    expect(store.snapshot()).toEqual([owner])
    const held = deferred<{ user: { id: string } }>()
    const pending = client.fetchQuery({ queryKey: key, queryFn: () => held.promise })
    expect(client.getQueryState(key)).toMatchObject({ status: 'pending', error: null, fetchStatus: 'fetching' })
    expect(store.snapshot()).toEqual([owner])
    held.resolve({ user: { id: 'member' } })
    await pending
    expect(store.snapshot()).toHaveLength(0)
    client.clear()
  })

  it('이미 있던dataUpdateCount와 뒤503은 인증 확인이 아니며 새 성공까지 관측을 유지한다', async () => {
    const client = createQueryClient()
    client.setQueryData(['session'], { id: 'member' })
    await client.fetchQuery({ queryKey: key, queryFn: async () => ({ user: { id: 'member' } }) })
    const store = profilePrivacy(client)
    for (const status of [401, 503]) {
      await expect(client.fetchQuery({ queryKey: key, queryFn: () => Promise.reject(new ApiClientError({}, status)) })).rejects.toThrow()
      expect(store.snapshot()).toHaveLength(1)
      expect(store.snapshot()[0].dataUpdates).toBe(1)
    }
    await client.fetchQuery({ queryKey: key, queryFn: async () => ({ user: { id: 'member' } }) })
    expect(store.snapshot()).toHaveLength(0)
    client.clear()
  })

  it('offline의 paused cold 재조회도 관측을 유지하고 online 성공 후 해제한다', async () => {
    const client = createQueryClient()
    client.mount()
    client.setQueryData(['session'], { id: 'member' })
    const store = profilePrivacy(client)
    try {
      await expect(client.fetchQuery({ queryKey: key, queryFn: () => Promise.reject(new ApiClientError({}, 401)) })).rejects.toThrow()
      onlineManager.setOnline(false)
      const pending = client.fetchQuery({ queryKey: key, queryFn: async () => ({ user: { id: 'member' } }) })
      expect(client.getQueryState(key)).toMatchObject({ status: 'pending', fetchStatus: 'paused' })
      expect(store.snapshot()).toHaveLength(1)
      onlineManager.setOnline(true)
      await pending
      expect(store.snapshot()).toHaveLength(0)
    } finally { client.unmount(); client.clear() }
  })

  it('같은query에 로컬로 쓴 새 캐시는 권위 성공이 아니며 실제 fetch 성공만 해제한다', async () => {
    const client = createQueryClient()
    client.setQueryData(['session'], { id: 'member' })
    const store = profilePrivacy(client)
    await expect(client.fetchQuery({ queryKey: key, queryFn: () => Promise.reject(new ApiClientError({}, 401)) })).rejects.toThrow()
    client.setQueryData(key, { user: { id: 'member' } })
    expect(client.getQueryState(key)).toMatchObject({ status: 'success', dataUpdateCount: 1 })
    expect(store.snapshot()).toHaveLength(1)
    await client.fetchQuery({ queryKey: key, queryFn: async () => ({ user: { id: 'member' } }) })
    expect(store.snapshot()).toHaveLength(0)
    client.clear()
  })

  for (const next of ['member', 'other']) {
    it(`새 ${next} 인증은 이전 미완료query의 늦은401 관측을 받지 않는다`, async () => {
      const client = createQueryClient()
      client.setQueryData(['session'], { id: 'member' })
      const store = profilePrivacy(client)
      const held = deferred<void>()
      let delivered = false
      const pending = client.fetchQuery({ queryKey: key, queryFn: async () => {
        await held.promise
        delivered = true
        throw new ApiClientError({}, 401)
      } })
      client.clear()
      client.setQueryData(['session'], { id: next })
      await expect(pending).rejects.toThrow()
      held.resolve(undefined)
      await expect.poll(() => delivered).toBe(true)
      expect(store.snapshot()).toHaveLength(0)
      client.clear()
    })
  }

  it('실패query 제거/다른 query 객체 재생성은 이전 관측을 재사용하지 않는다', async () => {
    const client = createQueryClient()
    client.setQueryData(['session'], { id: 'member' })
    const store = profilePrivacy(client)
    await expect(client.fetchQuery({ queryKey: key, queryFn: () => Promise.reject(new ApiClientError({}, 401)) })).rejects.toThrow()
    const old = store.snapshot()[0].query
    client.removeQueries({ queryKey: key, exact: true })
    expect(store.snapshot()).toHaveLength(0)
    const held = deferred<unknown>()
    const pending = client.fetchQuery({ queryKey: key, queryFn: () => held.promise })
    expect(client.getQueryCache().find({ queryKey: key, exact: true })).not.toBe(old)
    expect(store.snapshot()).toHaveLength(0)
    held.resolve({})
    await pending
    client.clear()
  })

  for (const status of [403, 503]) {
    it(`처음 ${status}와 다른계정401은 profile 인증 상실 관측을 만들지 않는다`, async () => {
      const client = createQueryClient()
      client.setQueryData(['session'], { id: 'member' })
      const store = profilePrivacy(client)
      await expect(client.fetchQuery({ queryKey: key, queryFn: () => Promise.reject(new ApiClientError({}, status)) })).rejects.toThrow()
      await expect(client.fetchQuery({ queryKey: ['account', 'other', 'profile'], queryFn: () => Promise.reject(new ApiClientError({}, 401)) })).rejects.toThrow()
      expect(store.snapshot()).toHaveLength(0)
      client.clear()
    })
  }
})
