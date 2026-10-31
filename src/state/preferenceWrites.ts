import { create } from 'zustand'

interface PreferenceWrites {
  owners: Map<string, symbol>
  begin: (userId: string) => symbol | null
  finish: (userId: string, owner: symbol) => void
}
// HTTP writes may still finish after logout clears the account query/mutation cache.
// Keep only transient ownership here; never store preferences or credentials.
export const usePreferenceWrites = create<PreferenceWrites>((set, get) => ({
  owners: new Map(),
  begin(userId) {
    if (get().owners.has(userId)) return null
    const owner = Symbol()
    set({ owners: new Map(get().owners).set(userId, owner) })
    return owner
  },
  finish(userId, owner) {
    if (get().owners.get(userId) !== owner) return
    const next = new Map(get().owners)
    next.delete(userId)
    set({ owners: next })
  },
}))
