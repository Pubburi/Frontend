import type { Query, QueryClient, QueryKey } from '@tanstack/react-query'
import { ApiClientError } from '../services/api'

export interface AuthReadFailure {
  auth: Query
  account: unknown
  query: Query
  dataUpdates: number
}

// A cold refetch clears query.error before access has been confirmed. Keep the
// observation with its actual query/auth owners, scoped by the calling feature.
export function authReadPrivacy(owns: (key: QueryKey, id: string, account: object) => boolean) {
  const stores = new WeakMap<QueryClient, ReturnType<typeof createStore>>()
  function createStore(client: QueryClient) {
    const cache = client.getQueryCache()
    const failures = new Map<Query, AuthReadFailure>()
    const fetchStatuses = new Map<Query, Query['state']['fetchStatus']>()
    const listeners = new Set<() => void>()
    let snapshot: readonly AuthReadFailure[] = []
    function observe(query: Query, recordFailure: boolean, verifiedSuccess = false) {
      const auth = cache.find({ queryKey: ['session'], exact: true })
      const account = auth?.state.data
      let changed = false
      for (const [failedQuery, failure] of failures) {
        if (failure.auth !== auth || failure.account !== account || cache.get(failedQuery.queryHash) !== failedQuery ||
            (failedQuery === query && verifiedSuccess && query.state.dataUpdateCount > failure.dataUpdates)) {
          failures.delete(failedQuery)
          fetchStatuses.delete(failedQuery)
          changed = true
        }
      }
      const id = account && typeof account === 'object' && 'id' in account ? account.id : null
      if (recordFailure && auth?.state.status === 'success' && typeof id === 'string' &&
          account && typeof account === 'object' && owns(query.queryKey, id, account) &&
          cache.get(query.queryHash) === query && query.state.status === 'error' &&
          query.state.error instanceof ApiClientError && query.state.error.status === 401 && !failures.has(query)) {
        failures.set(query, { auth, account, query, dataUpdates: query.state.dataUpdateCount })
        changed = true
      }
      // Inactive/cold queries can move between idle/paused/fetching without a
      // component observer changing isFetching. Publish readiness as well as
      // failures, while retaining the exact observation and ownership objects.
      if (failures.has(query) && fetchStatuses.get(query) !== query.state.fetchStatus) {
        fetchStatuses.set(query, query.state.fetchStatus)
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
  return (client: QueryClient) => {
    let store = stores.get(client)
    if (!store) {
      store = createStore(client)
      stores.set(client, store)
    }
    return store
  }
}
