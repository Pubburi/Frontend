import { describe, expect, it } from 'vitest'
import { checkedCartContext, contextUnavailable } from './cartRecommendations'
import type { AccountCart } from './types'

const product = { id: 7, name: '기준', type: '탁주', price: 0, abv: 6, orderCount: 0, img: null }
const cart: AccountCart = { version: 3, items: [{ productId: 7, productName: '옛 이름', currentProduct: product, quantity: 2 }] }
function response(): any {
  return { source: 'PROVIDER', catalogScope: 'REVIEWED_DEMO', cartVersion: 3, references: [{ productId: 7, name: '현재 기준', quantity: 2, state: 'READY' }], unavailableReason: null,
    products: [{ ...product, id: 9, name: '현재 후보' }], result: {
      algorithm: 'b1-tfidf-minmax-v1', aggregation_algorithm: 'r07-max-reference-v1', fit_scope: 'request_catalog', profile_source: 'explicit_context_product_facts', reference_group_policy: 'exclude_all_known_reference_groups',
      representation_fitted: true, model_fingerprint: 'a'.repeat(64), references: [{ product_id: 7, state: 'available' }], evaluated_reference_count: 1,
      fallback_reason: null, matches: [{ product_id: 9, reference_product_id: 7 }], items: [{ product_id: 9, score: 0.5, reasons: ['available', 'content_similarity'], explanation: {
        version: 'r04-facts-v1', basis: 'content_similarity', comparison: { kind: 'reference_product', product_id: 7 }, fallback_reason: null, total_positive_contributions: 1, score_evidence_truncated: false,
        score_evidence: [{ kind: 'taste_match', label: '맛 태그 일치', actual_value: 'dry,\n원문:atom', target_value: 'dry,\n원문:atom', contribution: 0.5 }], filter_evidence: [{ kind: 'availability_filter', label: '입력 가용 조건 충족', actual_value: true }],
      } }],
    } }
}
describe('current cart context display binding', () => {
  it('accepts only the explicit local scope while preserving bound references, raw score and current product', () => {
    const value = response(); value.catalogScope = 'REVIEWED_LOCAL_CATALOG'; value.result.items[0].score = 0.6984126984126984
    expect(checkedCartContext(value, cart)).toBe(value)
    expect(value.result.items[0].score).toBe(0.6984126984126984)
    Object.assign(value, { source: 'UNAVAILABLE', unavailableReason: 'PROVIDER_UNAVAILABLE', products: [], result: null })
    expect(checkedCartContext(value, cart)).toBe(value)
    value.catalogScope = 'LOCAL_CATALOG'; expect(() => checkedCartContext(value, cart)).toThrow()
  })
  it('preserves current names, raw atoms, actual zero price and missing image', () => {
    const result = checkedCartContext(response(), cart)
    expect(result.references[0].name).toBe('현재 기준'); expect(result.products[0].price).toBe(0); expect(result.products[0].img).toBeNull()
    expect(result.result?.items[0].explanation.score_evidence[0].actual_value).toBe('dry,\n원문:atom')
  })
  it('distinguishes every unsupported reason from an empty provider success', () => {
    for (const reason of Object.keys(contextUnavailable)) {
      const value = response(); Object.assign(value, { source: 'UNAVAILABLE', unavailableReason: reason, result: null, products: [] })
      const input = structuredClone(cart)
      if (reason === 'EMPTY_CART') { input.items = []; value.references = [] }
      else if (reason === 'REFERENCE_LIMIT') { input.items = Array.from({ length: 21 }, (_, i) => ({ ...cart.items[0], productId: i + 1 })); value.references = input.items.map((r) => ({ productId: r.productId, name: '기준', quantity: r.quantity, state: 'READY' })) }
      else if (reason !== 'PROVIDER_UNAVAILABLE') { value.references[0].state = ({ DELETED_ITEMS: 'DELETED', CATALOG_UNAVAILABLE: 'CATALOG_UNAVAILABLE', UNREVIEWED_ITEMS: 'UNREVIEWED', UNAVAILABLE_REFERENCES: 'UNAVAILABLE' } as Record<string, string>)[reason]; if (reason === 'DELETED_ITEMS') value.references[0].name = null }
      expect(checkedCartContext(value, input).source).toBe('UNAVAILABLE')
    }
    const value = response(); Object.assign(value.result, { items: [], matches: [], fallback_reason: 'no_matching_features' }); value.products = []
    expect(checkedCartContext(value, cart).result?.fallback_reason).toBe('no_matching_features')
  })
  it('rejects stale revision or reference ID/quantity/order/truncation', () => {
    for (const mutate of [(v: any) => { v.cartVersion++ }, (v: any) => { v.references[0].quantity++ }, (v: any) => { v.references[0].productId = 8 }, (v: any) => { v.references = [] }]) {
      const value = response(); mutate(value); expect(() => checkedCartContext(value, cart)).toThrow()
    }
  })
  it('preserves all deleted/unsupported reference rows without filling old snapshot names', () => {
    const value = response(); Object.assign(value, { source: 'UNAVAILABLE', unavailableReason: 'DELETED_ITEMS', products: [], result: null }); value.references[0] = { ...value.references[0], name: null, state: 'DELETED' }
    expect(checkedCartContext(value, cart).references[0].name).toBeNull()
    value.references[0].name = '옛 이름'; expect(() => checkedCartContext(value, cart)).toThrow()
  })
  it('binds each winning ID across matches, reference facts and public product', () => {
    for (const mutate of [(v: any) => { v.result.matches[0].reference_product_id = 8 }, (v: any) => { v.result.items[0].explanation.comparison.product_id = 8 }, (v: any) => { v.products[0].id = 8 }, (v: any) => { v.references[0].state = 'UNREVIEWED' }, (v: any) => { v.result.items[0].product_id = 7 }]) {
      const value = response(); mutate(value); expect(() => checkedCartContext(value, cart)).toThrow()
    }
  })
  it('rejects zero-score padding, invented labels/units and contradictory partial facts', () => {
    for (const mutate of [(v: any) => { v.result.items[0].score = 0 }, (v: any) => { v.result.items[0].explanation.score_evidence[0].label = '인기' }, (v: any) => { v.result.items[0].explanation.score_evidence[0].unit = '%' }, (v: any) => { v.result.items[0].explanation.score_evidence_truncated = true }]) {
      const value = response(); mutate(value); expect(() => checkedCartContext(value, cart)).toThrow()
    }
  })
  it('checks numeric mL/vol% evidence instead of calling all reference facts preferences', () => {
    const value = response(); value.result.items[0].explanation.score_evidence = [{ kind: 'volume_comparison', label: '용량 비교 근거', actual_value: 750, target_value: 500, unit: 'mL', contribution: 0.5 }]
    expect(checkedCartContext(value, cart).result?.items[0].explanation.score_evidence[0].unit).toBe('mL')
    value.result.items[0].explanation.score_evidence[0].actual_value = null; expect(() => checkedCartContext(value, cart)).toThrow()
  })
  it('never accepts fallback products as a fabricated provider or an unknown scope', () => {
    for (const mutate of [(v: any) => { v.source = 'BASELINE' }, (v: any) => { v.catalogScope = 'REVIEWED_FAMILY_BROWSE_DEMO' }, (v: any) => { v.source = 'UNAVAILABLE'; v.unavailableReason = 'PROVIDER_UNAVAILABLE' }, (v: any) => { v.result.items.push(v.result.items[0]); v.result.matches.push(v.result.matches[0]); v.products.push(v.products[0]) }]) {
      const value = response(); mutate(value); expect(() => checkedCartContext(value, cart)).toThrow()
    }
  })
})
