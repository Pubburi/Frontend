import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { RECENT_KEY, RECENT_MAX_AGE, parseRecentProducts } from './recentProducts'
import { createRecentStore, recentProducts } from './state/recentProducts'
import { useUi } from './state/ui'

const time = Date.UTC(2026, 10, 3)
const encode = (entries: unknown[]) => JSON.stringify({ version: 1, entries })
function storage(raw: string | null = null) {
  const values = new Map<string, string>(raw === null ? [] : [[RECENT_KEY, raw]])
  return { getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value) }), removeItem: vi.fn((key: string) => { values.delete(key) }) }
}
afterEach(() => { useUi.setState({ pending: {} }); window.localStorage.clear() })
describe('F05 bounded ID/time-only browser history', () => {
  it('sorts current entries and expires the exact30-day boundary and future device timestamps', () => {
    const raw = encode([{ id: 1, viewedAt: time - RECENT_MAX_AGE }, { id: 2, viewedAt: time - 10 }, { id: 3, viewedAt: time + 1 }, { id: 4, viewedAt: time - 20 }])
    expect(parseRecentProducts(raw, time)).toEqual({ entries: [{ id: 2, viewedAt: time - 10 }, { id: 4, viewedAt: time - 20 }], invalid: false })
  })
  for (const raw of ['{bad', JSON.stringify([]), JSON.stringify({ version: 2, entries: [] }), encode([{ id: '7', viewedAt: time }]), encode([{ id: 0, viewedAt: time }]), encode([{ id: 7, viewedAt: '1' }]), encode([{ id: 7, viewedAt: time, product: { name: 'old snapshot', tasteTags: ['invented'] } }]), encode([{ id: 7, viewedAt: time }, { id: 7, viewedAt: time }]), encode(Array.from({ length: 21 }, (_, i) => ({ id: i + 1, viewedAt: time }))), ' '.repeat(5001)]) {
    it(`discards unsupported or manipulated storage ${raw.slice(0, 60)}`, () => {
      expect(parseRecentProducts(raw, time)).toEqual({ entries: [], invalid: true })
    })
  }
  it('does not read disk before authoritative guest activation and records unique newest20', () => {
    let clock = time
    const disk = storage(encode([{ id: 7, viewedAt: time - 100 }]))
    const store = createRecentStore(() => disk, () => clock)
    const owner = {}
    expect(disk.getItem).not.toHaveBeenCalled()
    expect(store.getState().record(owner, 1)).toBe(false)
    store.getState().activate(owner, 'guest')
    for (let i = 1; i <= 22; i++) { clock++; store.getState().record(owner, i) }
    expect(store.getState().entries.map((item) => item.id)).toEqual(Array.from({ length: 20 }, (_, i) => 22 - i))
    clock++; store.getState().record(owner, 7)
    expect(store.getState().entries[0]).toEqual({ id: 7, viewedAt: clock })
    expect(store.getState().entries.filter((item) => item.id === 7)).toHaveLength(1)
    expect(JSON.parse(disk.getItem(RECENT_KEY)!)).toEqual({ version: 1, entries: store.getState().entries })
    clock += RECENT_MAX_AGE; store.getState().prune()
    expect(store.getState().entries).toEqual([])
    expect(disk.getItem(RECENT_KEY)).toBeNull()
  })
  it('account records never write account identity or snapshots and cannot survive a new owner', () => {
    const disk = storage(); const store = createRecentStore(() => disk, () => time)
    const a = {}, b = {}
    store.getState().activate(a, 'account'); store.getState().record(a, 7)
    expect(store.getState().entries).toEqual([{ id: 7, viewedAt: time }])
    expect(disk.setItem).not.toHaveBeenCalled()
    store.getState().activate(b, 'account')
    expect(store.getState().entries).toEqual([])
    expect(store.getState().record(a, 8)).toBe(false)
    store.getState().record(b, 9); store.getState().remove(a, 9); store.getState().clear(a)
    expect(store.getState().entries.map((item) => item.id)).toEqual([9])
    expect(disk.getItem(RECENT_KEY)).toBeNull()
  })
  it('denied cleanup never merges old guest disk into an account or a later same-SPA guest', () => {
    const disk = storage(encode([{ id: 7, viewedAt: time }]))
    const store = createRecentStore(() => disk, () => time)
    store.getState().activate({}, 'guest')
    disk.removeItem.mockImplementation(() => { throw new Error('denied') })
    const account = {}; store.getState().activate(account, 'account'); store.getState().record(account, 99)
    store.getState().reset(); store.getState().activate({}, 'guest')
    expect(store.getState().entries).toEqual([])
    expect(store.getState().storageWarning).toBe(true)
    expect(JSON.parse(disk.getItem(RECENT_KEY)!).entries).toEqual([{ id: 7, viewedAt: time }])
    const reloaded = createRecentStore(() => disk, () => time); reloaded.getState().activate({}, 'guest')
    expect(reloaded.getState().entries.map((item) => item.id)).toEqual([7])
    expect(disk.getItem(RECENT_KEY)).not.toContain('99')
  })
  it('blocked getters/reads/writes keep memory usable and later successful persistence clears its warning', () => {
    let blocked = true
    const disk = storage(); const store = createRecentStore(() => { if (blocked) throw new Error('blocked getter'); return disk }, () => time)
    const owner = {}; store.getState().activate(owner, 'guest')
    expect(() => store.getState().record(owner, 7)).not.toThrow()
    expect(store.getState().storageWarning).toBe(true)
    expect(store.getState().entries).toHaveLength(1)
    blocked = false; store.getState().record(owner, 8)
    expect(store.getState().storageWarning).toBe(false)
    store.getState().suspend(); expect(store.getState().record(owner, 9)).toBe(false)
    store.getState().remove(owner, 7); expect(store.getState().entries).toHaveLength(2)
  })
  it('a failed read stays disclosed even if cleanup succeeds; a failed write preserves current memory', () => {
    const disk = storage(); disk.getItem.mockImplementation(() => { throw new Error('read denied') })
    const store = createRecentStore(() => disk, () => time); const owner = {}
    store.getState().activate(owner, 'guest'); expect(store.getState().storageWarning).toBe(true)
    store.getState().record(owner, 7); expect(store.getState().storageWarning).toBe(false)
    disk.setItem.mockImplementation(() => { throw new Error('write denied') })
    store.getState().record(owner, 8)
    expect(store.getState().entries.map((entry) => entry.id)).toEqual([8, 7])
    expect(store.getState().storageWarning).toBe(true)
    store.getState().clear(owner); expect(store.getState().entries).toEqual([])
    expect(store.getState().storageWarning).toBe(false)
  })
})

describe('F05 authoritative session boundary', () => {
  it('uncertain auth completion requires a later authoritative read; an overlapping read or manual cache update is insufficient', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); const store = recentProducts(client)
    try {
      await client.fetchQuery({ queryKey: ['session'], queryFn: async () => ({ id: 'a' }) })
      const owner = store.getState().owner!; store.getState().record(owner, 7)
      useUi.setState({ pending: { logout: true } })
      let release!: (value: { id: string }) => void
      const overlapping = client.fetchQuery({ queryKey: ['session'], queryFn: () => new Promise<{ id: string }>((resolve) => { release = resolve }) })
      useUi.setState({ pending: {} }); release({ id: 'a' }); await overlapping
      expect(store.getState().ready).toBe(false)
      client.setQueryData(['session'], { id: 'a' }); expect(store.getState().ready).toBe(false)
      expect(store.getState().record(owner, 8)).toBe(false)
      await client.fetchQuery({ queryKey: ['session'], queryFn: async () => ({ id: 'a' }) })
      expect(store.getState().ready).toBe(true)
      expect(store.getState().entries.map((entry) => entry.id)).toEqual([7])
    } finally { client.clear() }
  })
  it('bootstrap/error/transition hide and block recording; clear+same-ID re-login creates a new memory owner', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const store = recentProducts(client)
    try {
      expect(store.getState().ready).toBe(false)
      await expect(client.fetchQuery({ queryKey: ['session'], queryFn: async () => { throw new Error('503') } })).rejects.toThrow()
      expect(store.getState().ready).toBe(false)
      client.setQueryData(['session'], { id: 'a' })
      const owner = store.getState().owner!
      store.getState().record(owner, 7)
      useUi.setState({ pending: { logout: true } })
      expect(store.getState().ready).toBe(false)
      expect(store.getState().record(owner, 8)).toBe(false)
      client.clear(); client.setQueryData(['session'], { id: 'a' })
      useUi.setState({ pending: {} })
      expect(store.getState().owner).not.toBe(owner)
      expect(store.getState().entries).toEqual([])
      expect(store.getState().record(owner, 9)).toBe(false)
      expect(window.localStorage.getItem(RECENT_KEY)).toBeNull()
    } finally { client.clear() }
  })
  it('late detached session success cannot restore an old owner into the current account', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); const store = recentProducts(client)
    try {
      client.setQueryData(['session'], { id: 'a' }); const a = store.getState().owner!
      let release!: (value: { id: string }) => void
      const pending = client.fetchQuery({ queryKey: ['session'], queryFn: () => new Promise<{ id: string }>((resolve) => { release = resolve }) }).catch(() => undefined)
      client.clear(); client.setQueryData(['session'], { id: 'b' }); const b = store.getState().owner!
      store.getState().record(b, 9); release({ id: 'a' }); await pending
      expect(store.getState().owner).toBe(b)
      expect(store.getState().entries.map((item) => item.id)).toEqual([9])
      expect(store.getState().record(a, 7)).toBe(false)
    } finally { client.clear() }
  })
})
