import { buildProductTags, parseProductTags } from '../productTags'
import { buildProductRanges, parseProductRanges } from '../productRanges'

export const productSorts = ['popular', 'priceAsc', 'priceDesc', 'name']

export function parseProductQuery(query = {}, categoryNames = []) {
  const type = categoryNames.includes(query.type) ? query.type : ''
  const sort = productSorts.includes(query.sort) ? query.sort : 'popular'
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
  return { ...parseProductRanges(query), ...parseProductTags(query), type, q: String(query.q || '').trim(), sort, page, size: 12 }
}

export function buildProductQuery(filters = {}, page = 1) {
  return {
    ...buildProductRanges(filters),
    ...buildProductTags(filters),
    ...(filters.type ? { type: filters.type } : {}),
    ...(String(filters.q || '').trim() ? { q: String(filters.q).trim() } : {}),
    sort: productSorts.includes(filters.sort) ? filters.sort : 'popular',
    page: Math.max(1, Number.parseInt(page, 10) || 1),
  }
}

export function removeProductCondition(search, applied, draft, key, index = -1) {
  const next = new URLSearchParams(search)
  const form = { ...draft, page: 1 }
  if (Array.isArray(applied[key])) {
    const values = next.getAll(key)
    if (!Number.isInteger(index) || index < 0 || index >= values.length) return null
    next.delete(key)
    values.filter((_, i) => i !== index).forEach((value) => next.append(key, value))
    if (JSON.stringify(draft[key]) === JSON.stringify(applied[key]))
      form[key] = draft[key].filter((_, i) => i !== index)
  } else {
    next.delete(key)
    if (draft[key] === applied[key]) form[key] = ''
  }
  next.set('page', '1')
  return { search: next, form }
}
