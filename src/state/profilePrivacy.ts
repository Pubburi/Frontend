import type { Query, QueryClient } from '@tanstack/react-query'
import { ApiClientError } from '../services/api'

export interface ProfileFailure {
  auth: Query
  account: unknown
  query: Query
  dataUpdates: number
}

// A cold refetch clears query.error before authentication has been confirmed.
// Keep the observation with its actual query/auth owners across route remounts.
const stores = new WeakMap<QueryClient, ReturnType<typeof createStore>>()

function createStore(client: QueryClient) {
  const cache = client.getQueryCache()
  const failures = new Map<Query, ProfileFailure>()
  const listeners = new Set<() => void>()
  let snapshot: readonly ProfileFailure[] = []
  function observe(query: Query, recordFailure: boolean, verifiedSuccess = false) {
    const auth = cache.find({ queryKey: ['session'], exact: true })
    const account = auth?.state.data
    let changed = false
    for (const [failedQuery, failure] of failures) {
      if (failure.auth !== auth || failure.account !== account || cache.get(failedQuery.queryHash) !== failedQuery ||
          (failedQuery === query && verifiedSuccess && query.state.dataUpdateCount > failure.dataUpdates)) {
        failures.delete(failedQuery)
        changed = true
      }
    }
    const id = account && typeof account === 'object' && 'id' in account ? account.id : null
    const key = query.queryKey
    const owned = key[0] === 'account' && key[1] === id &&
      ((key[2] === 'profile' && key.length === 3) || (key[2] === 'orders' && key.length === 4))
    if (recordFailure && auth?.state.status === 'success' && typeof id === 'string' && owned &&
        cache.get(query.queryHash) === query && query.state.status === 'error' &&
        query.state.error instanceof ApiClientError && query.state.error.status === 401 && !failures.has(query)) {
      failures.set(query, { auth, account, query, dataUpdates: query.state.dataUpdateCount })
      changed = true
    }
    if (changed) {
      snapshot = [...failures.values()]
      for (const listener of listeners) listener()
    }
  }
  cache.subscribe((event) => observe(event.query,
    event.type === 'updated' && event.action.type === 'error',
    event.type === 'updated' && event.action.type === 'success' && !event.action.manual))
  for (const query of cache.getAll()) observe(query, true)
  return {
    snapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

export function profilePrivacy(client: QueryClient) {
  let store = stores.get(client)
  if (!store) {
    store = createStore(client)
    stores.set(client, store)
  }
  return store
}
