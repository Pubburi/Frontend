import { describe, expect, it } from 'vitest'
import { parseSimilarProducts } from './SimilarProducts'

function wire() {
  return { items: [{ id: 8, name: '검수 후보' }], catalogScope: 'REVIEWED_LOCAL_CATALOG', explanations: [{ productId: 8, explanation: {
    version: 'r04-facts-v1', basis: 'content_similarity', comparison: { kind: 'reference_product', product_id: 7 }, fallback_reason: null,
    total_positive_contributions: 2, score_evidence_truncated: false, score_evidence: [
      { kind: 'taste_match', label: '맛 태그 일치', actual_value: 'dry,\n<b>:atom', target_value: 'dry,\n<b>:atom', contribution: 0.3 },
      { kind: 'abv_comparison', label: '도수 비교 근거', actual_value: 0, target_value: 7.5, unit: 'vol%', contribution: 0.2 },
    ], filter_evidence: [{ kind: 'availability_filter', label: '입력 가용 조건 충족', actual_value: true }],
  } }] }
}
describe('similar product explanation boundary', () => {
  it('preserves exact legacy links without inventing explanations', () => {
    for (const value of [{ items: [{ id: 8, name: '원래 링크' }] }, { items: [{ id: 8, name: '원래 링크' }], catalogScope: 'REVIEWED_LOCAL_CATALOG' }]) {
      expect(parseSimilarProducts(value, 7).links).toEqual([{ id: 8, name: '원래 링크' }])
    }
  })
  it('preserves ordered candidate IDs, raw atoms, zero and fractional facts without a score', () => {
    const value = wire(), parsed = parseSimilarProducts(value, 7)
    expect(parsed.links[0].explanation).toBe(value.explanations[0].explanation)
    expect(parsed.links[0].explanation?.score_evidence[0].actual_value).toBe('dry,\n<b>:atom')
    expect(parsed.links[0].explanation?.score_evidence[1].actual_value).toBe(0)
    expect(parsed.links[0]).not.toHaveProperty('score')
  })
  it('accepts explicit empty and truncated actual facts', () => {
    expect(parseSimilarProducts({ items: [], explanations: [] }, 7).links).toEqual([])
    const value = wire(), facts = value.explanations[0].explanation
    facts.score_evidence.push({ ...facts.score_evidence[0], actual_value: '원문', target_value: '원문' })
    facts.total_positive_contributions = 4; facts.score_evidence_truncated = true
    expect(parseSimilarProducts(value, 7).links[0].explanation?.total_positive_contributions).toBe(4)
  })
  it.each([
    ['missing explanation', (v: any) => { v.explanations = [] }],
    ['present null', (v: any) => { v.explanations = null }],
    ['different candidate', (v: any) => { v.explanations[0].productId = 9 }],
    ['different reference', (v: any) => { v.explanations[0].explanation.comparison.product_id = 9 }],
    ['profile comparison', (v: any) => { v.explanations[0].explanation.comparison = { kind: 'profile' } }],
    ['invented label', (v: any) => { v.explanations[0].explanation.score_evidence[0].label = '취향 적중 보장' }],
    ['wrong numeric unit', (v: any) => { v.explanations[0].explanation.score_evidence[1].unit = 'KRW' }],
    ['different atom', (v: any) => { v.explanations[0].explanation.score_evidence[0].target_value = 'other' }],
    ['unearned availability', (v: any) => { v.explanations[0].explanation.filter_evidence[0].actual_value = false }],
    ['unknown scope', (v: any) => { v.catalogScope = 'LOCAL_CATALOG' }],
    ['false truncation', (v: any) => { v.explanations[0].explanation.total_positive_contributions = 4 }],
    ['zero evidence', (v: any) => { v.explanations[0].explanation.score_evidence[0].contribution = 0 }],
    ['extra evidence', (v: any) => { v.explanations[0].explanation.score_evidence[0].score = 0.9 }],
  ])('rejects the whole explicit response for %s', (_name, mutate) => {
    const value = wire(); mutate(value); expect(() => parseSimilarProducts(value, 7)).toThrow()
  })
  it('rejects reordered or duplicated explicit IDs without returning a partial link', () => {
    const value = wire(); value.items.push({ id: 9, name: '두 번째' }); value.explanations.push({ ...structuredClone(value.explanations[0]), productId: 9 })
    expect(parseSimilarProducts(value, 7).links.map((v) => v.id)).toEqual([8, 9])
    value.explanations.reverse(); expect(() => parseSimilarProducts(value, 7)).toThrow()
  })
})
