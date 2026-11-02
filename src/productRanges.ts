export const productRangeFields = [
  { key: 'minPriceKrw', label: '최소 가격(원)', kind: 'price', bound: '이상' },
  { key: 'maxPriceKrw', label: '최대 가격(원)', kind: 'price', bound: '이하' },
  { key: 'minAbvPercent', label: '최소 도수(%)', kind: 'abv', bound: '이상' },
  { key: 'maxAbvPercent', label: '최대 도수(%)', kind: 'abv', bound: '이하' },
] as const
export type ProductRangeKey = (typeof productRangeFields)[number]['key']
export type ProductRanges = Record<ProductRangeKey, string>
export type ProductRangeErrors = Partial<Record<ProductRangeKey, string>>

// Keep spelling until validation: Number() would turn an empty value into zero
// and accept exponent/hex syntax that the provider explicitly rejects.
export function parseProductRanges(query: Partial<Record<ProductRangeKey, unknown>> = {}): ProductRanges {
  return {
    minPriceKrw: String(query.minPriceKrw ?? ''),
    maxPriceKrw: String(query.maxPriceKrw ?? ''),
    minAbvPercent: String(query.minAbvPercent ?? ''),
    maxAbvPercent: String(query.maxAbvPercent ?? ''),
  }
}
export function buildProductRanges(values: Partial<Record<ProductRangeKey, unknown>> = {}) {
  const query: Partial<ProductRanges> = {}
  for (const { key } of productRangeFields) {
    const value = String(values[key] ?? '')
    if (value !== '') query[key] = value
  }
  return query
}
export function validateProductRanges(
  values: Partial<Record<ProductRangeKey, unknown>>,
  { provided = [], duplicates = [] }: { provided?: readonly string[]; duplicates?: readonly string[] } = {},
): ProductRangeErrors {
  const ranges = parseProductRanges(values)
  const errors: ProductRangeErrors = {}
  for (const { key, kind } of productRangeFields) {
    const value = ranges[key]
    if (duplicates.includes(key)) {
      errors[key] = '같은 범위 값은 하나만 지정해 주세요.'
      continue
    }
    if (value === '' && !provided.includes(key)) continue
    if (kind === 'price') {
      if (!/^[0-9]{1,10}$/.test(value) || Number(value) > 2147483647)
        errors[key] = '0~2,147,483,647 사이의 정수를 입력해 주세요.'
    } else if (!/^[0-9]{1,3}(\.[0-9]{1,2})?$/.test(value) || Number(value) > 100) {
      errors[key] = '0~100 사이의 숫자를 소수점 둘째 자리까지 입력해 주세요.'
    }
  }
  for (const [min, max] of [['minPriceKrw', 'maxPriceKrw'], ['minAbvPercent', 'maxAbvPercent']] as const) {
    if (!errors[min] && !errors[max] && ranges[min] !== '' && ranges[max] !== '' && Number(ranges[min]) > Number(ranges[max]))
      errors[max] = '최댓값은 최솟값 이상이어야 합니다.'
  }
  return errors
}
