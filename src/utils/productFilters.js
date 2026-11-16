import { buildProductTags, parseProductTags } from '../productTags'
import { buildProductRanges, parseProductRanges } from '../productRanges'

export const defaultProductSort = 'name'
export const productSortOptions = [
  [defaultProductSort, '이름순'],
  ['priceAsc', '낮은 가격순'],
  ['priceDesc', '높은 가격순'],
]

/** @param {unknown} value */
function productSort(value) {
  return productSortOptions.find(([sort]) => sort === value)?.[0] ?? defaultProductSort
}

export function parseProductQuery(query = {}, categoryNames = []) {
  const type = categoryNames.includes(query.type) ? query.type : ''
  const sort = productSort(query.sort)
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
  return { ...parseProductRanges(query), ...parseProductTags(query), type, q: String(query.q || '').trim(), sort, page, size: 12 }
}

export function buildProductQuery(filters = {}, page = 1) {
  return {
    ...buildProductRanges(filters),
    ...buildProductTags(filters),
    ...(filters.type ? { type: filters.type } : {}),
    ...(String(filters.q || '').trim() ? { q: String(filters.q).trim() } : {}),
    sort: productSort(filters.sort),
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
  if (next.has('sort')) next.set('sort', applied.sort)
  next.set('page', '1')
  return { search: next, form }
}
