export const COMPARISON_LIMIT = 4

export function parseComparison(search: URLSearchParams): { ids: number[]; error: string | null } {
  const values = search.getAll('productId')
  if (values.length > COMPARISON_LIMIT)
    return { ids: [], error: '비교 상품은 최대 4개까지 선택할 수 있습니다.' }
  const ids = values.map((value) => /^[1-9]\d*$/.test(value) && String(Number(value)) === value ? Number(value) : NaN)
  if (ids.some((id) => !Number.isSafeInteger(id)) || new Set(ids).size !== ids.length)
    return { ids: [], error: '상품 번호가 올바르지 않거나 중복되었습니다.' }
  return { ids, error: null }
}

export function comparisonUrl(ids: number[]) {
  const search = new URLSearchParams()
  ids.forEach((id) => search.append('productId', String(id)))
  return `/compare${ids.length ? `?${search}` : ''}`
}
