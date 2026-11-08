import { checkContextProducts, referenceStates, type ContextResult, type ContextReference } from './cartRecommendations'
import type { Order, Product } from './types'

export const orderContextUnavailable = {
  EMPTY_ORDER: '비교할 주문 상품이 없습니다.',
  REFERENCE_LIMIT: '주문 항목이20개를 넘습니다. 일부만 골라 비교하지 않았습니다.',
  DELETED_ITEMS: '삭제된 상품이 있어 비교하지 않았습니다. 주문 당시 이력은 그대로 보관됩니다.',
  CATALOG_UNAVAILABLE: '현재 검수 카탈로그를 확인하지 못했습니다.',
  UNREVIEWED_ITEMS: '검수 대상이 아닌 상품이 있어 비교하지 않았습니다.',
  UNAVAILABLE_REFERENCES: '비교에 사용할 수 없는 기준 상품이 있습니다.',
  PROVIDER_UNAVAILABLE: '추천 서버의 비교 결과를 확인하지 못했습니다. 주문 이력은 그대로입니다.',
} as const
export interface OrderReference {
  detailId: number; productId: number | null; name: string | null; quantity: number; state: ContextReference['state']
}
export interface OrderContextResponse {
  source: 'PROVIDER' | 'UNAVAILABLE'; catalogScope: 'REVIEWED_DEMO' | 'REVIEWED_LOCAL_CATALOG'
  orderId: number; referenceCount: number; references: OrderReference[]
  unavailableReason: keyof typeof orderContextUnavailable | null; result: ContextResult | null; products: Product[]
}
function need(value: unknown): asserts value { if (!value) throw new Error('주문의 상품 비교 응답을 확인하지 못했습니다.') }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

// Bind current comparison facts to every original order row, without rebuilding history.
export function checkedOrderContext(value: unknown, order: Order): OrderContextResponse {
  need(object(value) && Object.keys(value).length === 8 && value.orderId === order.oId && value.referenceCount === order.details.length &&
    (value.catalogScope === 'REVIEWED_DEMO' || value.catalogScope === 'REVIEWED_LOCAL_CATALOG') && Array.isArray(value.references) && Array.isArray(value.products))
  if (order.details.length > 20) {
    need(value.source === 'UNAVAILABLE' && value.unavailableReason === 'REFERENCE_LIMIT' && !value.references.length && value.result === null && !value.products.length)
    return value as unknown as OrderContextResponse
  }
  need(value.references.length === order.details.length)
  const ids = new Set<number>(), details = new Set<number>()
  value.references.forEach((ref, index) => {
    const row = order.details[index]
    need(object(ref) && Object.keys(ref).length === 5 && ref.detailId === row.id && Number.isInteger(row.id) && row.id > 0 && row.id <= 2147483647 && !details.has(row.id) && ref.productId === row.productId && ref.quantity === row.quantity &&
      Number.isInteger(ref.quantity) && row.quantity > 0 && row.quantity <= 2147483647 && typeof ref.state === 'string' && Object.hasOwn(referenceStates, ref.state) &&
      (ref.productId === null ? ref.state === 'DELETED' && ref.name === null : Number.isInteger(ref.productId) && row.productId! > 0 && row.productId! <= 2147483647 && ref.state !== 'DELETED' && typeof ref.name === 'string' && !!ref.name.trim()))
    details.add(row.id)
    if (row.productId !== null) ids.add(row.productId)
  })
  if (value.source === 'UNAVAILABLE') {
    need(typeof value.unavailableReason === 'string' && Object.hasOwn(orderContextUnavailable, value.unavailableReason) && value.result === null && !value.products.length)
    const states = value.references.map((ref) => ref.state)
    const reason = !states.length ? 'EMPTY_ORDER' : states.includes('DELETED') ? 'DELETED_ITEMS' : states.includes('CATALOG_UNAVAILABLE') ? 'CATALOG_UNAVAILABLE' :
      states.includes('UNREVIEWED') ? 'UNREVIEWED_ITEMS' : states.includes('UNAVAILABLE') ? 'UNAVAILABLE_REFERENCES' : 'PROVIDER_UNAVAILABLE'
    need(value.unavailableReason === reason)
  } else {
    need(value.source === 'PROVIDER' && value.unavailableReason === null && ids.size > 0 && value.references.every((ref) => ref.state === 'READY'))
    checkContextProducts(value, ids)
  }
  return value as unknown as OrderContextResponse
}
