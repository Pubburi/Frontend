import { describe, expect, it } from 'vitest'
import { checkedOrderContext } from './orderRecommendations'
import type { Order } from './types'

const order: Order = { oId: 1, userId: 'A', orderType: 'ONLINE', completed: 'N', orderTime: '2026-11-08', totalPrice: 15554, priceBasis: 'ORDER_SNAPSHOT', details: [
  { id: 10, productId: 7, name: '옛 이름', quantity: 200, unitPrice: 7777, sumPrice: 15554 },
  { id: 11, productId: 7, name: '또 다른 주문 행', quantity: 1, unitPrice: 0, sumPrice: 0 },
] }
function wire(): any {
  return { source: 'PROVIDER', catalogScope: 'REVIEWED_LOCAL_CATALOG', orderId: 1, referenceCount: 2,
    references: order.details.map((row) => ({ detailId: row.id, productId: 7, name: '현재 이름', quantity: row.quantity, state: 'READY' })), unavailableReason: null,
    products: [{ id: 9, name: '후보', type: '탁주', price: 0, abv: 7.5, img: null, orderCount: 0 }], result: {
      algorithm: 'b1-tfidf-minmax-v1', aggregation_algorithm: 'r07-max-reference-v1', fit_scope: 'request_catalog', profile_source: 'explicit_context_product_facts', reference_group_policy: 'exclude_all_known_reference_groups',
      representation_fitted: true, model_fingerprint: 'a'.repeat(64), references: [{ product_id: 7, state: 'available' }], evaluated_reference_count: 1, fallback_reason: null,
      matches: [{ product_id: 9, reference_product_id: 7 }], items: [{ product_id: 9, score: 0.6984126984126984, reasons: ['content_similarity'], explanation: {
        version: 'r04-facts-v1', basis: 'content_similarity', comparison: { kind: 'reference_product', product_id: 7 }, fallback_reason: null, total_positive_contributions: 1, score_evidence_truncated: false,
        score_evidence: [{ kind: 'abv_comparison', label: '도수 비교 근거', actual_value: 7.5, target_value: 0, unit: 'vol%', contribution: 0.3 }], filter_evidence: [{ kind: 'availability_filter', label: '입력 가용 조건 충족', actual_value: true }],
      } }],
    } }
}
describe('own order context binding', () => {
  it('keeps each order row but uses unique provider IDs and raw score/current facts', () => {
    const value = wire(), before = structuredClone(order)
    expect(checkedOrderContext(value, order)).toBe(value)
    expect(value.result.items[0].score).toBe(0.6984126984126984)
    expect(value.references).toHaveLength(2); expect(value.result.references).toHaveLength(1)
    expect(order).toEqual(before); expect(value.products[0].price).toBe(0)
  })
  it.each([
    ['order', (v: any) => { v.orderId++ }], ['count', (v: any) => { v.referenceCount++ }],
    ['detail', (v: any) => { v.references[0].detailId++ }], ['product', (v: any) => { v.references[0].productId++ }],
    ['quantity', (v: any) => { v.references[0].quantity++ }], ['order rows', (v: any) => { v.references.reverse() }],
    ['partial', (v: any) => { v.references.pop() }], ['scope', (v: any) => { v.catalogScope = 'LOCAL' }],
    ['winner', (v: any) => { v.result.matches[0].reference_product_id = 8 }], ['reference explanation', (v: any) => { v.result.items[0].explanation.comparison.product_id = 8 }],
    ['padding', (v: any) => { v.result.items[0].score = 0 }], ['fallback products', (v: any) => { v.source = 'UNAVAILABLE'; v.unavailableReason = 'PROVIDER_UNAVAILABLE' }],
  ])('rejects a mismatched %s without partial cards', (_name, mutate) => { const v = wire(); mutate(v); expect(() => checkedOrderContext(v, order)).toThrow() })
  it('preserves deleted rows without recovering snapshot names or product IDs', () => {
    const input = structuredClone(order); input.details[0].productId = null
    const v = wire(); Object.assign(v, { source: 'UNAVAILABLE', unavailableReason: 'DELETED_ITEMS', result: null, products: [] }); Object.assign(v.references[0], { productId: null, name: null, state: 'DELETED' })
    expect(checkedOrderContext(v, input).references[0].name).toBeNull()
    v.references[0].name = '옛 이름'; expect(() => checkedOrderContext(v, input)).toThrow()
  })
  it('accepts no partial enumeration above twenty order rows', () => {
    const input = structuredClone(order); input.details = Array.from({ length: 21 }, (_, i) => ({ ...order.details[0], id: i + 1 }))
    const v = wire(); Object.assign(v, { source: 'UNAVAILABLE', referenceCount: 21, references: [], unavailableReason: 'REFERENCE_LIMIT', result: null, products: [] })
    expect(checkedOrderContext(v, input)).toBe(v)
    v.references = wire().references; expect(() => checkedOrderContext(v, input)).toThrow()
  })
  it('distinguishes unavailable current references and normal empty provider', () => {
    for (const [state, reason] of [['READY', 'PROVIDER_UNAVAILABLE'], ['CATALOG_UNAVAILABLE', 'CATALOG_UNAVAILABLE'], ['UNREVIEWED', 'UNREVIEWED_ITEMS'], ['UNAVAILABLE', 'UNAVAILABLE_REFERENCES']]) {
      const v = wire(); Object.assign(v, { source: 'UNAVAILABLE', unavailableReason: reason, products: [], result: null }); v.references.forEach((ref: any) => { ref.state = state }); expect(checkedOrderContext(v, order)).toBe(v)
    }
    const v = wire(); Object.assign(v.result, { items: [], matches: [], fallback_reason: 'no_matching_features' }); v.products = []; expect(checkedOrderContext(v, order)).toBe(v)
    const empty = { ...order, details: [] }; Object.assign(v, { source: 'UNAVAILABLE', referenceCount: 0, references: [], unavailableReason: 'EMPTY_ORDER', result: null }); expect(checkedOrderContext(v, empty)).toBe(v)
  })
})
