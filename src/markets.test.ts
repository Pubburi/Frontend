import { describe, expect, it } from 'vitest'
import { parseMarketId } from './markets'

describe('public market identity', () => {
  it('accepts only canonical positive Java int IDs without coercion', () => {
    expect(parseMarketId('1')).toBe(1)
    expect(parseMarketId('2147483647')).toBe(2147483647)
    for (const value of [undefined, '', '0', '01', '-1', '+1', ' 1', '1 ', '1.0', '1e0', '1/2', '１', '2147483648', '99999999999999999999999999999'])
      expect(parseMarketId(value)).toBeNull()
  })
})
