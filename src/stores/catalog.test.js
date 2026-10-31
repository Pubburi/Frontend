import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { api } from '../services/api'
import { useCatalogStore } from './catalog'
import { useUiStore } from './ui'

vi.mock('../services/api', () => ({ api: { products: vi.fn(), product: vi.fn(), comments: vi.fn() } }))

const page = (items, current = 1) => ({ items, page: current, size: 12, total: items.length, totalPages: 1, hasNext: false })
const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

describe('catalog query ownership', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('preserves the latest query and page when responses arrive in reverse order', async () => {
    const catalog = useCatalogStore()
    const ui = useUiStore()
    const old = deferred()
    api.products.mockReturnValueOnce(old.promise).mockResolvedValueOnce(page([{ id: 2 }]))
    const previous = ui.runLatest('products', (isCurrent) => catalog.loadProducts({ q: '이전', page: 2 }, isCurrent))
    await ui.runLatest('products', (isCurrent) => catalog.loadProducts({ q: '현재', page: 1 }, isCurrent))
    old.resolve(page([{ id: 1 }], 2))
    await previous

    expect(api.products.mock.calls.map(([params]) => ({ q: params.q, page: params.page }))).toEqual([
      { q: '이전', page: 2 }, { q: '현재', page: 1 },
    ])
    expect(catalog.filters.q).toBe('현재')
    expect(catalog.products).toEqual([{ id: 2 }])
    expect(catalog.productsPage.page).toBe(1)
  })

  it('does not restore a previous product after a new detail has loaded', async () => {
    const catalog = useCatalogStore()
    const ui = useUiStore()
    const old = deferred()
    api.product.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ id: 2 })
    const previous = ui.runLatest('product-detail', (isCurrent) => catalog.loadProduct(1, isCurrent))
    await ui.runLatest('product-detail', (isCurrent) => catalog.loadProduct(2, isCurrent))
    old.resolve({ id: 1 })
    await previous

    expect(catalog.selectedProduct).toEqual({ id: 2 })
  })

  it('preserves the latest comments page and discards responses from a closed detail', async () => {
    const catalog = useCatalogStore()
    const ui = useUiStore()
    const old = deferred()
    api.comments.mockReturnValueOnce(old.promise).mockResolvedValueOnce(page([{ id: 20 }], 2))
    const previous = ui.runLatest('comments', (isCurrent) => catalog.loadComments(1, { page: 1 }, isCurrent))
    await ui.runLatest('comments', (isCurrent) => catalog.loadComments(1, { page: 2 }, isCurrent))
    old.resolve(page([{ id: 10 }]))
    await previous
    expect(catalog.comments).toEqual([{ id: 20 }])
    expect(catalog.commentsPage.page).toBe(2)

    const leaving = deferred()
    api.comments.mockReturnValueOnce(leaving.promise)
    const pending = ui.runLatest('comments', (isCurrent) => catalog.loadComments(1, {}, isCurrent))
    ui.cancelLatest('comments')
    catalog.clearProduct()
    leaving.resolve(page([{ id: 30 }]))
    await pending
    expect(catalog.comments).toEqual([])
    expect(catalog.selectedProduct).toBeNull()
  })
})
