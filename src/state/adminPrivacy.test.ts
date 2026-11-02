import { afterEach, describe, expect, it } from 'vitest'
import { onlineManager } from '@tanstack/react-query'
import { createQueryClient } from '../queries'
import { ApiClientError } from '../services/api'
import { adminPrivacy } from './adminPrivacy'

const key = ['admin', 'admin', 'users', 1] as const
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
afterEach(() => onlineManager.setOnline(true))

describe('관리자 읽기401의 인증/query 소유', () => {
  it('현재 ADMIN의 비공개 목록401만 관측하고 공개 목록·다른 계정·권한/서버 오류는 구분한다', async () => {
    const client = createQueryClient()
    client.setQueryData(['session'], { id: 'admin', role: 'ADMIN' })
    const store = adminPrivacy(client)
    for (const [queryKey, status] of [
      [['admin', 'admin', 'products', 1], 401],
      [['admin', 'admin', 'markets', 1], 401],
      [['admin', 'other', 'users', 1], 401],
      [key, 403],
      [key, 503],
    ] as const) {
      await expect(client.fetchQuery({ queryKey, queryFn: () => Promise.reject(new ApiClientError({}, status)) })).rejects.toThrow()
      expect(store.snapshot()).toHaveLength(0)
    }
    for (const tab of ['users', 'orders', 'comments']) {
      await expect(client.fetchQuery({ queryKey: ['admin', 'admin', tab, 1], queryFn: () => Promise.reject(new ApiClientError({}, 401)) })).rejects.toThrow()
    }
    expect(store.snapshot()).toHaveLength(3)
    client.setQueryData(['session'], { id: 'admin', role: 'USER' })
    expect(store.snapshot()).toHaveLength(0)
    await expect(client.fetchQuery({ queryKey: key, queryFn: () => Promise.reject(new ApiClientError({}, 401)) })).rejects.toThrow()
    expect(store.snapshot()).toHaveLength(0)
    client.clear()
  })

  it('cold/paused 재조회와 뒤503·로컬 캐시는 확인이 아니며 해당 새 HTTP 성공만 관측을 해제한다', async () => {
    const client = createQueryClient()
    client.mount()
    client.setQueryData(['session'], { id: 'admin', role: 'ADMIN' })
    const store = adminPrivacy(client)
    const transitions: string[] = []
    const unsubscribe = store.subscribe(() => {
      const failure = store.snapshot()[0]
      if (failure) transitions.push(failure.query.state.fetchStatus)
    })
    try {
      await expect(client.fetchQuery({ queryKey: key, queryFn: () => Promise.reject(new ApiClientError({}, 401)) })).rejects.toThrow()
      const observation = store.snapshot()[0]
      onlineManager.setOnline(false)
      const pending = client.fetchQuery({ queryKey: key, queryFn: () => Promise.reject(new ApiClientError({}, 503)) })
      const rejected = expect(pending).rejects.toThrow()
      expect(client.getQueryState(key)).toMatchObject({ status: 'pending', fetchStatus: 'paused', error: null })
      expect(adminPrivacy(client).snapshot()).toEqual([observation])
      expect(transitions).toContain('paused')
      onlineManager.setOnline(true)
      await rejected
      client.setQueryData(key, { items: [{ id: 'local-only' }] })
      await client.fetchQuery({ queryKey: ['admin', 'admin', 'orders', 1], queryFn: async () => ({ items: [] }) })
      expect(store.snapshot()).toEqual([observation])
      expect(transitions).toContain('fetching')
      expect(transitions).toContain('idle')
      await client.fetchQuery({ queryKey: key, queryFn: async () => ({ items: [{ id: 'authoritative' }] }) })
      expect(store.snapshot()).toHaveLength(0)
    } finally { unsubscribe(); client.unmount(); client.clear() }
  })

  for (const next of ['admin', 'other-admin']) {
    it(`${next} 새 로그인 뒤 이전 요청의 늦은401은 현재 인증의 실패가 되지 않는다`, async () => {
      const client = createQueryClient()
      client.setQueryData(['session'], { id: 'admin', role: 'ADMIN' })
      const store = adminPrivacy(client)
      const held = deferred<void>()
      let delivered = false
      const pending = client.fetchQuery({ queryKey: key, queryFn: async () => {
        await held.promise
        delivered = true
        throw new ApiClientError({}, 401)
      } })
      client.clear()
      client.setQueryData(['session'], { id: next, role: 'ADMIN' })
      await expect(pending).rejects.toThrow()
      held.resolve(undefined)
      await expect.poll(() => delivered).toBe(true)
      expect(store.snapshot()).toHaveLength(0)
      client.clear()
    })
  }

  it('제거된 query의 관측을 같은 key의 새 query에 붙이지 않는다', async () => {
    const client = createQueryClient()
    client.setQueryData(['session'], { id: 'admin', role: 'ADMIN' })
    const store = adminPrivacy(client)
    await expect(client.fetchQuery({ queryKey: key, queryFn: () => Promise.reject(new ApiClientError({}, 401)) })).rejects.toThrow()
    const original = store.snapshot()[0].query
    client.removeQueries({ queryKey: key, exact: true })
    const held = deferred<unknown>()
    const pending = client.fetchQuery({ queryKey: key, queryFn: () => held.promise })
    expect(client.getQueryCache().find({ queryKey: key, exact: true })).not.toBe(original)
    expect(store.snapshot()).toHaveLength(0)
    held.resolve({ items: [] })
    await pending
    client.clear()
  })
})
