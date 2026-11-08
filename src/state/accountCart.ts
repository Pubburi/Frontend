import { useEffect } from 'react'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { useQueryClient, type QueryClient, type Query } from '@tanstack/react-query'
import { api, ApiClientError } from '../services/api'
import { readSession } from '../queries'
import { cartStore, normalizeQuantity, type CartSubmission } from './cart'
import { useUi } from './ui'
import type { AccountCart, CartIntentItem, Product, User } from '../types'

const authKeys = ['login', 'join', 'logout', 'settings-password']
const authPending = () => authKeys.some((key) => useUi.getState().pending[key])
type Scope = { auth: Query; id: string; role: string }
type Operation = { scope: Scope; kind: 'merge' | 'checkout'; resolveRequired?: boolean; payload: { operationId: string; expectedVersion: number; items: CartIntentItem[]; orderType?: string; orderTable?: string | null }; guest?: CartSubmission; form?: ReturnType<typeof cartStore.getState>['orderForm'] }
export function checkedCart(value: unknown): AccountCart {
  const cart = value as AccountCart
  if (!cart || !Number.isSafeInteger(cart.version) || cart.version < 0 || !Array.isArray(cart.items) || cart.items.length > 100) throw new Error('장바구니 응답을 확인하지 못했습니다.')
  const ids = new Set<number>()
  for (const item of cart.items) {
    if (!Number.isInteger(item.productId) || item.productId < 1 || ids.has(item.productId) || typeof item.productName !== 'string' ||
      !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 || item.currentProduct !== null &&
      (!item.currentProduct || item.currentProduct.id !== item.productId || typeof item.currentProduct.name !== 'string' || !Number.isInteger(item.currentProduct.price) || item.currentProduct.price < 0))
      throw new Error('장바구니 응답을 확인하지 못했습니다.')
    ids.add(item.productId)
  }
  return cart
}
interface State {
  scope: Scope | null; mode: 'account' | 'guest' | 'unknown'; ready: boolean; legacy: boolean
  data: AccountCart | null; loading: boolean; pending: boolean; blocked: boolean; error: string; operation: Operation | null
  recoveryOnly: boolean; resolveRequired: boolean; recoveryMessage: string; confirmedOrderId: number | null
  drafts: Record<number, string>; draft: (productId: number, value: string) => void
  load: () => Promise<void>; recheck: () => Promise<void>
  rejectAuth: (scope: Scope) => void
  add: (product: Product, quantity?: number) => Promise<boolean>
  quantity: (productId: number, value: number) => Promise<void>; remove: (productId: number | null) => Promise<void>
  merge: () => Promise<number | null>; checkout: () => Promise<number | null>; retry: () => Promise<number | null>; resolve: () => Promise<null>
}
const stores = new WeakMap<QueryClient, ReturnType<typeof createAccountCart>>()
export function createAccountCart(client: QueryClient) {
  const cache = client.getQueryCache()
  // These locks follow actual HTTP completion, even if an auth transition clears the UI cache.
  const writes = new Map<string, Promise<unknown>>()
  // An unresolved POST may have committed. Keep its descriptor in this tab only,
  // separate from visible auth scope. A later login can only GET its receipt.
  const recoveries = new Map<string, Operation>()
  let loading: { scope: Scope; promise: Promise<void> } | null = null
  let readSequence = 0
  const started = new WeakMap<Query, number>(), completed = new WeakMap<Query, number>()
  let fence: { auth: Query | undefined; sequence: number } | null = null
  const store = createStore<State>((set, get) => {
    const owns = (scope: Scope) => get().scope === scope && get().ready && !authPending() && cache.find({ queryKey: ['session'], exact: true }) === scope.auth &&
      scope.auth.state.status === 'success' && scope.auth.state.fetchStatus === 'idle' && (scope.auth.state.data as User | null)?.id === scope.id
    function publish(scope: Scope, cart: AccountCart) {
      if (owns(scope)) set((state) => {
        if (state.data && cart.version < state.data.version) return {}
        const drafts = Object.fromEntries(cart.items.map((item) => {
          const previous = state.data?.items.find((row) => row.productId === item.productId)
          const draft = state.drafts[item.productId]
          return [item.productId, draft !== undefined && (!previous || draft !== String(previous.quantity)) ? draft : String(item.quantity)]
        }))
        return { data: cart, drafts, error: '', blocked: false }
      })
    }
    function failed(scope: Scope, error: unknown, uncertain = false) {
      if (!owns(scope)) return
      const status = error instanceof ApiClientError ? error.status : 0
      const message = status === 409 ? '다른 곳의 변경이나 상품 상태 때문에 반영하지 못했습니다. 입력은 남겨 두었습니다. 최신 장바구니를 확인해 주세요.' : status === 400 ? '수량·상품과 입력 내용을 확인해 주세요. 한 상품은 최대99개입니다.' :
        uncertain ? '결과를 확인하지 못했습니다. 같은 작업 확인으로 중복 없이 다시 확인하거나 최신 장바구니를 읽어 주세요.' : '계정 장바구니를 확인하지 못했습니다. 기기에 담은 상품과 요청 사항은 유지됩니다.'
      if (status === 401) {
        fence = { auth: scope.auth, sequence: readSequence }
        set({ ready: false, data: null, recoveryOnly: !!get().operation, error: '로그인 상태가 바뀌어 계정 장바구니를 표시하지 않았습니다.', blocked: true })
      } else set({ error: message, blocked: true })
    }
    async function load() {
      const scope = get().scope
      if (!scope || !owns(scope)) return
      if (loading?.scope === scope) return loading.promise
      set({ loading: true, error: '' })
      const promise = (async () => {
        try {
          await writes.get(scope.id)
          if (!owns(scope)) return
          publish(scope, checkedCart(await api.accountCart(scope.id)))
        } catch (error) {
          if (owns(scope) && !get().operation && error instanceof ApiClientError && error.status === 404 && error.code === 'CART_NOT_SUPPORTED') set({ legacy: true, data: null, error: '', blocked: false })
          else failed(scope, error)
        } finally { if (get().scope === scope) set({ loading: false }); if (loading?.scope === scope) loading = null }
      })()
      loading = { scope, promise }; return promise
    }
    async function change(action: (scope: Scope, cart: AccountCart) => Promise<AccountCart>): Promise<boolean> {
      const scope = get().scope
      if (!scope || !owns(scope) || get().blocked || get().pending || get().loading || get().operation || writes.has(scope.id)) return false
      if (!get().data) await load()
      if (!owns(scope) || !get().data || get().legacy || get().blocked || writes.has(scope.id)) return false
      set({ pending: true, error: '' })
      const request = (async () => {
        try { const result = checkedCart(await action(scope, get().data!)); if (!owns(scope)) return false; publish(scope, result); return true }
        catch (error) { failed(scope, error, true); return false }
        finally { if (get().scope === scope) set({ pending: false }) }
      })()
      writes.set(scope.id, request)
      try { return await request } finally { if (writes.get(scope.id) === request) writes.delete(scope.id) }
    }
    async function operation(op: Operation): Promise<number | null> {
      const scope = get().scope
      if (!scope || op.scope !== scope || !owns(scope) || writes.has(scope.id)) return null
      recoveries.set(scope.id, op)
      set({ pending: true, error: '', operation: op, recoveryOnly: false, resolveRequired: false, recoveryMessage: '', confirmedOrderId: null })
      const request = (async () => {
        try {
          const result = await api.cartOperation(scope.id, op.kind, op.payload)
          const cart = checkedCart(result.cart)
          if (result.operationId !== op.payload.operationId || result.status !== 'APPLIED' || typeof result.replayed !== 'boolean' ||
            (op.kind === 'merge' ? result.orderId !== null : !Number.isSafeInteger(result.orderId) || result.orderId! < 1)) throw new Error('처리 결과를 확인하지 못했습니다.')
          if (!owns(scope)) return null
          publish(scope, cart)
          if (op.guest) cartStore.getState().consume(op.guest)
          if (op.form) cartStore.getState().finishForm(op.form)
          if (recoveries.get(scope.id) === op) recoveries.delete(scope.id)
          set({ operation: null, recoveryOnly: false, resolveRequired: false })
          useUi.getState().status(op.kind === 'merge' ? '기기 장바구니를 계정에 합쳤습니다.' : '주문이 접수되었습니다.')
          if (op.kind === 'checkout') {
            void client.invalidateQueries({ queryKey: ['account', scope.id] })
            void client.invalidateQueries({ queryKey: ['catalog', 'popular'] })
          }
          return result.orderId
        } catch (error) {
          if (owns(scope)) {
            const status = error instanceof ApiClientError ? error.status : 0
            // The provider can return401 from its post-commit session check.
            if ([400, 403, 404, 409].includes(status)) { if (recoveries.get(scope.id) === op) recoveries.delete(scope.id); set({ operation: null, recoveryOnly: false, resolveRequired: false }) }
            failed(scope, error, true)
          }
          return null
        } finally { if (get().scope === scope) set({ pending: false }) }
      })()
      writes.set(scope.id, request)
      try { return await request } finally { if (writes.get(scope.id) === request) writes.delete(scope.id) }
    }
    async function receipt(op: Operation, retire = false): Promise<null> {
      const scope = get().scope
      if (!scope || !owns(scope) || get().pending || recoveries.get(scope.id) !== op) return null
      set({ pending: true, error: '' })
      if (retire) { op.resolveRequired = true; set({ resolveRequired: true }) }
      try {
        await writes.get(scope.id)
        if (!owns(scope)) return null
        const result = retire ? await api.resolveCartOperation(scope.id, op.payload.operationId, { kind: op.kind === 'merge' ? 'MERGE' : 'CHECKOUT', items: op.payload.items,
          orderType: op.payload.orderType ?? null, orderTable: op.payload.orderTable ?? null }) : await api.cartOperationResult(scope.id, op.payload.operationId)
        const cart = checkedCart(result.cart)
        if (result.operationId !== op.payload.operationId || typeof result.replayed !== 'boolean' || !retire && result.replayed !== true ||
          !['APPLIED', 'RETIRED'].includes(result.status) ||
          (result.status === 'RETIRED' || op.kind === 'merge' ? result.orderId !== null : !Number.isSafeInteger(result.orderId) || result.orderId! < 1)) throw new Error('이전 작업의 결과를 확인하지 못했습니다.')
        if (!owns(scope) || recoveries.get(scope.id) !== op) return null
        publish(scope, cart)
        if (result.status === 'APPLIED' && op.guest) cartStore.getState().consume(op.guest)
        // A new login does not restore the old form's ownership or redirect intent.
        recoveries.delete(scope.id)
        set({ operation: null, recoveryOnly: false, resolveRequired: false, confirmedOrderId: result.orderId,
          recoveryMessage: result.status === 'RETIRED' ? '이전 작업을 안전하게 종료했습니다. 기기 원본과 현재 요청은 유지됩니다. 원하면 새 병합이나 주문을 직접 선택해 주세요.' :
            op.kind === 'merge' ? '이전 병합의 접수를 확인했습니다. 새로 병합하지 않았습니다.' : `이전 주문 #${result.orderId}의 접수를 확인했습니다. 새 주문을 만들지 않았습니다.` })
      } catch (error) {
        if (owns(scope)) {
          if (error instanceof ApiClientError && error.status === 404) {
            // A read404 does not prove that an admitted POST cannot commit later.
            op.resolveRequired = true
            set({ resolveRequired: true, blocked: true, recoveryMessage: '이전 작업의 접수 내역이 아직 없습니다. 전송 중일 수 있어 새 작업을 막았습니다. 안전 종료·결과 확인으로 먼저 이전 작업을 정리해 주세요.' })
          } else failed(scope, error, true)
        }
      } finally { if (get().scope === scope) set({ pending: false }) }
      return null
    }
    const canSubmit = () => get().ready && !!get().scope && !!get().data && !get().pending && !get().loading && !get().blocked && !get().operation
    return {
      scope: null, mode: 'unknown', ready: false, legacy: false, data: null, loading: false, pending: false, blocked: false, error: '', operation: null, drafts: {}, recoveryOnly: false, resolveRequired: false, recoveryMessage: '', confirmedOrderId: null,
      draft: (id, value) => set((state) => ({ drafts: { ...state.drafts, [id]: value } })),
      load,
      async recheck() {
        if (authPending()) return
        const auth = cache.find({ queryKey: ['session'], exact: true })
        try { await client.fetchQuery({ queryKey: ['session'], queryFn: readSession, staleTime: 0 }); await load() }
        catch { if (cache.find({ queryKey: ['session'], exact: true }) === auth && !authPending()) set({ error: '로그인 상태를 확인하지 못했습니다. 입력은 유지됩니다.' }) }
      },
      rejectAuth: (scope) => failed(scope, new ApiClientError({}, 401)),
      async add(product, amount = 1) {
        const state = get(), quantity = normalizeQuantity(amount)
        if (state.mode === 'guest' || state.mode === 'unknown' && !state.scope || state.legacy) { cartStore.getState().add(product, quantity); return true }
        if (!state.ready) { useUi.getState().error(new Error('로그인 상태를 확인한 뒤 다시 담아 주세요.')); return false }
        if (!state.data) await load()
        if (get().scope !== state.scope || !get().ready) return false
        if (get().legacy) { cartStore.getState().add(product, quantity); return true }
        const saved = await change(async (scope, cart) => {
          const next = (cart.items.find((item) => item.productId === product.id)?.quantity ?? 0) + quantity
          if (next > 99) throw new ApiClientError({ message: '한 상품은 최대99개까지 담을 수 있습니다.' }, 400)
          return api.setCartQuantity(scope.id, product.id, next, cart.version)
        })
        if (get().scope !== state.scope || !get().ready) return false
        if (!saved && get().error) useUi.getState().error(new Error(get().error))
        return saved
      },
      async quantity(id, quantity) { await change((scope, cart) => api.setCartQuantity(scope.id, id, quantity, cart.version)) },
      async remove(id) { await change((scope, cart) => api.removeCartItems(scope.id, id, cart.version)) },
      async merge() {
        if (!canSubmit()) return null
        const guest = cartStore.getState().snapshot()
        if (!guest.items.length) return null
        return operation({ scope: get().scope!, kind: 'merge', guest, payload: { operationId: crypto.randomUUID(), expectedVersion: get().data!.version, items: guest.items.map(({ productId, quantity }) => ({ productId, quantity })) } })
      },
      async checkout() {
        if (!canSubmit() || !get().data!.items.length || get().data!.items.some((item) => !item.currentProduct)) return null
        if (get().data!.items.some((item) => Number(get().drafts[item.productId] ?? item.quantity) !== item.quantity)) return null
        const form = cartStore.getState().orderForm
        if (Array.from(form.orderTable).length > 20 || !['TAKEOUT', 'ONLINE', 'OFFLINE'].includes(form.orderType)) {
          useUi.getState().error(new Error('주문 방식과 요청 사항을 확인해 주세요. 요청은20자까지 입력할 수 있습니다.')); return null
        }
        return operation({ scope: get().scope!, kind: 'checkout', form, payload: { operationId: crypto.randomUUID(), expectedVersion: get().data!.version,
          items: get().data!.items.map(({ productId, quantity }) => ({ productId, quantity })), orderType: form.orderType, orderTable: form.orderTable } })
      },
      retry: async () => get().operation ? get().resolveRequired ? receipt(get().operation!, true) : get().recoveryOnly ? receipt(get().operation!) : operation(get().operation!) : null,
      resolve: async () => get().operation ? receipt(get().operation!, true) : null,
    }
  })
  function sync() {
    const query = cache.find({ queryKey: ['session'], exact: true }), state = store.getState()
    if (!query) { if (state.scope || state.mode !== 'unknown') store.setState({ scope: null, mode: 'unknown', ready: false, legacy: false, data: null, operation: null, recoveryOnly: false, resolveRequired: false, recoveryMessage: '', confirmedOrderId: null, drafts: {}, error: '', pending: false, loading: false, blocked: false }); return }
    if (authPending()) { if (state.scope || state.ready) store.setState({ scope: null, mode: 'unknown', ready: false, data: null, operation: null, recoveryOnly: false, resolveRequired: false, recoveryMessage: '', confirmedOrderId: null, drafts: {}, pending: false, loading: false }); return }
    if (query.state.status !== 'success' || query.state.fetchStatus !== 'idle') { if (state.ready) store.setState({ ready: false }); return }
    if (fence) {
      if (query === fence.auth && (completed.get(query) ?? -1) <= fence.sequence) { if (state.ready) store.setState({ ready: false }); return }
      fence = null
    }
    const user = query.state.data as User | null
    if (user === null) { if (state.mode !== 'guest' || !state.ready) store.setState({ scope: null, mode: 'guest', ready: true, data: null, operation: null, recoveryOnly: false, resolveRequired: false, recoveryMessage: '', confirmedOrderId: null, drafts: {}, legacy: false, error: '', blocked: false, pending: false, loading: false }); return }
    if (!user || typeof user.id !== 'string') return
    if (state.scope?.auth === query && state.scope.id === user.id && state.scope.role === user.role) { if (!state.ready) store.setState({ ready: true }); return }
    const recovery = recoveries.get(user.id) ?? null
    store.setState({ scope: { auth: query, id: user.id, role: user.role }, mode: 'account', ready: true, legacy: false, data: null, operation: recovery, recoveryOnly: !!recovery, resolveRequired: !!recovery?.resolveRequired, recoveryMessage: '', confirmedOrderId: null, drafts: {}, pending: false, loading: false, blocked: false, error: '' })
  }
  cache.subscribe((event) => {
    if (event.query.queryKey.length !== 1 || event.query.queryKey[0] !== 'session') return
    if (event.type === 'updated' && event.action.type === 'fetch') started.set(event.query, ++readSequence)
    if (event.type === 'updated' && event.action.type === 'success' && !event.action.manual) completed.set(event.query, started.get(event.query) ?? 0)
    sync()
  })
  useUi.subscribe((state, before) => {
    const previous = authKeys.some((key) => before.pending[key]), next = authKeys.some((key) => state.pending[key])
    if (!previous && next) fence = { auth: cache.find({ queryKey: ['session'], exact: true }), sequence: readSequence }
    if (previous && !next && fence) fence.sequence = readSequence
    if (previous !== next) sync()
  })
  sync(); return store
}
export function accountCart(client: QueryClient) {
  let store = stores.get(client)
  if (!store) { store = createAccountCart(client); stores.set(client, store) }
  return store
}
export function useAccountCart(load = false) {
  const state = useStore(accountCart(useQueryClient()))
  useEffect(() => { if (load && state.mode === 'account' && state.ready && !state.legacy) void state.load() }, [load, state.scope, state.mode, state.ready, state.legacy, state.load])
  return state
}
