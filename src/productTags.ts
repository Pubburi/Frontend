export const productTagFields = [
  { key: 'tasteTag', label: '맛' }, { key: 'aromaTag', label: '향' },
] as const
export type ProductTagKey = (typeof productTagFields)[number]['key']
export type ProductTags = Record<ProductTagKey, string[]>
export type ProductTagIssues = Partial<Record<ProductTagKey, { index: number; message: string }>>

// Java 17 Character.isWhitespace used by the provider's String.strip().
// NBSP, figure space, narrow NBSP and FEFF remain literal characters.
const outerWhitespace = /^[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]+|[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]+$/g
// Only ASCII case folding is proven independent of browser Unicode versions.
// The provider owns all remaining casing (including contextual Greek sigma).
export const normalizeProductTag = (value: string) => value.replace(outerWhitespace, '').replace(/[A-Z]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) + 32))
export function parseProductTags(query: Partial<Record<ProductTagKey, unknown>> = {}): ProductTags {
  const read = (value: unknown) => value == null ? [] : Array.isArray(value) ? value.map(String) : [String(value)]
  return { tasteTag: read(query.tasteTag), aromaTag: read(query.aromaTag) }
}
export function buildProductTags(values: Partial<Record<ProductTagKey, unknown>> = {}) {
  const tags = parseProductTags(values)
  const query: Partial<ProductTags> = {}
  for (const { key } of productTagFields)
    if (tags[key].length) query[key] = tags[key].map(normalizeProductTag)
  return query
}
export function validateProductTags(values: Partial<Record<ProductTagKey, unknown>>): ProductTagIssues {
  const tags = parseProductTags(values)
  const issues: ProductTagIssues = {}
  for (const { key, label } of productTagFields) {
    if (tags[key].length > 20) {
      issues[key] = { index: 20, message: `${label} 조건은 최대 20개까지 지정해 주세요.` }
      continue
    }
    const seen = new Set<string>()
    for (const [index, value] of tags[key].entries()) {
      const normalized = normalizeProductTag(value)
      const malformed = Array.from(value).some((character) => character.length === 1 && character.charCodeAt(0) >= 0xd800 && character.charCodeAt(0) <= 0xdfff)
      if (malformed) {
        issues[key] = { index, message: '지원하지 않는 문자가 있습니다. 태그를 다시 입력해 주세요.' }
        break
      }
      if (!normalized || value.length > 40) {
        issues[key] = { index, message: '태그 한 개를 1~40자로 입력하거나 빈 행을 삭제해 주세요.' }
        break
      }
      if (seen.has(normalized)) {
        issues[key] = { index, message: '대소문자·앞뒤 공백을 정리한 뒤 같은 태그가 중복됩니다.' }
        break
      }
      seen.add(normalized)
    }
  }
  return issues
}
