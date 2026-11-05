import { describe, expect, it } from 'vitest'
import { parseContentResponse } from './contentRecommendations'

// Authored display contract, not a fitted model or service SKU.
function wire() {
  return { source: 'PROVIDER', catalogScope: 'REVIEWED_DEMO', products: [{ id: 7, name: 'DEMO', type: '맥주', price: 0, abv: 0, orderCount: 0, img: null }], result: {
    algorithm: 'b1-tfidf-minmax-v1', fit_scope: 'request_catalog', representation_fitted: true, model_fingerprint: 'a'.repeat(64), eligible_count: 1, supported_profile_tokens: 1, unknown_profile_tokens: 0, active_numeric_preferences: [], fallback_reason: null,
    items: [{ product_id: 7, score: 0.4, reasons: ['available', 'content_similarity'], contributions: [{ component: 'text', feature: 'taste:a,b\natom', contribution: 0.4 }], explanation: {
      version: 'r04-facts-v1', basis: 'content_similarity', comparison: { kind: 'profile' }, score_evidence: [{ kind: 'taste_match', label: '맛 태그 일치', actual_value: 'a,b\natom', target_value: 'a,b\natom', contribution: 0.4 }], filter_evidence: [{ kind: 'availability_filter', label: '입력 가용 조건 충족', actual_value: true }], total_positive_contributions: 1, score_evidence_truncated: false, fallback_reason: null,
    } }],
  } }
}
function activityWire(visible = true) {
  const value = wire(), item = value.result.items[0]
  const category = { kind: 'category_match', label: '주종 일치', actual_value: '맥주', target_value: '맥주', contribution: 0.1 }
  item.score = visible ? 0.5 : 0.73
  item.contributions.push({ component: 'text', feature: 'category:맥주', contribution: category.contribution })
  if (visible) item.explanation.score_evidence.push(category)
  else {
    for (const [atom, contribution] of [['고소함', 0.12], ['산뜻함', 0.11]] as const) {
      item.contributions.push({ component: 'text', feature: `taste:${atom}`, contribution })
      item.explanation.score_evidence.push({ kind: 'taste_match', label: '맛 태그 일치', actual_value: atom, target_value: atom, contribution })
    }
  }
  item.explanation.total_positive_contributions = item.contributions.length
  item.explanation.score_evidence_truncated = !visible
  return { ...value, activityEvidence: { favoriteCategories: ['맥주'], highlyRatedCategories: ['맥주'] } }
}
describe('owned content typed display boundary', () => {
  it('keeps ordered current Product7, real0 and comma/newline atoms without transforming the provider', () => {
    const value = wire()
    expect(parseContentResponse(value)).toBe(value)
    value.catalogScope = 'REVIEWED_FAMILY_BROWSE_DEMO'
    Object.assign(value.result.items[0].explanation.score_evidence[0], { kind: 'category_match', label: '주종 일치', actual_value: '맥주', target_value: '맥주' })
    expect(parseContentResponse(value)).toBe(value)
  })
  it('keeps provider empty and UNAVAILABLE as distinct results', () => {
    const empty = wire(); Object.assign(empty.result, { items: [], eligible_count: 0, fallback_reason: 'no_eligible_products' }); empty.products = []
    expect(parseContentResponse(empty).source).toBe('PROVIDER')
    expect(parseContentResponse({ source: 'UNAVAILABLE', catalogScope: 'REVIEWED_DEMO', products: [], result: null }).source).toBe('UNAVAILABLE')
    expect(() => parseContentResponse({ source: 'UNAVAILABLE', catalogScope: 'REVIEWED_FAMILY_BROWSE_DEMO', products: [], result: null })).toThrow()
  })
  it.each([true, false])('accepts a proven activity category whether the positive fact is visible or truncated (%s)', (visible) => {
    const value = activityWire(visible)
    expect(parseContentResponse(value)).toBe(value)
  })
  it.each([
    ['null', null],
    ['missing list', { favoriteCategories: ['맥주'] }],
    ['both empty', { favoriteCategories: [], highlyRatedCategories: [] }],
    ['duplicate in one source', { favoriteCategories: ['맥주', '맥주'], highlyRatedCategories: [] }],
    ['unearned canonical category', { favoriteCategories: ['맥주'], highlyRatedCategories: ['탁주'] }],
    ['noncanonical text', { favoriteCategories: ['맥주 '], highlyRatedCategories: [] }],
    ['unknown field', { favoriteCategories: ['맥주'], highlyRatedCategories: [], memberId: 'unknown' }],
    ['overlong list', { favoriteCategories: Array(9).fill('맥주'), highlyRatedCategories: [] }],
  ])('rejects activity evidence with %s', (_name, activityEvidence) => {
    expect(() => parseContentResponse({ ...activityWire(), activityEvidence })).toThrow()
  })
  it('rejects activity evidence without a positive category contribution tied to the returned product', () => {
    const value = activityWire()
    value.result.items[0].contributions[1].contribution = 0
    expect(() => parseContentResponse(value)).toThrow()
    value.result.items[0].contributions[1].contribution = 0.1
    value.products[0].type = '탁주'
    expect(() => parseContentResponse(value)).toThrow()
    const { activityEvidence } = activityWire()
    expect(() => parseContentResponse({ source: 'UNAVAILABLE', catalogScope: 'REVIEWED_DEMO', products: [], result: null, activityEvidence })).toThrow()
  })
  it('requires an activity source for every positively matched category when stored categories are unknown', () => {
    const value = activityWire(), other = activityWire()
    const item = other.result.items[0], product = other.products[0]
    Object.assign(item, { product_id: 8 }); Object.assign(product, { id: 8, type: '탁주' })
    item.contributions[1].feature = 'category:탁주'
    Object.assign(item.explanation.score_evidence[1], { actual_value: '탁주', target_value: '탁주' })
    value.result.items.push(item); value.products.push(product); value.result.eligible_count = 2
    expect(() => parseContentResponse(value)).toThrow()
    value.activityEvidence.highlyRatedCategories.push('탁주')
    expect(parseContentResponse(value)).toBe(value)
  })
  it.each([['taste_match', '맛 태그 일치'], ['aroma_match', '향 태그 일치']])('family unknown %s is not a display fact', (kind, label) => {
    const value = wire(); value.catalogScope = 'REVIEWED_FAMILY_BROWSE_DEMO'
    Object.assign(value.result.items[0].explanation.score_evidence[0], { kind, label })
    expect(() => parseContentResponse(value)).toThrow()
  })
  it.each([
    ['unknown authority', (v: ReturnType<typeof wire>) => { v.catalogScope = 'SKU_APPROVED' }],
    ['different product', (v: ReturnType<typeof wire>) => { v.products[0].id = 8 }],
    ['missing product', (v: ReturnType<typeof wire>) => { v.products = [] }],
    ['duplicate candidate', (v: ReturnType<typeof wire>) => { v.result.items.push(v.result.items[0]); v.products.push(v.products[0]); v.result.eligible_count = 2 }],
    ['numeric string', (v: ReturnType<typeof wire>) => { Object.assign(v.products[0], { price: '0' }) }],
    ['unknown reason', (v: ReturnType<typeof wire>) => { v.result.items[0].reasons.push('likes_match') }],
    ['wrong comparison owner', (v: ReturnType<typeof wire>) => { v.result.items[0].explanation.comparison.kind = 'reference_product' }],
    ['invented label', (v: ReturnType<typeof wire>) => { v.result.items[0].explanation.score_evidence[0].label = '구매 만족 보장' }],
    ['different matched atom', (v: ReturnType<typeof wire>) => { v.result.items[0].explanation.score_evidence[0].target_value = 'other' }],
    ['wrong unit', (v: ReturnType<typeof wire>) => { Object.assign(v.result.items[0].explanation.score_evidence[0], { kind: 'abv_comparison', label: '도수 비교 근거', actual_value: 0, target_value: 0, unit: 'KRW' }) }],
    ['family volume claim', (v: ReturnType<typeof wire>) => { v.catalogScope = 'REVIEWED_FAMILY_BROWSE_DEMO'; Object.assign(v.result.items[0].explanation.score_evidence[0], { kind: 'volume_comparison', label: '용량 비교 근거', actual_value: 330, target_value: 330, unit: 'mL' }) }],
    ['truncation mismatch', (v: ReturnType<typeof wire>) => { v.result.items[0].explanation.score_evidence_truncated = true }],
    ['empty hidden as success', (v: ReturnType<typeof wire>) => { v.result.items = []; v.products = []; v.result.eligible_count = 0 }],
  ])('rejects %s before showing facts', (_name, mutate) => {
    const value = wire(); mutate(value); expect(() => parseContentResponse(value)).toThrow()
  })
})
