import { create } from 'zustand'

interface FavoriteWrites {
  owners: Map<string, Map<number, symbol>>
  revisions: Map<string, number>
  begin: (userId: string, productId: number) => symbol | null
  finish: (userId: string, productId: number, owner: symbol) => void
}
// An account cache reset does not cancel already authorized HTTP writes.
// No saved membership or credentials are persisted here.
export const useFavoriteWrites = create<FavoriteWrites>((set, get) => ({
  owners: new Map(),
  revisions: new Map(),
  begin(userId, productId) {
    if (get().owners.get(userId)?.has(productId)) return null
    const owner = Symbol()
    const account = new Map(get().owners.get(userId)).set(productId, owner)
    set({ owners: new Map(get().owners).set(userId, account) })
    return owner
  },
  finish(userId, productId, owner) {
    if (get().owners.get(userId)?.get(productId) !== owner) return
    const account = new Map(get().owners.get(userId))
    account.delete(productId)
    const owners = new Map(get().owners)
    if (account.size) owners.set(userId, account)
    else owners.delete(userId)
    set({
      owners,
      revisions: new Map(get().revisions).set(
        userId,
        (get().revisions.get(userId) ?? 0) + 1,
      ),
    })
  },
}))
