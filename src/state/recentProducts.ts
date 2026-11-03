import { createStore, type StoreApi } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { RECENT_KEY, RECENT_LIMIT, RECENT_MAX_AGE, parseRecentProducts, type RecentEntry } from '../recentProducts'
import { useUi } from './ui'

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>
interface RecentState {
  owner: object | null
  generation: number
  kind: 'guest' | 'account' | null
  ready: boolean
  verificationRequired: boolean
  entries: RecentEntry[]
  storageWarning: boolean
  invalidStorage: boolean
  activate: (owner: object, kind: 'guest' | 'account') => void
  suspend: () => void
  requireVerification: () => void
  reset: () => void
  record: (owner: object, id: number) => boolean
  remove: (owner: object, id: number) => void
  clear: (owner: object) => void
  prune: () => void
}
export function createRecentStore(storage: () => Storage | null, now = Date.now) {
  let mayRestore = true
  const store = createStore<RecentState>((set, get) => {
    function saveGuest(entries: RecentEntry[]) {
      try {
        const target = storage()
        if (!target) throw new Error('storage unavailable')
        if (entries.length) target.setItem(RECENT_KEY, JSON.stringify({ version: 1, entries }))
        else target.removeItem(RECENT_KEY)
        set({ storageWarning: false })
      } catch { set({ storageWarning: true }) }
    }
    function update(entries: RecentEntry[]) {
      set({ entries })
      if (get().kind === 'guest') saveGuest(entries)
    }
    return {
      owner: null, generation: 0, kind: null, ready: false, verificationRequired: false, entries: [], storageWarning: false, invalidStorage: false,
      activate(owner, kind) {
        if (get().owner === owner) { if (!get().ready || get().verificationRequired) set({ ready: true, verificationRequired: false }); get().prune(); return }
        let entries: RecentEntry[] = []
        let invalidStorage = false
        let readFailed = false
        if (mayRestore && kind === 'guest') {
          try {
            const target = storage()
            if (!target) throw new Error('storage unavailable')
            const parsed = parseRecentProducts(target.getItem(RECENT_KEY), now())
            entries = parsed.entries; invalidStorage = parsed.invalid
          } catch { readFailed = true }
        }
        const restored = mayRestore && kind === 'guest'
        mayRestore = false
        set({ owner, generation: get().generation + 1, kind, ready: true, verificationRequired: false, entries, invalidStorage })
        if (restored) saveGuest(entries)
        else saveGuest([])
        if (readFailed) set({ storageWarning: true })
      },
      suspend() { if (get().ready) set({ ready: false }) },
      requireVerification() { if (get().ready || !get().verificationRequired) set({ ready: false, verificationRequired: true }) },
      reset() {
        mayRestore = false
        set({ owner: null, kind: null, ready: false, verificationRequired: false, entries: [], invalidStorage: false })
        saveGuest([])
      },
      record(owner, id) {
        if (!get().ready || get().owner !== owner || !Number.isSafeInteger(id) || id < 1) return false
        const time = now()
        const entries = [{ id, viewedAt: time }, ...get().entries.filter((entry) => entry.id !== id && entry.viewedAt <= time && time - entry.viewedAt < RECENT_MAX_AGE)].slice(0, RECENT_LIMIT)
        update(entries)
        return true
      },
      remove(owner, id) { if (get().ready && get().owner === owner) update(get().entries.filter((entry) => entry.id !== id)) },
      clear(owner) { if (get().ready && get().owner === owner) update([]) },
      prune() {
        if (!get().ready) return
        const time = now(); const entries = get().entries.filter((entry) => entry.viewedAt <= time && time - entry.viewedAt < RECENT_MAX_AGE)
        if (entries.length !== get().entries.length) update(entries)
      },
    }
  })
  return store
}

const stores = new WeakMap<QueryClient, StoreApi<RecentState>>()
export function recentProducts(client: QueryClient) {
  let store = stores.get(client)
  if (store) return store
  store = createRecentStore(() => window.localStorage)
  stores.set(client, store)
  const current = store
  const cache = client.getQueryCache()
  let auth: object | null = null
  let account: string | null = null
  let owner: object | null = null
  let readSequence = 0
  const startedReads = new WeakMap<object, number>()
  const completedReads = new WeakMap<object, number>()
  let fence: { query: object | undefined; readSequence: number } | null = null
  function sync() {
    const query = cache.find({ queryKey: ['session'], exact: true })
    if (!query) {
      if (auth) { current.getState().reset(); auth = null; account = null; owner = null }
      return
    }
    const pending = useUi.getState().pending
    const data = query.state.data
    if (query.state.status !== 'success' || query.state.fetchStatus !== 'idle' || pending.login || pending.join || pending.logout ||
        !(data === null || (typeof data === 'object' && data && 'id' in data && typeof data.id === 'string'))) {
      current.getState().suspend()
      return
    }
    const key = data === null ? 'guest' : `account:${data.id}`
    // A failed/uncertain auth write leaves the old session cache intact. Only a
    // read begun after that write ended, or the new auth query installed by a
    // successful auth flow, can release this feature's history barrier.
    if (fence) {
      if (query === fence.query && (completedReads.get(query) ?? -1) <= fence.readSequence) {
        current.getState().requireVerification()
        return
      }
      fence = null
    }
    if (auth !== query || account !== key) { auth = query; account = key; owner = {} }
    current.getState().activate(owner!, data === null ? 'guest' : 'account')
  }
  cache.subscribe((event) => {
    if (event.query.queryKey.length !== 1 || event.query.queryKey[0] !== 'session') return
    if (event.type === 'updated' && event.action.type === 'fetch') startedReads.set(event.query, ++readSequence)
    if (event.type === 'updated' && event.action.type === 'success' && !event.action.manual)
      completedReads.set(event.query, startedReads.get(event.query) ?? 0)
    sync()
  })
  useUi.subscribe((state, previous) => {
    const before = ['login', 'join', 'logout'].some((key) => previous.pending[key])
    const after = ['login', 'join', 'logout'].some((key) => state.pending[key])
    if (after && !before) {
      fence = { query: cache.find({ queryKey: ['session'], exact: true }), readSequence }
      current.getState().requireVerification()
    }
    if (!after && before && fence) fence.readSequence = readSequence
    if (after !== before) sync()
  })
  sync()
  return store
}
export function useRecentProducts() { return useStore(recentProducts(useQueryClient())) }
