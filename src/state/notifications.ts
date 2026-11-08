import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { useQuery, useQueryClient, type Query, type QueryClient } from '@tanstack/react-query'
import { api, ApiClientError } from '../services/api'
import { readSession } from '../queries'
import { checkedNotificationReads, checkedNotifications } from '../notifications'
import { useUi } from './ui'
import type { User } from '../types'

type Scope = { auth: Query; id: string; role: string; generation: number }
const authKeys = ['login', 'join', 'logout', 'settings-password']
const authPending = () => authKeys.some((key) => useUi.getState().pending[key])
interface State { scope: Scope | null; ready: boolean; expired: boolean; pending: boolean }
const stores = new WeakMap<QueryClient, ReturnType<typeof createNotifications>>()
export function notificationKey(scope: Scope) { return ['account', scope.id, 'notifications', scope.generation] as const }

function createNotifications(client: QueryClient) {
  const cache = client.getQueryCache(), writes = new Map<string, Promise<void>>()
  const store = createStore<State>(() => ({ scope: null, ready: false, expired: false, pending: false }))
  let generation = 0
  function publish(next: State) {
    const previous = store.getState()
    if (Object.keys(next).some((key) => next[key as keyof State] !== previous[key as keyof State])) store.setState(next)
  }
  function sync(advance = false) {
    const auth = cache.find({ queryKey: ['session'], exact: true }), state = store.getState(), user = auth?.state.data as User | null | undefined
    if (!auth || !user || typeof user.id !== 'string') { publish({ scope: null, ready: false, expired: false, pending: false }); return }
    const changed = advance || state.scope?.auth !== auth || state.scope.id !== user.id || state.scope.role !== user.role
    const scope = changed ? { auth, id: user.id, role: user.role, generation: ++generation } : state.scope!
    const expired = changed ? false : state.expired
    publish({ scope, expired, ready: !expired && !authPending() && auth.state.status === 'success' && auth.state.fetchStatus === 'idle', pending: writes.has(user.id) })
  }
  const owns = (scope: Scope) => store.getState().scope === scope && store.getState().ready && !authPending() &&
    cache.find({ queryKey: ['session'], exact: true }) === scope.auth && scope.auth.state.status === 'success' &&
    scope.auth.state.fetchStatus === 'idle' && (scope.auth.state.data as User | null)?.id === scope.id
  function reject(scope: Scope, cause: unknown) {
    if (owns(scope) && cause instanceof ApiClientError && cause.status === 401) store.setState({ ready: false, expired: true })
  }
  cache.subscribe((event) => {
    if (event.query.queryKey.length === 1 && event.query.queryKey[0] === 'session')
      sync(event.type === 'updated' && event.action.type === 'success')
  })
  useUi.subscribe((state, before) => {
    if (authKeys.some((key) => state.pending[key]) !== authKeys.some((key) => before.pending[key])) sync(true)
  })
  sync()
  return { store, owns,
    async read(scope: Scope, page: number, size: number, signal: AbortSignal) {
      await writes.get(scope.id)
      if (!owns(scope) || signal.aborted) throw new Error('이전 계정의 알림 조회입니다.')
      try {
        const result = checkedNotifications(await api.notifications(scope.id, page, size, signal), page, size)
        if (!owns(scope)) throw new Error('이전 계정의 알림 조회입니다.')
        return result
      } catch (cause) { reject(scope, cause); throw cause }
    },
    async mark(scope: Scope, ids: string[], bulk: boolean) {
      if (!owns(scope) || writes.has(scope.id) || !ids.length) return false
      const request = (async () => {
        try {
          const result = bulk ? await api.readNotifications(scope.id, ids) : await api.readNotification(scope.id, ids[0])
          checkedNotificationReads(result, ids)
          if (!owns(scope)) return false
          void client.invalidateQueries({ queryKey: notificationKey(scope) })
          return true
        } catch (cause) { reject(scope, cause); throw cause }
      })()
      const lifetime = request.then(() => {}, () => {})
      writes.set(scope.id, lifetime); sync()
      try { return await request } finally { if (writes.get(scope.id) === lifetime) writes.delete(scope.id); sync() }
    },
    recheck: () => client.fetchQuery({ queryKey: ['session'], queryFn: readSession, staleTime: 0 }),
  }
}
export function notifications(client: QueryClient) {
  let state = stores.get(client)
  if (!state) { state = createNotifications(client); stores.set(client, state) }
  return state
}
export function useNotificationAccount() {
  const client = useQueryClient(), account = notifications(client)
  return { ...useStore(account.store), account }
}
export function useNotificationQuery(page = 1, size = 1, view = 'summary', enabled = true) {
  const state = useNotificationAccount(), { scope, account } = state
  const query = useQuery({
    queryKey: scope ? [...notificationKey(scope), view, page, size] : ['notifications', 'unverified'],
    enabled: enabled && !!scope && state.ready,
    queryFn: ({ signal }) => account.read(scope!, page, size, signal),
    refetchOnReconnect: false,
  })
  return { ...state, query }
}
