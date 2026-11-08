import { contentReasons, scoreLabels, filterLabels, type ContentItem } from './contentRecommendations'
import type { AccountCart, Product } from './types'

export const contextUnavailable = {
  EMPTY_CART: '비교할 상품이 장바구니에 없습니다.',
  REFERENCE_LIMIT: '전체 장바구니가20종을 넘습니다. 일부 상품만 골라 비교하지 않았습니다.',
  DELETED_ITEMS: '삭제된 상품이 있어 비교하지 않았습니다. 해당 항목을 제거한 뒤 다시 확인해 주세요.',
  CATALOG_UNAVAILABLE: '현재 검수 카탈로그를 확인하지 못해 비교하지 않았습니다.',
  UNREVIEWED_ITEMS: '검수 대상이 아닌 상품이 있어 비교하지 않았습니다.',
  UNAVAILABLE_REFERENCES: '비교에 사용할 수 없는 기준 상품이 있어 비교하지 않았습니다.',
  PROVIDER_UNAVAILABLE: '추천 서버의 비교 결과를 확인하지 못했습니다. 현재 카트는 유지됩니다.',
} as const
export const contextFallbacks = {
  no_usable_references: '비교에 사용할 수 있는 기준 상품이 없습니다.',
  no_eligible_products: '기준 상품군과 입력 조건을 제외한 검수 후보가 없습니다.',
  no_supported_preferences: '기준 상품에서 비교할 수 있는 특성 근거가 없습니다.',
  no_matching_features: '기준 상품과 공유하는 특성 근거가 있는 후보가 없습니다.',
  below_relevance_floor: '설정한 비교 점수 기준을 통과한 후보가 없습니다.',
} as const
export const referenceStates = { READY: '비교 가능', DELETED: '삭제된 상품', UNREVIEWED: '검수 대상 아님', UNAVAILABLE: '비교 불가', CATALOG_UNAVAILABLE: '검수 카탈로그 미확인' } as const
export interface ContextReference { productId: number; name: string | null; quantity: number; state: keyof typeof referenceStates }
interface ContextResult {
  items: ContentItem[]
  matches: { product_id: number; reference_product_id: number }[]
  fallback_reason: keyof typeof contextFallbacks | null
}
export interface CartContextResponse {
  source: 'PROVIDER' | 'UNAVAILABLE'; catalogScope: 'REVIEWED_DEMO' | 'REVIEWED_LOCAL_CATALOG'; cartVersion: number
  references: ContextReference[]; unavailableReason: keyof typeof contextUnavailable | null
  result: ContextResult | null; products: Product[]
}
function need(value: unknown): asserts value { if (!value) throw new Error('장바구니 비교 응답을 확인하지 못했습니다.') }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
const number = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
const integer = (value: unknown, max: number): value is number => number(value, max) && Number.isInteger(value)
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim()

// Consume current products and typed display facts, never reconstruct rankings or catalog authority.
export function checkedCartContext(value: unknown, cart: AccountCart): CartContextResponse {
  need(object(value) && Object.keys(value).length === 7 && (value.catalogScope === 'REVIEWED_DEMO' || value.catalogScope === 'REVIEWED_LOCAL_CATALOG') && value.cartVersion === cart.version &&
    Array.isArray(value.references) && value.references.length === cart.items.length && Array.isArray(value.products))
  const refs = new Set<number>()
  value.references.forEach((ref, index) => {
    const row = cart.items[index]
    need(object(ref) && Object.keys(ref).length === 4 && ref.productId === row.productId && ref.quantity === row.quantity &&
      typeof ref.state === 'string' && Object.hasOwn(referenceStates, ref.state) && (ref.state === 'DELETED' ? ref.name === null : text(ref.name)))
    refs.add(row.productId)
  })
  if (value.source === 'UNAVAILABLE') {
    need(typeof value.unavailableReason === 'string' && Object.hasOwn(contextUnavailable, value.unavailableReason) && value.result === null && !value.products.length)
    const states = value.references.map((ref) => ref.state)
    const reason = !states.length ? 'EMPTY_CART' : states.length > 20 ? 'REFERENCE_LIMIT' : states.includes('DELETED') ? 'DELETED_ITEMS' :
      states.includes('CATALOG_UNAVAILABLE') ? 'CATALOG_UNAVAILABLE' : states.includes('UNREVIEWED') ? 'UNREVIEWED_ITEMS' : states.includes('UNAVAILABLE') ? 'UNAVAILABLE_REFERENCES' : 'PROVIDER_UNAVAILABLE'
    need(value.unavailableReason === reason)
    return value as unknown as CartContextResponse
  }
  need(value.source === 'PROVIDER' && value.unavailableReason === null && refs.size > 0 && refs.size <= 20 && value.references.every((ref) => ref.state === 'READY'))
  const result = value.result
  need(object(result) && result.algorithm === 'b1-tfidf-minmax-v1' && result.aggregation_algorithm === 'r07-max-reference-v1' &&
    result.fit_scope === 'request_catalog' && result.profile_source === 'explicit_context_product_facts' && result.reference_group_policy === 'exclude_all_known_reference_groups' &&
    typeof result.representation_fitted === 'boolean' && (result.model_fingerprint === null || typeof result.model_fingerprint === 'string' && /^[a-f0-9]{64}$/.test(result.model_fingerprint)))
  need(Array.isArray(result.references) && result.references.length === refs.size && result.references.every((ref) => object(ref) && refs.has(ref.product_id as number) && ref.state === 'available') &&
    new Set(result.references.map((ref) => ref.product_id)).size === refs.size && result.evaluated_reference_count === refs.size)
  need(result.fallback_reason === null || typeof result.fallback_reason === 'string' && Object.hasOwn(contextFallbacks, result.fallback_reason))
  need(Array.isArray(result.items) && result.items.length <= 4 && Array.isArray(result.matches) && result.matches.length === result.items.length && value.products.length === result.items.length &&
    (result.items.length > 0 ? result.fallback_reason === null && result.representation_fitted : result.fallback_reason !== null))
  const seen = new Set<number>()
  const products = value.products, matches = result.matches
  result.items.forEach((item, index) => {
    const product = products[index], match = matches[index]
    need(object(item) && integer(item.product_id, 2147483647) && item.product_id > 0 && !refs.has(item.product_id) && !seen.has(item.product_id))
    seen.add(item.product_id)
    need(object(product) && product.id === item.product_id && text(product.name) && text(product.type) && integer(product.price, 2147483647) &&
      number(product.abv, 100) && integer(product.orderCount, 2147483647) && (product.img == null || typeof product.img === 'string'))
    need(object(match) && match.product_id === item.product_id && refs.has(match.reference_product_id as number) && number(item.score, 1) && item.score > 0 &&
      Array.isArray(item.reasons) && item.reasons.includes('content_similarity') && item.reasons.every((reason) => typeof reason === 'string' && Object.hasOwn(contentReasons, reason)))
    const facts = item.explanation
    need(object(facts) && facts.version === 'r04-facts-v1' && facts.basis === 'content_similarity' && facts.fallback_reason === null &&
      object(facts.comparison) && facts.comparison.kind === 'reference_product' && facts.comparison.product_id === match.reference_product_id &&
      integer(facts.total_positive_contributions, 43) && facts.total_positive_contributions > 0 && Array.isArray(facts.score_evidence) &&
      facts.score_evidence.length === Math.min(3, facts.total_positive_contributions) && facts.score_evidence_truncated === (facts.total_positive_contributions > 3))
    for (const fact of facts.score_evidence) {
      need(object(fact) && typeof fact.kind === 'string' && Object.hasOwn(scoreLabels, fact.kind) && fact.label === scoreLabels[fact.kind as keyof typeof scoreLabels] && number(fact.contribution, 1) && fact.contribution > 0)
      if (fact.kind === 'abv_comparison' || fact.kind === 'volume_comparison') {
        const volume = fact.kind === 'volume_comparison', max = volume ? 1000000 : 100
        need(number(fact.actual_value, max) && number(fact.target_value, max) && fact.unit === (volume ? 'mL' : 'vol%'))
        need(!volume || integer(fact.actual_value, max) && fact.actual_value > 0 && integer(fact.target_value, max) && fact.target_value > 0)
      } else need(text(fact.actual_value) && fact.target_value === fact.actual_value && !Object.hasOwn(fact, 'unit'))
    }
    need(Array.isArray(facts.filter_evidence) && facts.filter_evidence.length > 0 && facts.filter_evidence.length <= 4)
    for (const fact of facts.filter_evidence) {
      need(object(fact) && typeof fact.kind === 'string' && Object.hasOwn(filterLabels, fact.kind) && fact.label === filterLabels[fact.kind as keyof typeof filterLabels])
      if (fact.kind === 'availability_filter') need(fact.actual_value === true)
      else if (fact.kind === 'category_filter') need(text(fact.actual_value) && integer(fact.allowed_category_count, 32) && fact.allowed_category_count > 0)
      else { const price = fact.kind === 'price_filter', max = price ? 2147483647 : 100
        need(number(fact.actual_value, max) && (fact.minimum === null || number(fact.minimum, max)) && (fact.maximum === null || number(fact.maximum, max)) && fact.unit === (price ? 'KRW' : 'vol%')) }
    }
  })
  return value as unknown as CartContextResponse
}
