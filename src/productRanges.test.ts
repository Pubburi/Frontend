import { describe, expect, it } from 'vitest'
import { buildProductRanges, parseProductRanges, validateProductRanges } from './productRanges'

describe('catalog range provider contract', () => {
  it('preserves actual zero, spelling and missing values separately', () => {
    expect(parseProductRanges({ minPriceKrw: '0', maxAbvPercent: '100.00' })).toEqual({ minPriceKrw: '0', maxPriceKrw: '', minAbvPercent: '', maxAbvPercent: '100.00' })
    expect(buildProductRanges({ minPriceKrw: 0, maxPriceKrw: '', minAbvPercent: '0', maxAbvPercent: '100.00' })).toEqual({ minPriceKrw: '0', minAbvPercent: '0', maxAbvPercent: '100.00' })
    expect(validateProductRanges({})).toEqual({})
    expect(validateProductRanges({ minPriceKrw: '0', maxPriceKrw: '2147483647', minAbvPercent: '0', maxAbvPercent: '100.00' })).toEqual({})
  })
  it('matches the provider grammar instead of coercing numeric-like strings', () => {
    for (const value of ['-1', '+1', '1.0', '1e3', '0x10', ' 1', '1 ', '１２', '2147483648', '00000000000', 'NaN', 'Infinity'])
      expect(validateProductRanges({ minPriceKrw: value }).minPriceKrw, value).toBeTruthy()
    for (const value of ['-1', '+1', '.5', '1.', '1e1', '5.555', '100.01', '1000', ' 1', '１', 'NaN', 'Infinity'])
      expect(validateProductRanges({ minAbvPercent: value }).minAbvPercent, value).toBeTruthy()
    expect(validateProductRanges({ minPriceKrw: '0000000000', maxPriceKrw: '0000000001', minAbvPercent: '000.00', maxAbvPercent: '001.25' })).toEqual({})
  })
  it('rejects explicitly empty/repeated URL bounds and inverted ranges without dropping them', () => {
    expect(validateProductRanges({ minPriceKrw: '' }, { provided: ['minPriceKrw'] }).minPriceKrw).toBeTruthy()
    expect(validateProductRanges({ minPriceKrw: '100' }, { duplicates: ['minPriceKrw'] }).minPriceKrw).toBeTruthy()
    expect(validateProductRanges({ minPriceKrw: '100', maxPriceKrw: '99', minAbvPercent: '6.26', maxAbvPercent: '6.25' })).toEqual({ maxPriceKrw: expect.any(String), maxAbvPercent: expect.any(String) })
    expect(buildProductRanges(parseProductRanges({ minPriceKrw: 'bad', maxAbvPercent: '5.555' }))).toEqual({ minPriceKrw: 'bad', maxAbvPercent: '5.555' })
  })
})
