import { describe, expect, it } from 'vitest'
import { marketCoordinate, parseMarketId } from './markets'

describe('public market identity and coordinates', () => {
  it('accepts only canonical positive Java int IDs without coercion', () => {
    expect(parseMarketId('1')).toBe(1)
    expect(parseMarketId('2147483647')).toBe(2147483647)
    for (const value of [undefined, '', '0', '01', '-1', '+1', ' 1', '1 ', '1.0', '1e0', '1/2', '１', '2147483648', '99999999999999999999999999999'])
      expect(parseMarketId(value)).toBeNull()
  })
  it('keeps exact finite coordinate text and real zero within inclusive geographic bounds', () => {
    expect(marketCoordinate(0, 'latitude')).toBe('0')
    expect(marketCoordinate(37.1234567, 'latitude')).toBe('37.1234567')
    expect(marketCoordinate(-127.7654321, 'longitude')).toBe('-127.7654321')
    for (const n of [-90, 90]) expect(marketCoordinate(n, 'latitude')).toBe(String(n))
    for (const n of [-180, 180]) expect(marketCoordinate(n, 'longitude')).toBe(String(n))
  })
  it('does not turn missing, nonnumeric or out-of-range coordinates into zero', () => {
    for (const value of [null, undefined, '', '0', NaN, Infinity, -Infinity, {}, false]) {
      expect(marketCoordinate(value, 'latitude')).toBe('미확인')
      expect(marketCoordinate(value, 'longitude')).toBe('미확인')
    }
    expect(marketCoordinate(90.00001, 'latitude')).toBe('미확인')
    expect(marketCoordinate(-180.00001, 'longitude')).toBe('미확인')
  })
})
