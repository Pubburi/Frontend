import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { recentProducts, useRecentProducts } from '../state/recentProducts'
import { useUi } from '../state/ui'

export function useRecordRecentVisit(id: number | undefined, success: boolean, locationKey: string) {
  const history = useRecentProducts()
  const client = useQueryClient()
  const pending = useUi((state) => Boolean(state.pending.login || state.pending.join || state.pending.logout))
  // A known owner remains the visit owner while its session is being checked.
  // A later different account must not adopt that already-opened detail.
  const visit = useRef<{ key: string; owner?: object; blocked: boolean; recorded: boolean }>({ key: locationKey, owner: history.owner ?? undefined, blocked: pending || history.verificationRequired, recorded: false })
  if (visit.current.key !== locationKey) visit.current = { key: locationKey, owner: history.owner ?? undefined, blocked: pending || history.verificationRequired, recorded: false }
  if (!visit.current.owner && !visit.current.blocked && history.ready && history.owner) visit.current.owner = history.owner
  const current = visit.current
  useEffect(() => {
    if (visit.current === current && !current.recorded && current.owner && success && id !== undefined &&
        recentProducts(client).getState().record(current.owner, id)) current.recorded = true
  }, [client, current, id, success, history.ready, history.owner])
}
