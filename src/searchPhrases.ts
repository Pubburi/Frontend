import { categories } from './catalog'
import { validateProductRanges } from './productRanges'
import { validateProductTags } from './productTags'

export const searchOptIns = [
  { key: 'categories', label: '선호 주종을 검색 조건으로 사용', name: '주종' },
  { key: 'tasteTags', label: '선호 맛 태그를 검색 조건으로 사용', name: '맛 태그' },
  { key: 'aromaTags', label: '선호 향 태그를 검색 조건으로 사용', name: '향 태그' },
  { key: 'targetAbvPercent', label: '목표 도수를 검색 조건으로 사용', name: '목표 도수' },
] as const
export type SearchOptIn = typeof searchOptIns[number]['key']
export interface SearchConditions {
  type: string | null
  minPriceKrw: number | null
  maxPriceKrw: number | null
  minAbvPercent: string | null
  maxAbvPercent: string | null
  tasteTag: string[]
  aromaTag: string[]
}
export interface SearchPhrase {
  template_id: 'all_products' | 'hard_conditions' | 'selected_preferences'
  label: string
  conditions: SearchConditions
  query_pairs: { name: string; value: string }[]
  backend_unicode_revalidation_required: boolean
}
const diagnosticMessages = {
  soft_not_selected: '검색 조건에 넣지 않았습니다.',
  selected_unknown: '저장된 선호를 아직 알 수 없습니다.',
  selected_empty: '저장할 때 선호 없음으로 선택했습니다.',
  backend_unicode_revalidation_required: '태그의 문자 규칙은 검색할 때 다시 확인합니다.',
} as const
export type SearchDiagnostic = { field: SearchOptIn; code: keyof typeof diagnosticMessages }
export const fallbackMessages = {
  no_explicit_search_conditions: '저장된 검색 조건이 없어 전체 상품 문구를 받았습니다.',
  no_search_opt_in: '추가 선호를 선택하지 않아 저장된 필수 범위만 사용합니다.',
  selected_preferences_unknown: '선택한 선호가 미확인입니다. 취향을 수정하거나 사용할 조건을 다시 선택해 주세요.',
  selected_preferences_empty: '선택한 선호가 비어 있습니다. 취향을 수정하거나 사용할 조건을 다시 선택해 주세요.',
  selected_target_outside_hard_bounds: '목표 도수가 저장된 필수 범위를 벗어납니다. 취향을 수정하거나 사용할 조건을 다시 선택해 주세요.',
} as const
export interface SearchPhraseResult {
  algorithm: 'r06-explicit-search-phrases-v1'
  items: SearchPhrase[]
  candidate_count: number
  omitted_count: number
  product_count: null
  diagnostics: SearchDiagnostic[]
  fallback_reason: keyof typeof fallbackMessages | null
}
export type SearchPhraseResponse = { source: 'UNAVAILABLE'; result: null } | { source: 'PROVIDER'; result: SearchPhraseResult }
const conditionKeys = ['type', 'minPriceKrw', 'maxPriceKrw', 'minAbvPercent', 'maxAbvPercent', 'tasteTag', 'aromaTag'] as const
function requireValid(value: unknown): asserts value {
  if (!value) throw new Error('검색 문구 응답을 확인하지 못했습니다.')
}
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)))
}
function integer(value: unknown, max: number): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max }
function conditions(value: unknown): asserts value is SearchConditions {
  requireValid(exact(value, conditionKeys))
  requireValid(value.type === null || typeof value.type === 'string' && categories.some((category) => category.label === value.type))
  for (const key of ['minPriceKrw', 'maxPriceKrw'] as const) requireValid(value[key] === null || integer(value[key], 2147483647))
  for (const key of ['minAbvPercent', 'maxAbvPercent'] as const) requireValid(value[key] === null || typeof value[key] === 'string' && /^[0-9]{1,3}(\.[0-9]{1,2})?$/.test(value[key]))
  for (const key of ['tasteTag', 'aromaTag'] as const) requireValid(Array.isArray(value[key]) && value[key].every((tag) => typeof tag === 'string'))
  requireValid(!Object.keys(validateProductRanges(value)).length && !Object.keys(validateProductTags(value)).length)
}
// Validate the typed wire, never generate or weaken the provider's conditions.
// The Backend binds this response to its own current saved preferences.
export function parseSearchPhraseResponse(value: unknown): SearchPhraseResponse {
  requireValid(exact(value, ['source', 'result']))
  if (value.source === 'UNAVAILABLE') { requireValid(value.result === null); return { source: 'UNAVAILABLE', result: null } }
  requireValid(value.source === 'PROVIDER')
  const result = value.result
  requireValid(exact(result, ['algorithm', 'items', 'candidate_count', 'omitted_count', 'product_count', 'diagnostics', 'fallback_reason']))
  requireValid(result.algorithm === 'r06-explicit-search-phrases-v1' && result.product_count === null)
  requireValid(integer(result.candidate_count, 8) && integer(result.omitted_count, 7) && Array.isArray(result.items) && result.items.length <= 5)
  requireValid(result.items.length === Math.min(result.candidate_count, 5) && result.omitted_count === result.candidate_count - result.items.length)
  requireValid(result.fallback_reason === null || typeof result.fallback_reason === 'string' && Object.hasOwn(fallbackMessages, result.fallback_reason))
  requireValid(Array.isArray(result.diagnostics) && result.diagnostics.length <= 8)
  const seenDiagnostics = new Set<string>()
  for (const diagnostic of result.diagnostics) {
    requireValid(exact(diagnostic, ['field', 'code']) && searchOptIns.some((field) => field.key === diagnostic.field) && typeof diagnostic.code === 'string' && Object.hasOwn(diagnosticMessages, diagnostic.code))
    const key = `${diagnostic.field}:${diagnostic.code}`; requireValid(!seenDiagnostics.has(key)); seenDiagnostics.add(key)
  }
  const seenPhrases = new Set<string>()
  for (const item of result.items) {
    requireValid(exact(item, ['template_id', 'label', 'conditions', 'query_pairs', 'backend_unicode_revalidation_required']))
    requireValid(typeof item.template_id === 'string' && ['all_products', 'hard_conditions', 'selected_preferences'].includes(item.template_id))
    conditions(item.conditions)
    const current = item.conditions
    const label = current.type !== null ? `${current.type} 조건으로 검색` : item.template_id === 'all_products' ? '전체 상품 보기' : item.template_id === 'hard_conditions' ? '지정 조건으로 상품 보기' : '선택한 취향 조건으로 검색'
    requireValid(item.label === label && typeof item.backend_unicode_revalidation_required === 'boolean')
    requireValid(item.backend_unicode_revalidation_required === [...current.tasteTag, ...current.aromaTag].some((tag) => /[^\x00-\x7f]/.test(tag)))
    const expected = conditionKeys.flatMap((name) => {
      const part = current[name]
      return part === null ? [] : (Array.isArray(part) ? part : [String(part)]).map((atom) => ({ name, value: atom }))
    })
    requireValid(Array.isArray(item.query_pairs) && item.query_pairs.length <= 45 && item.query_pairs.length === expected.length)
    item.query_pairs.forEach((pair, index) => requireValid(exact(pair, ['name', 'value']) && pair.name === expected[index].name && pair.value === expected[index].value))
    requireValid(item.template_id !== 'all_products' || expected.length === 0)
    requireValid(item.template_id !== 'hard_conditions' || current.type === null && !current.tasteTag.length && !current.aromaTag.length && expected.length > 0)
    const signature = JSON.stringify(item.query_pairs); requireValid(!seenPhrases.has(signature)); seenPhrases.add(signature)
  }
  requireValid(result.items.length > 0 || ['selected_preferences_unknown', 'selected_preferences_empty', 'selected_target_outside_hard_bounds'].includes(String(result.fallback_reason)))
  requireValid(!String(result.fallback_reason).startsWith('selected_') || result.items.length === 0)
  return value as unknown as SearchPhraseResponse
}
export function searchPhraseUrl(item: SearchPhrase) {
  const query = new URLSearchParams()
  for (const pair of item.query_pairs) query.append(pair.name, pair.value)
  query.append('sort', 'name'); query.append('page', '1')
  return `/products?${query}`
}
export function searchDiagnosticText(diagnostic: SearchDiagnostic) {
  return `${searchOptIns.find((field) => field.key === diagnostic.field)!.name}: ${diagnosticMessages[diagnostic.code]}`
}
