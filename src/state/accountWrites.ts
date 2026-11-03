import { create } from 'zustand'
import { useUi } from './ui'

interface AccountWrites {
  owners: Map<string, { token: symbol; password: boolean }>
  begin: (id: string, password: boolean) => symbol | null
  finishAuth: (id: string, token: symbol) => void
  finish: (id: string, token: symbol) => void
}
// Only transient request ownership survives auth-cache clearing, never form values.
export const useAccountWrites = create<AccountWrites>((set, get) => {
  function publish() {
    const pending = { ...useUi.getState().pending }
    if ([...get().owners.values()].some((owner) => owner.password)) pending['settings-password'] = true
    else delete pending['settings-password']
    useUi.setState({ pending })
  }
  return {
    owners: new Map(),
    begin(id, password) {
      if (get().owners.has(id)) return null
      const token = Symbol()
      set({ owners: new Map(get().owners).set(id, { token, password }) }); publish()
      return token
    },
    finishAuth(id, token) {
      const owner = get().owners.get(id)
      if (owner?.token !== token || !owner.password) return
      set({ owners: new Map(get().owners).set(id, { token, password: false }) }); publish()
    },
    finish(id, token) {
      if (get().owners.get(id)?.token !== token) return
      const owners = new Map(get().owners); owners.delete(id)
      set({ owners }); publish()
    },
  }
})
