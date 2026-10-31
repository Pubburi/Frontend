export const productSorts = ['popular', 'priceAsc', 'priceDesc', 'name']

export function parseProductQuery(query = {}, categoryNames = []) {
  const type = categoryNames.includes(query.type) ? query.type : ''
  const sort = productSorts.includes(query.sort) ? query.sort : 'popular'
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
  return { type, q: String(query.q || '').trim(), sort, page, size: 12 }
}

export function buildProductQuery(filters = {}, page = 1) {
  return {
    ...(filters.type ? { type: filters.type } : {}),
    ...(String(filters.q || '').trim() ? { q: String(filters.q).trim() } : {}),
    sort: productSorts.includes(filters.sort) ? filters.sort : 'popular',
    page: Math.max(1, Number.parseInt(page, 10) || 1),
  }
}
