import { describe, expect, it } from 'vitest'
import { demoOrderStatus, parseOrderId } from './orders'

describe('demo order detail contract', () => {
  it('accepts only canonical positive Java int order IDs', () => {
    expect(parseOrderId('1')).toBe(1)
    expect(parseOrderId('2147483647')).toBe(2147483647)
    for (const value of [undefined, '', '0', '01', '-1', '+1', ' 1', '1.0', '1e0', '2147483648', '1/2', '999999999999999999999']) expect(parseOrderId(value)).toBeNull()
  })
  it('labels only known demo states and never infers payment or delivery from an unknown code', () => {
    expect(demoOrderStatus('N')).toBe('데모 접수')
    expect(demoOrderStatus('Y')).toBe('데모 처리 완료')
    for (const value of ['', '?', 'PAID', 'DELIVERED', 'y']) expect(demoOrderStatus(value)).toBe('상태 미확인')
  })
})
