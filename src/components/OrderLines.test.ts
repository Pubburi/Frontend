import { describe, expect, it } from 'vitest'
import { orderMoney, priceBasisLabel } from './OrderLines'

describe('order snapshot display contract', () => {
  it('distinguishes unknown totals from a verified zero amount', () => {
    expect(orderMoney(null)).toBe('금액 미확인')
    expect(orderMoney(undefined)).toBe('금액 미확인')
    expect(orderMoney(0)).toBe('0원')
    expect(orderMoney(12000)).toBe('12,000원')
  })
  it('does not present estimated or unknown prices as order-time snapshots', () => {
    expect(priceBasisLabel('ORDER_SNAPSHOT')).toBe('주문 당시 금액')
    expect(priceBasisLabel('LEGACY_ESTIMATE')).toBe('과거 주문 추정 금액')
    expect(priceBasisLabel('FUTURE_VALUE')).toBe('금액 출처 미확인')
    expect(priceBasisLabel(null)).toBe('금액 출처 미확인')
  })
})
