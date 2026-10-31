import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { api } from '../services/api'
import { normalizeCart, useCartStore } from './cart'

vi.mock('../services/api', () => ({ api: { createOrder: vi.fn() } }))

describe('cart store', () => {
  beforeEach(() => {
    const storage = new Map()
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key) => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
        clear: () => storage.clear(),
      },
      configurable: true,
    })
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('adds, persists, and removes cart items', () => {
    const cart = useCartStore()
    const product = { id: 1, name: '탁주', price: 1000 }

    cart.add(product)
    cart.add(product)

    expect(cart.count).toBe(2)
    expect(cart.total).toBe(2000)
    expect(JSON.parse(localStorage.getItem('pubburi-cart'))[0].quantity).toBe(2)

    cart.remove(1)

    expect(cart.items).toEqual([])
  })

  it('accepts a quantity, clamps updates, and rejects malformed saved values', () => {
    expect(normalizeCart([{ product: { id: 1, price: 1000 }, quantity: 500 }, { broken: true }])).toEqual([
      { product: { id: 1, price: 1000 }, quantity: 99 },
    ])

    const cart = useCartStore()
    cart.add({ id: 1, name: '맥주', price: 2000 }, 3)
    cart.setQuantity(1, 0)
    expect(cart.items[0].quantity).toBe(1)
    cart.setQuantity(1, 120)
    expect(cart.items[0].quantity).toBe(99)
  })

  it('submits normalized order details and clears only after success', async () => {
    api.createOrder.mockResolvedValue({ oId: 10 })
    const cart = useCartStore()
    cart.add({ id: 2, name: '사케', price: 5000 }, 2)

    await expect(cart.checkout('id01')).resolves.toEqual({ oId: 10 })
    expect(api.createOrder).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'id01',
      details: [{ productId: 2, quantity: 2 }],
    }))
    expect(cart.items).toEqual([])
  })
})
