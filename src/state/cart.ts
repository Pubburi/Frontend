import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { api } from '../services/api'
import type { Order, Product } from '../types'

export const MAX_CART_QUANTITY = 99
export const CART_KEY = 'pubburi-cart'
export interface CartItem {
  product: Product
  quantity: number
}
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>
export function normalizeQuantity(value: unknown) {
  const quantity = Math.trunc(Number(value))
  return Number.isFinite(quantity)
    ? Math.min(MAX_CART_QUANTITY, Math.max(1, quantity))
    : 1
}
export function normalizeCart(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (item) =>
        item?.product &&
        Number.isInteger(Number(item.product.id)) &&
        Number(item.product.price) >= 0,
    )
    .map((item) => ({
      product: item.product,
      quantity: normalizeQuantity(item.quantity),
    }))
}
interface CartState {
  items: CartItem[]
  storageWarning: boolean
  orderForm: { orderType: string; orderTable: string }
  add: (product: Product, quantity?: number) => void
  setQuantity: (id: number, value: unknown) => void
  remove: (id: number) => void
  setOrderForm: (value: Partial<CartState['orderForm']>) => void
  checkout: (userId: string) => Promise<Order>
}
export function createCartStore(storage: Storage | null) {
  let restored: CartItem[] = []
  let raw: string | null = null
  let storageWarning = storage === null
  try {
    raw = storage?.getItem(CART_KEY) ?? null
  } catch {
    storageWarning = true
  }
  try {
    restored = normalizeCart(JSON.parse(raw || '[]'))
  } catch {
    /* corrupted legacy storage */
  }
  return createStore<CartState>()((set, get) => {
    const lineOwners = new Map(restored.map((item) => [item.product.id, Symbol()]))
    function save(items: CartItem[]) {
      const normalized = normalizeCart(items)
      set({ items: normalized })
      try {
        if (!storage) {
          set({ storageWarning: true })
          return
        }
        storage.setItem(CART_KEY, JSON.stringify(normalized))
        set({ storageWarning: false })
      } catch {
        // Browser persistence is optional; it cannot reject a completed server order.
        set({ storageWarning: true })
      }
    }
    return {
      items: restored,
      storageWarning,
      orderForm: { orderType: 'TAKEOUT', orderTable: '' },
      add(product, quantity = 1) {
        const amount = normalizeQuantity(quantity)
        const items = get().items
        if (!items.some((item) => item.product.id === product.id))
          lineOwners.set(product.id, Symbol())
        save(
          items.some((item) => item.product.id === product.id)
            ? items.map((item) =>
                item.product.id === product.id
                  ? { ...item, quantity: Math.min(99, item.quantity + amount) }
                  : item,
              )
            : [...items, { product, quantity: amount }],
        )
      },
      setQuantity(id, value) {
        save(
          get().items.map((item) =>
            item.product.id === id
              ? { ...item, quantity: normalizeQuantity(value) }
              : item,
          ),
        )
      },
      remove(id) {
        lineOwners.delete(id)
        save(get().items.filter((item) => item.product.id !== id))
      },
      setOrderForm(value) {
        set({ orderForm: { ...get().orderForm, ...value } })
      },
      async checkout(userId) {
        const { items, orderForm } = get()
        const submitted = new Map(
          items.map((item) => [
            item.product.id,
            { quantity: item.quantity, owner: lineOwners.get(item.product.id) },
          ]),
        )
        const order = await api.createOrder({
          userId,
          orderType: orderForm.orderType,
          orderTable: orderForm.orderTable.trim(),
          details: items.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
          })),
        })
        save(
          get().items.flatMap((item) => {
            const original = submitted.get(item.product.id)
            if (!original || lineOwners.get(item.product.id) !== original.owner)
              return [item]
            const quantity = Math.max(0, item.quantity - original.quantity)
            if (quantity > 0) return [{ ...item, quantity }]
            lineOwners.delete(item.product.id)
            return []
          }),
        )
        if (get().orderForm === orderForm)
          set({ orderForm: { ...orderForm, orderTable: '' } })
        return order
      },
    }
  })
}
function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
const cartStore = createCartStore(browserStorage())
export const useCart = () => useStore(cartStore)
export const cartTotals = (items: CartItem[]) => ({
  count: items.reduce((sum, item) => sum + item.quantity, 0),
  total: items.reduce(
    (sum, item) => sum + Number(item.product.price) * item.quantity,
    0,
  ),
})
