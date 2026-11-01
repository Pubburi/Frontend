import { describe, expect, it, vi } from 'vitest'
import { createCartStore, cartTotals, normalizeCart, CART_KEY } from './cart'
import { api } from '../services/api'
import type { Order, Product } from '../types'

vi.mock('../services/api', () => ({ api: { createOrder: vi.fn() } }))
const product: Product = {
  id: 1,
  name: '시험 탁주',
  type: '탁주',
  price: 6000,
  abv: 6,
  orderCount: 0,
}
function storage(value = '[]') {
  const values = new Map([[CART_KEY, value]])
  return {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}
describe('Zustand cart migration', () => {
  it('restores the existing Vue raw-array storage and clamps invalid quantities', () => {
    const saved = storage(
      JSON.stringify([{ product, quantity: 500 }, { broken: true }]),
    )
    const cart = createCartStore(saved)
    expect(cart.getState().items).toEqual([{ product, quantity: 99 }])
    expect(createCartStore(storage('{bad')).getState().items).toEqual([])
    expect(normalizeCart(null)).toEqual([])
  })
  it('adds, changes, persists and removes items with the same storage key', () => {
    const saved = storage()
    const cart = createCartStore(saved)
    cart.getState().add(product, 2)
    cart.getState().add(product)
    expect(cartTotals(cart.getState().items)).toEqual({
      count: 3,
      total: 18000,
    })
    cart.getState().setQuantity(1, -1)
    expect(JSON.parse(saved.getItem(CART_KEY)!)[0].quantity).toBe(1)
    cart.getState().remove(1)
    expect(saved.getItem(CART_KEY)).toBe('[]')
  })
  it('preserves cart and request details on order failure', async () => {
    const cart = createCartStore(storage())
    cart.getState().add(product, 2)
    cart
      .getState()
      .setOrderForm({ orderType: 'OFFLINE', orderTable: '  3번 테이블  ' })
    vi.mocked(api.createOrder).mockRejectedValueOnce(new Error('주문 실패'))
    await expect(cart.getState().checkout('member')).rejects.toThrow(
      '주문 실패',
    )
    expect(cart.getState().items).toHaveLength(1)
    expect(cart.getState().orderForm.orderTable).toBe('  3번 테이블  ')
    expect(api.createOrder).toHaveBeenLastCalledWith({
      userId: 'member',
      orderType: 'OFFLINE',
      orderTable: '3번 테이블',
      details: [{ productId: 1, quantity: 2 }],
    })
  })
  it('clears persisted items only after the server accepts the order', async () => {
    const saved = storage()
    const cart = createCartStore(saved)
    cart.getState().add(product)
    let release: (value: unknown) => void = () => {}
    vi.mocked(api.createOrder).mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    const pending = cart.getState().checkout('member')
    expect(cart.getState().items).toHaveLength(1)
    release({ oId: 1, totalPrice: 6000 })
    await pending
    expect(cart.getState().items).toEqual([])
    expect(saved.getItem(CART_KEY)).toBe('[]')
  })

  it('keeps in-memory edits usable when browser storage rejects writes and recovers later', () => {
    let blocked = true
    const saved = {
      getItem: () => null,
      setItem: vi.fn(() => {
        if (blocked) throw new Error('blocked storage')
      }),
    }
    const cart = createCartStore(saved)
    expect(() => cart.getState().add(product, 2)).not.toThrow()
    expect(cartTotals(cart.getState().items)).toEqual({
      count: 2,
      total: 12000,
    })
    expect(cart.getState().storageWarning).toBe(true)
    cart.getState().setQuantity(product.id, 3)
    expect(cart.getState().items[0].quantity).toBe(3)
    expect(saved.setItem).toHaveBeenCalledTimes(2)
    blocked = false
    cart.getState().add(product)
    expect(cart.getState().storageWarning).toBe(false)
    expect(JSON.parse(saved.setItem.mock.calls.at(-1)![1])[0].quantity).toBe(4)
    blocked = true
    cart.getState().remove(product.id)
    expect(cart.getState().items).toEqual([])
    expect(cart.getState().storageWarning).toBe(true)
  })

  it('returns a successful order and clears memory even when persistence fails', async () => {
    vi.mocked(api.createOrder).mockClear()
    const saved = {
      getItem: () => JSON.stringify([{ product, quantity: 2 }]),
      setItem: vi.fn(() => {
        throw new Error('quota exceeded')
      }),
    }
    const cart = createCartStore(saved)
    cart.getState().setOrderForm({ orderTable: '3번' })
    vi.mocked(api.createOrder).mockResolvedValueOnce({
      oId: 20,
      totalPrice: 12000,
    })
    await expect(cart.getState().checkout('member')).resolves.toEqual({
      oId: 20,
      totalPrice: 12000,
    })
    expect(cart.getState().items).toEqual([])
    expect(cart.getState().orderForm.orderTable).toBe('')
    expect(cart.getState().storageWarning).toBe(true)
    expect(api.createOrder).toHaveBeenCalledTimes(1)
    expect(saved.setItem).toHaveBeenCalledTimes(1)
  })

  it('does not clear or persist again when the server rejects an order in a storage-limited browser', async () => {
    vi.mocked(api.createOrder).mockClear()
    const saved = {
      getItem: () => JSON.stringify([{ product, quantity: 2 }]),
      setItem: vi.fn(() => {
        throw new Error('blocked storage')
      }),
    }
    const cart = createCartStore(saved)
    vi.mocked(api.createOrder).mockRejectedValueOnce(
      new Error('server rejected'),
    )
    await expect(cart.getState().checkout('member')).rejects.toThrow(
      'server rejected',
    )
    expect(cart.getState().items).toEqual([{ product, quantity: 2 }])
    expect(saved.setItem).not.toHaveBeenCalled()
    expect(api.createOrder).toHaveBeenCalledTimes(1)
  })

  it('can run without an accessible storage object or readable saved values', () => {
    const unavailable = createCartStore(null)
    unavailable.getState().add(product)
    expect(unavailable.getState().items).toHaveLength(1)
    expect(unavailable.getState().storageWarning).toBe(true)
    const deniedRead = {
      getItem: () => {
        throw new Error('read denied')
      },
      setItem: vi.fn(),
    }
    const recovered = createCartStore(deniedRead)
    expect(recovered.getState().items).toEqual([])
    expect(recovered.getState().storageWarning).toBe(true)
    recovered.getState().add(product)
    expect(recovered.getState().storageWarning).toBe(false)
  })

  it('접수한 수량만 차감하고 이후 같은 상품 추가분·새 상품·새 요청사항을 남긴다', async () => {
    vi.mocked(api.createOrder).mockClear()
    const saved = storage()
    const cart = createCartStore(saved)
    cart.getState().add(product, 2)
    cart.getState().setOrderForm({ orderTable: '제출한 요청' })
    let release!: (order: Order) => void
    vi.mocked(api.createOrder).mockReturnValueOnce(new Promise((resolve) => { release = resolve }))
    const pending = cart.getState().checkout('member')
    const nextProduct = { ...product, id: 2, name: '다음 상품' }
    cart.getState().add(product, 1)
    cart.getState().add(nextProduct, 3)
    cart.getState().setOrderForm({ orderType: 'OFFLINE', orderTable: '다음 요청' })
    release({ oId: 30 } as Order)
    await pending
    expect(api.createOrder).toHaveBeenCalledTimes(1)
    expect(api.createOrder).toHaveBeenLastCalledWith({ userId: 'member', orderType: 'TAKEOUT', orderTable: '제출한 요청', details: [{ productId: 1, quantity: 2 }] })
    expect(cart.getState().items).toEqual([{ product, quantity: 1 }, { product: nextProduct, quantity: 3 }])
    expect(cart.getState().orderForm).toEqual({ orderType: 'OFFLINE', orderTable: '다음 요청' })
    expect(JSON.parse(saved.getItem(CART_KEY)!)).toEqual(cart.getState().items)
  })

  it('전송 뒤 삭제했다 다시 담은 상품은 새 행으로 보존한다', async () => {
    const cart = createCartStore(storage())
    cart.getState().add(product, 2)
    let release!: (order: Order) => void
    vi.mocked(api.createOrder).mockReturnValueOnce(new Promise((resolve) => { release = resolve }))
    const pending = cart.getState().checkout('member')
    cart.getState().remove(product.id)
    cart.getState().add(product, 2)
    release({ oId: 31 } as Order)
    await pending
    expect(cart.getState().items).toEqual([{ product, quantity: 2 }])
  })

  it('제출량보다 줄어든 기존 행은 음수 없이 정리하고 관계없는 새 행은 보존한다', async () => {
    const cart = createCartStore(storage())
    cart.getState().add(product, 2)
    let release!: (order: Order) => void
    vi.mocked(api.createOrder).mockReturnValueOnce(new Promise((resolve) => { release = resolve }))
    const pending = cart.getState().checkout('member')
    cart.getState().setQuantity(product.id, 1)
    const nextProduct = { ...product, id: 2 }
    cart.getState().add(nextProduct)
    release({ oId: 32 } as Order)
    await pending
    expect(cart.getState().items).toEqual([{ product: nextProduct, quantity: 1 }])
  })

  it('전송 뒤 같은 값으로 다시 작성한 요청사항도 새 폼의 의도로 보존한다', async () => {
    const cart = createCartStore(storage())
    cart.getState().add(product)
    cart.getState().setOrderForm({ orderTable: '동일한 요청' })
    let release!: (order: Order) => void
    vi.mocked(api.createOrder).mockReturnValueOnce(new Promise((resolve) => { release = resolve }))
    const pending = cart.getState().checkout('member')
    cart.getState().setOrderForm({ orderTable: '임시 수정' })
    cart.getState().setOrderForm({ orderTable: '동일한 요청' })
    release({ oId: 33 } as Order)
    await pending
    expect(cart.getState().items).toEqual([])
    expect(cart.getState().orderForm.orderTable).toBe('동일한 요청')
  })

  it('전송 거절은 대기 중 추가·수정한 장바구니와 요청사항도 그대로 남긴다', async () => {
    const saved = storage()
    const cart = createCartStore(saved)
    cart.getState().add(product, 2)
    let reject!: (error: Error) => void
    vi.mocked(api.createOrder).mockReturnValueOnce(new Promise((_, fail) => { reject = fail }))
    const pending = cart.getState().checkout('member')
    cart.getState().add(product)
    cart.getState().setOrderForm({ orderTable: '재시도 요청' })
    reject(new Error('주문 거절'))
    await expect(pending).rejects.toThrow('주문 거절')
    expect(cart.getState().items).toEqual([{ product, quantity: 3 }])
    expect(cart.getState().orderForm.orderTable).toBe('재시도 요청')
    expect(JSON.parse(saved.getItem(CART_KEY)!)[0].quantity).toBe(3)
  })

})
