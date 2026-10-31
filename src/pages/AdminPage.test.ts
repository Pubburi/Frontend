import { describe, expect, it, vi } from 'vitest'
import { api } from '../services/api'
import { fetchAdminPage } from './AdminPage'

vi.mock('../services/api', () => ({
  api: {
    me: vi.fn(),
    products: vi.fn(),
    markets: vi.fn(),
    adminOrders: vi.fn(),
    adminComments: vi.fn(),
    adminUsers: vi.fn(),
  },
}))
describe('React admin query ownership', () => {
  it('loads only the selected tab without sharing customer page/filter state', async () => {
    vi.clearAllMocks()
    vi.mocked(api.adminComments).mockResolvedValue({ items: [], page: 2 })
    await fetchAdminPage('comments', 2)
    expect(api.adminComments).toHaveBeenCalledWith({ page: 2, size: 20 })
    expect(api.products).not.toHaveBeenCalled()
    expect(api.adminOrders).not.toHaveBeenCalled()
    vi.mocked(api.products).mockResolvedValue({ items: [], page: 3 })
    await fetchAdminPage('products', 3)
    expect(api.products).toHaveBeenCalledWith({
      page: 3,
      size: 20,
      type: '',
      q: '',
      sort: 'popular',
    })
  })
})
