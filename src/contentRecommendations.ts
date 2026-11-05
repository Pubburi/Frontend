import { categories } from './catalog'
import type { Product } from './types'

export const contentReasons = {
  available: '검수 입력의 가용 조건 충족',
  price_within_range: '저장한 필수 가격 범위 충족',
  abv_within_range: '저장한 필수 도수 범위 충족',
  content_similarity: '추천에 사용한 선호와 공유하는 비교 근거 있음',
  no_shared_features: '공유하는 비교 근거 없음',
  deterministic_baseline: '비교 근거가 부족해 정해진 기본순으로 표시',
} as const
export const contentFallbacks = {
  no_eligible_products: '저장한 필수 조건을 충족하는 검수 DEMO 후보가 없습니다. 조건을 완화하지 않았습니다.',
  no_supported_preferences: '검수 후보와 비교할 수 있는 선호가 없어 기본순으로 표시합니다.',
  no_matching_features: '검수 후보와 공유하는 취향 근거가 없어 기본순으로 표시합니다.',
} as const
const scoreLabels = { category_match: '주종 일치', taste_match: '맛 태그 일치', aroma_match: '향 태그 일치', abv_comparison: '도수 비교 근거', volume_comparison: '용량 비교 근거' } as const
const filterLabels = { availability_filter: '입력 가용 조건 충족', category_filter: '입력 주종 조건 충족', price_filter: '입력 가격 조건 충족', abv_filter: '입력 도수 조건 충족' } as const
export interface ScoreFact {
  kind: keyof typeof scoreLabels
  label: string
  actual_value: string | number
  target_value: string | number
  unit?: 'vol%' | 'mL'
  contribution: number
}
export interface FilterFact {
  kind: keyof typeof filterLabels
  label: string
  actual_value: string | number | true
  minimum?: number | null
  maximum?: number | null
  unit?: 'KRW' | 'vol%'
  allowed_category_count?: number
}
export interface ContentItem {
  product_id: number
  score: number
  reasons: (keyof typeof contentReasons)[]
  explanation: {
    version: 'r04-facts-v1'
    basis: 'content_similarity' | 'deterministic_baseline' | 'no_shared_features'
    comparison: { kind: 'profile' }
    score_evidence: ScoreFact[]
    filter_evidence: FilterFact[]
    total_positive_contributions: number
    score_evidence_truncated: boolean
    fallback_reason: keyof typeof contentFallbacks | null
  }
}
export interface ActivityEvidence {
  favoriteCategories: string[]
  highlyRatedCategories: string[]
}
export type ContentResponse = { source: 'UNAVAILABLE'; catalogScope: 'REVIEWED_DEMO'; result: null; products: [] } |
  { source: 'PROVIDER'; catalogScope: 'REVIEWED_DEMO' | 'REVIEWED_FAMILY_BROWSE_DEMO'; result: { items: ContentItem[]; fallback_reason: keyof typeof contentFallbacks | null }; products: Product[]; activityEvidence?: ActivityEvidence }
function need(value: unknown): asserts value { if (!value) throw new Error('검수 DEMO 추천 응답을 확인하지 못했습니다.') }
function object(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)) }
function number(value: unknown, max: number): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max }
function integer(value: unknown, max: number): value is number { return number(value, max) && Number.isInteger(value) }
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0 }
function fallback(value: unknown) { return value === null || typeof value === 'string' && Object.hasOwn(contentFallbacks, value) }

// Consume typed display facts. Ranking, catalog authority and preference binding
// remain with the provider; this never invents or recalculates a score/reason.
export function parseContentResponse(value: unknown): ContentResponse {
  need(object(value) && Array.isArray(value.products))
  const hasActivity = Object.hasOwn(value, 'activityEvidence')
  need(Object.keys(value).length === (hasActivity ? 5 : 4) && ['source', 'catalogScope', 'products', 'result'].every((key) => Object.hasOwn(value, key)))
  if (value.source === 'UNAVAILABLE') {
    need(!hasActivity && value.catalogScope === 'REVIEWED_DEMO' && value.result === null && value.products.length === 0)
    return value as unknown as ContentResponse
  }
  need(value.source === 'PROVIDER' && (value.catalogScope === 'REVIEWED_DEMO' || value.catalogScope === 'REVIEWED_FAMILY_BROWSE_DEMO'))
  const result = value.result
  need(object(result) && result.algorithm === 'b1-tfidf-minmax-v1' && result.fit_scope === 'request_catalog' &&
    typeof result.representation_fitted === 'boolean' && (result.model_fingerprint === null || typeof result.model_fingerprint === 'string' && /^[a-f0-9]{64}$/.test(result.model_fingerprint)))
  need(fallback(result.fallback_reason) && integer(result.eligible_count, 1000) && integer(result.supported_profile_tokens, 72) && integer(result.unknown_profile_tokens, 72))
  need(Array.isArray(result.active_numeric_preferences) && result.active_numeric_preferences.every((part) => part === 'abv_percent'))
  need(Array.isArray(result.items) && result.items.length <= 4 && result.items.length === Math.min(4, result.eligible_count) && value.products.length === result.items.length)
  need((result.items.length === 0) === (result.fallback_reason === 'no_eligible_products'))
  const products = value.products
  const seen = new Set<number>()
  const matchedCategories = new Set<string>()
  result.items.forEach((item, index) => {
    need(object(item) && integer(item.product_id, 2147483647) && item.product_id > 0 && !seen.has(item.product_id))
    seen.add(item.product_id)
    const product = products[index]
    need(object(product) && product.id === item.product_id && text(product.name) && text(product.type) && integer(product.price, 2147483647) && number(product.abv, 100) && integer(product.orderCount, 2147483647) && (product.img == null || typeof product.img === 'string'))
    need(number(item.score, 1) && Array.isArray(item.reasons) && item.reasons.length > 0 && item.reasons.every((reason) => typeof reason === 'string' && Object.hasOwn(contentReasons, reason)))
    const categoryContribution = hasActivity && item.score > 0 && Array.isArray(item.contributions) && item.contributions.some((part) =>
      object(part) && part.component === 'text' && part.feature === `category:${product.type}` && number(part.contribution, 1) && part.contribution > 0,
    )
    if (categoryContribution) matchedCategories.add(product.type)
    const facts = item.explanation
    need(object(facts) && facts.version === 'r04-facts-v1' && object(facts.comparison) && facts.comparison.kind === 'profile' && Object.keys(facts.comparison).length === 1)
    need(typeof facts.basis === 'string' && ['content_similarity', 'deterministic_baseline', 'no_shared_features'].includes(facts.basis) && item.reasons.includes(facts.basis))
    need(facts.fallback_reason === result.fallback_reason && integer(facts.total_positive_contributions, 43) && typeof facts.score_evidence_truncated === 'boolean')
    need(Array.isArray(facts.score_evidence) && facts.score_evidence.length === Math.min(3, facts.total_positive_contributions) && facts.score_evidence_truncated === (facts.total_positive_contributions > 3))
    need(item.score > 0 ? facts.basis === 'content_similarity' && facts.total_positive_contributions > 0 : facts.total_positive_contributions === 0 && facts.basis !== 'content_similarity')
    for (const fact of facts.score_evidence) {
      need(object(fact) && typeof fact.kind === 'string' && Object.hasOwn(scoreLabels, fact.kind) && fact.label === scoreLabels[fact.kind as keyof typeof scoreLabels] && number(fact.contribution, 1) && fact.contribution > 0)
      need(value.catalogScope !== 'REVIEWED_FAMILY_BROWSE_DEMO' || fact.kind === 'category_match' || fact.kind === 'abv_comparison')
      if (fact.kind === 'abv_comparison' || fact.kind === 'volume_comparison') {
        const volume = fact.kind === 'volume_comparison'
        need(number(fact.actual_value, volume ? 1000000 : 100) && number(fact.target_value, volume ? 1000000 : 100) && fact.unit === (volume ? 'mL' : 'vol%'))
        need(!volume || integer(fact.actual_value, 1000000) && fact.actual_value > 0 && integer(fact.target_value, 1000000) && fact.target_value > 0)
      } else {
        need(text(fact.actual_value) && fact.target_value === fact.actual_value && !Object.hasOwn(fact, 'unit'))
        if (hasActivity && fact.kind === 'category_match') need(categoryContribution && fact.actual_value === product.type)
      }
    }
    need(Array.isArray(facts.filter_evidence) && facts.filter_evidence.length > 0 && facts.filter_evidence.length <= 4)
    for (const fact of facts.filter_evidence) {
      need(object(fact) && typeof fact.kind === 'string' && Object.hasOwn(filterLabels, fact.kind) && fact.label === filterLabels[fact.kind as keyof typeof filterLabels])
      if (fact.kind === 'availability_filter') need(fact.actual_value === true)
      else if (fact.kind === 'category_filter') need(text(fact.actual_value) && integer(fact.allowed_category_count, 32) && fact.allowed_category_count > 0)
      else {
        const price = fact.kind === 'price_filter', max = price ? 2147483647 : 100
        need(number(fact.actual_value, max) && (fact.minimum === null || number(fact.minimum, max)) && (fact.maximum === null || number(fact.maximum, max)) && fact.unit === (price ? 'KRW' : 'vol%'))
      }
    }
  })
  if (hasActivity) {
    const evidence = value.activityEvidence
    need(result.fallback_reason === null && object(evidence) && Object.keys(evidence).length === 2 && Object.hasOwn(evidence, 'favoriteCategories') && Object.hasOwn(evidence, 'highlyRatedCategories'))
    const evidencedCategories = new Set<string>()
    for (const list of [evidence.favoriteCategories, evidence.highlyRatedCategories]) {
      need(Array.isArray(list) && list.length <= 8 && new Set(list).size === list.length)
      for (const category of list) {
        need(typeof category === 'string' && categories.some(({ label }) => label === category) && matchedCategories.has(category))
        evidencedCategories.add(category)
      }
    }
    // The provider uses activity in place of unknown stored categories. A partial
    // origin set would incorrectly label the remaining activity facts as stored.
    need(evidencedCategories.size > 0 && evidencedCategories.size === matchedCategories.size)
  }
  return value as unknown as ContentResponse
}
