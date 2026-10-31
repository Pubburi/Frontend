import { defineStore } from 'pinia'
import { api } from '../services/api'

export const MAX_CART_QUANTITY = 99

export function normalizeQuantity(value) {
  const quantity = Math.trunc(Number(value))
  if (!Number.isFinite(quantity)) return 1
  return Math.min(MAX_CART_QUANTITY, Math.max(1, quantity))
}

export function normalizeCart(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => item?.product && Number.isInteger(Number(item.product.id)) && Number(item.product.price) >= 0)
    .map((item) => ({ product: item.product, quantity: normalizeQuantity(item.quantity) }))
}

function readCart() {
  try {
    return normalizeCart(JSON.parse(localStorage.getItem('pubburi-cart') || '[]'))
  } catch {
    return []
  }
}

export const useCartStore = defineStore('cart', {
  state: () => ({
    items: readCart(),
    orderForm: { orderType: 'TAKEOUT', orderTable: '' },
  }),
  getters: {
    count: (state) => state.items.reduce((sum, item) => sum + item.quantity, 0),
    total: (state) => state.items.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0),
  },
  actions: {
    add(product, quantity = 1) {
      const amount = normalizeQuantity(quantity)
      const existing = this.items.find((item) => item.product.id === product.id)
      if (existing) {
        existing.quantity = Math.min(MAX_CART_QUANTITY, existing.quantity + amount)
      } else {
        this.items.push({ product, quantity: amount })
      }
      this.persist()
    },
    setQuantity(productId, quantity) {
      const item = this.items.find((entry) => entry.product.id === productId)
      if (!item) return
      item.quantity = normalizeQuantity(quantity)
      this.persist()
    },
    increment(productId) {
      const item = this.items.find((entry) => entry.product.id === productId)
      if (item) this.setQuantity(productId, item.quantity + 1)
    },
    decrement(productId) {
      const item = this.items.find((entry) => entry.product.id === productId)
      if (item) this.setQuantity(productId, item.quantity - 1)
    },
    remove(productId) {
      this.items = this.items.filter((item) => item.product.id !== productId)
      this.persist()
    },
    persist() {
      this.items = normalizeCart(this.items)
      localStorage.setItem('pubburi-cart', JSON.stringify(this.items))
    },
    async checkout(userId) {
      const order = await api.createOrder({
        userId,
        orderType: this.orderForm.orderType,
        orderTable: this.orderForm.orderTable.trim(),
        details: this.items.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
      })
      this.items = []
      this.persist()
      this.orderForm.orderTable = ''
      return order
    },
  },
})
