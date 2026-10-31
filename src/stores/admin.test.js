import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAdminStore } from './admin'
import { api } from '../services/api'

vi.mock('../services/api', () => ({
  api: {
    products: vi.fn(),
    markets: vi.fn(),
    adminOrders: vi.fn(),
    adminComments: vi.fn(),
    adminUsers: vi.fn(),
    completeOrder: vi.fn(),
    deleteOrder: vi.fn(),
    deleteComment: vi.fn(),
    deleteUser: vi.fn(),
    updateUser: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    deleteProduct: vi.fn(),
    createMarket: vi.fn(),
    updateMarket: vi.fn(),
    deleteMarket: vi.fn(),
  },
}))

const page = (items = []) => ({ items, page: 1, size: 20, total: items.length, totalPages: 1, hasNext: false })

describe('admin store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    api.adminOrders.mockResolvedValue(page([{ oId: 1 }]))
    api.adminComments.mockResolvedValue(page([{ id: 1 }]))
    api.adminUsers.mockResolvedValue(page([{ id: 'id01' }]))
    api.products.mockResolvedValue(page([{ id: 2, name: '맥주' }]))
    api.markets.mockResolvedValue(page([{ id: 3, name: '구미점' }]))
  })

  it('loads only the active admin tab data', async () => {
    const admin = useAdminStore()
    admin.tab = 'comments'

    await admin.loadActive({ page: 2 })

    expect(api.adminComments).toHaveBeenCalledWith({ page: 2, size: 20 })
    expect(api.adminOrders).not.toHaveBeenCalled()
    expect(api.adminUsers).not.toHaveBeenCalled()
  })

  it('reloads only orders after completing an order', async () => {
    const admin = useAdminStore()
    api.completeOrder.mockResolvedValue(true)

    await admin.completeOrder(1)

    expect(api.completeOrder).toHaveBeenCalledWith(1)
    expect(api.adminOrders).toHaveBeenCalledTimes(1)
    expect(api.adminComments).not.toHaveBeenCalled()
    expect(api.adminUsers).not.toHaveBeenCalled()
  })

  it('owns product and market pages independently from the customer catalog', async () => {
    const admin = useAdminStore()

    await admin.loadProducts({ page: 2 })
    await admin.loadMarkets({ page: 3 })

    expect(admin.products).toEqual([{ id: 2, name: '맥주' }])
    expect(admin.markets).toEqual([{ id: 3, name: '구미점' }])
    expect(api.products).toHaveBeenCalledWith(expect.objectContaining({ page: 2, size: 20, type: '', q: '' }))
    expect(api.markets).toHaveBeenCalledWith({ page: 3, size: 20 })
  })
})
