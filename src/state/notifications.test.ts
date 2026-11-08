import { beforeEach, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { api, ApiClientError } from '../services/api'
import { notifications } from './notifications'
import { useUi } from './ui'

vi.mock('../services/api', async (original) => ({ ...await original<typeof import('../services/api')>(), api: { notifications: vi.fn(), readNotification: vi.fn(), readNotifications: vi.fn() } }))
const user = (id = 'member') => ({ id, name: id, role: 'USER' })
const id = '00000000-0000-0000-0000-000000000001'
const receipt = { items: [{ id, readAt: 1000 }], unreadCount: 0 }
function ready() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); client.setQueryData(['session'], user()); return { client, account: notifications(client) } }
beforeEach(() => { vi.clearAllMocks(); useUi.setState({ pending: {}, notice: null }) })
it('ordinary session observer renders do not publish an unchanged ownership snapshot', () => {
  const { client, account } = ready(), scope = account.store.getState().scope
  const changed = vi.fn(), stop = account.store.subscribe(changed)
  const observer = new QueryObserver(client, { queryKey: ['session'], staleTime: Infinity })
  const off = observer.subscribe(() => {})
  observer.setOptions({ queryKey: ['session'], staleTime: Infinity })
  expect(account.store.getState().scope).toBe(scope); expect(changed).not.toHaveBeenCalled()
  off(); stop()
})
it('notification401 expires the shared header/list boundary until an actual session read succeeds', async () => {
  const { client, account } = ready(), scope = account.store.getState().scope!
  vi.mocked(api.notifications).mockRejectedValueOnce(new ApiClientError({}, 401))
  await expect(account.read(scope, 1, 20, new AbortController().signal)).rejects.toThrow()
  expect(account.store.getState().ready).toBe(false); expect(account.store.getState().expired).toBe(true)
  await client.fetchQuery({ queryKey: ['session'], queryFn: async () => user() })
  expect(account.store.getState().ready).toBe(true); expect(account.owns(scope)).toBe(false)
})
it('auth writes and same-ID fresh reads create new owners and never revive an old response', async () => {
  const { client, account } = ready(), original = account.store.getState().scope!
  useUi.setState({ pending: { logout: true } }); expect(account.store.getState().ready).toBe(false)
  useUi.setState({ pending: {} }); expect(account.owns(original)).toBe(false)
  const next = account.store.getState().scope!
  await client.fetchQuery({ queryKey: ['session'], queryFn: async () => user() }); expect(account.owns(next)).toBe(false)
})
it('late write401 cannot expire B, and real HTTP lifetime blocks a new write after A→B→A', async () => {
  const { client, account } = ready(), first = account.store.getState().scope!
  let fail!: (error: Error) => void
  vi.mocked(api.readNotification).mockReturnValueOnce(new Promise((_, reject) => { fail = reject }))
  const pending = account.mark(first, [id], false)
  client.clear(); client.setQueryData(['session'], user('other')); expect(account.store.getState().pending).toBe(false)
  client.clear(); client.setQueryData(['session'], user()); const returned = account.store.getState().scope!
  expect(account.store.getState().pending).toBe(true); expect(await account.mark(returned, [id], false)).toBe(false)
  fail(new ApiClientError({}, 401)); await pending.catch(() => {})
  expect(account.store.getState().ready).toBe(true); expect(account.store.getState().expired).toBe(false); expect(account.store.getState().pending).toBe(false)
})
it('a partial batch response never invalidates the page as a successful read', async () => {
  const { client, account } = ready(); const invalidate = vi.spyOn(client, 'invalidateQueries')
  vi.mocked(api.readNotifications).mockResolvedValueOnce({ ...receipt, items: [] })
  await expect(account.mark(account.store.getState().scope!, [id], true)).rejects.toThrow()
  expect(invalidate).not.toHaveBeenCalled(); expect(account.store.getState().pending).toBe(false)
})
