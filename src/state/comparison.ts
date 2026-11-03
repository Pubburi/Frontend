import { create } from 'zustand'
import { COMPARISON_LIMIT } from '../comparison'

// Only public IDs live here. The comparison URL owns the displayed selection.
// No account/cart storage or product snapshots are added.
interface ComparisonState {
  ids: number[]
  replace: (ids: number[]) => void
  toggle: (id: number) => boolean
}
export const useComparison = create<ComparisonState>((set, get) => ({
  ids: [],
  replace(ids) {
    if (ids.length > COMPARISON_LIMIT || ids.some((id) => !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== ids.length) return
    if (get().ids.join(',') !== ids.join(',')) set({ ids: [...ids] })
  },
  toggle(id) {
    if (!Number.isSafeInteger(id) || id < 1) return false
    const ids = get().ids
    if (ids.includes(id)) { set({ ids: ids.filter((value) => value !== id) }); return true }
    if (ids.length >= COMPARISON_LIMIT) return false
    set({ ids: [...ids, id] })
    return true
  },
}))
