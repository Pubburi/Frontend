import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { api, ApiClientError } from '../services/api'
import { createAccountCart, checkedCart } from './accountCart'
import { cartStore } from './cart'
import { useUi } from './ui'

vi.mock('../services/api', async (original) => ({ ...await original<typeof import('../services/api')>(), api: { accountCart: vi.fn(), setCartQuantity: vi.fn(), cartOperation: vi.fn(), cartOperationResult: vi.fn(), resolveCartOperation: vi.fn(), removeCartItems: vi.fn(), me: vi.fn() } }))
const product = { id: 7, name: '카트 표본', type: '탁주', price: 0, abv: 0, orderCount: 0 }
const row = (quantity = 1) => ({ productId: 7, productName: product.name, currentProduct: product, quantity })
const user = (id = 'member') => ({ id, name: id, role: 'USER' })
function ready() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); client.setQueryData(['session'], user()); return { client, store: createAccountCart(client) } }
beforeEach(() => { vi.clearAllMocks(); useUi.setState({ pending: {}, notice: null }); for (const item of cartStore.getState().items) cartStore.getState().remove(item.product.id); cartStore.getState().setOrderForm({ orderType: 'TAKEOUT', orderTable: '' }) })
describe('account cart ownership and exact operations', () => {
  it('rejects malformed/duplicate/deleted-as-zero responses and accepts real zero price', () => {
    expect(checkedCart({ version: 0, items: [row()] }).items[0].currentProduct?.price).toBe(0)
    for (const value of [{ version: -1, items: [] }, { version: 0, items: [row(), row()] }, { version: 0, items: [{ ...row(), quantity: 100 }] }, { version: 0, items: [{ ...row(), currentProduct: undefined }] }]) expect(() => checkedCart(value)).toThrow()
    expect(checkedCart({ version: 1, items: [{ ...row(), currentProduct: null }] }).items[0].currentProduct).toBeNull()
  })
  it('loads current server quantity before an absolute CAS add and never writes it to guest storage', async () => {
    const { store } = ready(); vi.mocked(api.accountCart).mockResolvedValueOnce({ version: 2, items: [row(3)] }); vi.mocked(api.setCartQuantity).mockResolvedValueOnce({ version: 3, items: [row(5)] })
    expect(await store.getState().add(product, 2)).toBe(true)
    expect(api.setCartQuantity).toHaveBeenCalledWith('member', 7, 5, 2); expect(store.getState().data?.items[0].quantity).toBe(5); expect(cartStore.getState().items).toEqual([])
  })
  it('only explicit unsupported marker404 permits legacy fallback; PG404 and503 preserve guest without fallback writes', async () => {
    for (const [status, code, legacy] of [[404, 'CART_NOT_SUPPORTED', true], [404, 'NOT_FOUND', false], [503, 'SERVICE_UNAVAILABLE', false]] as const) {
      const { store } = ready(); vi.mocked(api.accountCart).mockRejectedValueOnce(new ApiClientError({ code }, status)); await store.getState().load()
      expect(store.getState().legacy).toBe(legacy); expect(cartStore.getState().items).toEqual([])
    }
  })
  it('retries an uncertain merge with the same UUID/intent and consumes only captured guest quantities', async () => {
    const { store } = ready(); cartStore.getState().add(product, 2)
    vi.mocked(api.accountCart).mockResolvedValueOnce({ version: 0, items: [] }); await store.getState().load()
    vi.mocked(api.cartOperation).mockRejectedValueOnce(new ApiClientError({}, 0))
    await store.getState().merge(); const first = vi.mocked(api.cartOperation).mock.calls[0][2]
    expect(cartStore.getState().items[0].quantity).toBe(2)
    cartStore.getState().add(product, 1)
    vi.mocked(api.cartOperation).mockResolvedValueOnce({ operationId: first.operationId, replayed: true, status: 'APPLIED', orderId: null, cart: { version: 1, items: [row(2)] } })
    await store.getState().retry()
    expect(vi.mocked(api.cartOperation).mock.calls[1][2]).toEqual(first); expect(cartStore.getState().items[0].quantity).toBe(1)
  })
  it('late merge401/success cannot consume guest or replace a new auth/account generation', async () => {
    for (const outcome of ['success', '401'] as const) {
      const { client, store } = ready(); cartStore.getState().add(product, 2); vi.mocked(api.accountCart).mockResolvedValueOnce({ version: 0, items: [] }); await store.getState().load()
      let resolve!: (value: any) => void, reject!: (value: Error) => void
      vi.mocked(api.cartOperation).mockReturnValueOnce(new Promise((yes, no) => { resolve = yes; reject = no }))
      const pending = store.getState().merge(); const op = vi.mocked(api.cartOperation).mock.calls.at(-1)![2]
      client.clear(); client.setQueryData(['session'], user('other'))
      if (outcome === 'success') resolve({ operationId: op.operationId, replayed: false, status: 'APPLIED', orderId: null, cart: { version: 1, items: [row(2)] } }); else reject(new ApiClientError({}, 401))
      await pending; expect(store.getState().scope?.id).toBe('other'); expect(store.getState().data).toBeNull(); expect(store.getState().error).toBe(''); expect(cartStore.getState().items.length).toBe(1)
      cartStore.getState().remove(7)
    }
  })
  it('checkout replay returns original order and preserves later form input; no second UUID after unknown', async () => {
    const { store } = ready(); vi.mocked(api.accountCart).mockResolvedValueOnce({ version: 2, items: [row(2)] }); await store.getState().load()
    cartStore.getState().setOrderForm({ orderTable: '  원문  ' }); vi.mocked(api.cartOperation).mockRejectedValueOnce(new ApiClientError({}, 0)); await store.getState().checkout()
    const intent = vi.mocked(api.cartOperation).mock.calls.at(-1)![2]; expect(intent.orderTable).toBe('  원문  ')
    cartStore.getState().setOrderForm({ orderTable: '다음 요청' }); expect(await store.getState().checkout()).toBeNull()
    vi.mocked(api.cartOperation).mockResolvedValueOnce({ operationId: intent.operationId, replayed: true, status: 'APPLIED', orderId: 90, cart: { version: 5, items: [row(1)] } })
    expect(await store.getState().retry()).toBe(90); expect(cartStore.getState().orderForm.orderTable).toBe('다음 요청'); expect(store.getState().data?.version).toBe(5)
  })
  it('same-auth freshness failures hide state; actual uncertain auth writes require a new authoritative read', async () => {
    const { client, store } = ready(); vi.mocked(api.accountCart).mockResolvedValueOnce({ version: 2, items: [row()] }); await store.getState().load()
    let fail!: (error: Error) => void; const read = client.fetchQuery({ queryKey: ['session'], queryFn: () => new Promise((_, reject) => { fail = reject }), retry: false })
    expect(store.getState().ready).toBe(false); fail(new Error('503')); await read.catch(() => {}); expect(store.getState().ready).toBe(false)
    await client.fetchQuery({ queryKey: ['session'], queryFn: async () => user() }); expect(store.getState().ready).toBe(true)
    useUi.setState({ pending: { logout: true } }); useUi.setState({ pending: {} }); expect(store.getState().ready).toBe(false); expect(store.getState().data).toBeNull()
    await client.fetchQuery({ queryKey: ['session'], queryFn: async () => user() }); expect(store.getState().ready).toBe(true)
  })
  it('a later login only reads an unresolved receipt, never POSTs into a recreated account', async () => {
    const { client, store } = ready(); cartStore.getState().add(product, 2); vi.mocked(api.accountCart).mockResolvedValue({ version: 0, items: [] }); await store.getState().load()
    vi.mocked(api.cartOperation).mockRejectedValueOnce(new ApiClientError({}, 0)); await store.getState().merge(); const intent = vi.mocked(api.cartOperation).mock.calls[0][2]
    client.clear(); client.setQueryData(['session'], user('other')); expect(store.getState().operation).toBeNull()
    client.clear(); client.setQueryData(['session'], user()); expect(store.getState().recoveryOnly).toBe(true)
    vi.mocked(api.cartOperationResult).mockRejectedValueOnce(new ApiClientError({}, 404)); await store.getState().retry()
    expect(api.cartOperation).toHaveBeenCalledTimes(1); expect(api.cartOperationResult).toHaveBeenCalledWith('member', intent.operationId); expect(cartStore.getState().items[0].quantity).toBe(2); expect(store.getState().operation).not.toBeNull(); expect(store.getState().resolveRequired).toBe(true)
    expect(api.resolveCartOperation).not.toHaveBeenCalled()
    vi.mocked(api.resolveCartOperation).mockResolvedValueOnce({ operationId: intent.operationId, replayed: false, status: 'RETIRED', orderId: null, cart: { version: 1, items: [] } }); await store.getState().resolve()
    expect(api.resolveCartOperation).toHaveBeenCalledWith('member', intent.operationId, { kind: 'MERGE', items: [{ productId: 7, quantity: 2 }], orderType: null, orderTable: null }); expect(cartStore.getState().items[0].quantity).toBe(2); expect(store.getState().operation).toBeNull()
  })
  it('guards unsaved quantity and order validity at the checkout function, not just the button', async () => {
    const { store } = ready(); vi.mocked(api.accountCart).mockResolvedValueOnce({ version: 2, items: [row(2)] }); await store.getState().load()
    store.getState().draft(7, '3'); await store.getState().checkout(); expect(api.cartOperation).not.toHaveBeenCalled(); expect(store.getState().drafts[7]).toBe('3')
    store.getState().draft(7, '2'); cartStore.getState().setOrderForm({ orderTable: '가'.repeat(21) }); await store.getState().checkout(); expect(api.cartOperation).not.toHaveBeenCalled()
  })
  it('an old add failure cannot re-announce the new account error or a success notice', async () => {
    const { client, store } = ready(); vi.mocked(api.accountCart).mockResolvedValueOnce({ version: 0, items: [] }); await store.getState().load()
    let reject!: (error: Error) => void; vi.mocked(api.setCartQuantity).mockReturnValueOnce(new Promise((_, fail) => { reject = fail }))
    const pending = store.getState().add(product)
    client.clear(); client.setQueryData(['session'], user('other')); vi.mocked(api.accountCart).mockRejectedValueOnce(new ApiClientError({}, 500)); await store.getState().load()
    useUi.getState().status('새 계정의 현재 알림'); reject(new ApiClientError({}, 401))
    expect(await pending).toBe(false); expect(useUi.getState().notice).toEqual({ type: 'success', message: '새 계정의 현재 알림' })
  })
  it('postcommit401 keeps the nonce and forces GET recovery even when the same auth query/id recovers', async () => {
    const { client, store } = ready(); cartStore.getState().add(product, 2); vi.mocked(api.accountCart).mockResolvedValueOnce({ version: 0, items: [] }); await store.getState().load()
    const auth = client.getQueryCache().find({ queryKey: ['session'], exact: true }); vi.mocked(api.cartOperation).mockRejectedValueOnce(new ApiClientError({}, 401)); await store.getState().merge()
    const intent = vi.mocked(api.cartOperation).mock.calls[0][2]
    expect(store.getState().ready).toBe(false); expect(store.getState().operation).not.toBeNull(); expect(store.getState().recoveryOnly).toBe(true)
    vi.mocked(api.me).mockResolvedValueOnce(user()); vi.mocked(api.accountCart).mockResolvedValueOnce({ version: 1, items: [row(2)] }); await store.getState().recheck()
    expect(client.getQueryCache().find({ queryKey: ['session'], exact: true })).toBe(auth); expect(store.getState().recoveryOnly).toBe(true)
    vi.mocked(api.cartOperationResult).mockResolvedValueOnce({ operationId: intent.operationId, replayed: true, status: 'APPLIED', cart: { version: 1, items: [row(2)] }, orderId: null }); await store.getState().retry()
    expect(api.cartOperation).toHaveBeenCalledTimes(1); expect(api.cartOperationResult).toHaveBeenCalledWith('member', intent.operationId); expect(cartStore.getState().items).toEqual([])
  })
})
