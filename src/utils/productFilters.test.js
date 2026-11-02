import { describe, expect, it } from 'vitest'
import { buildProductQuery, parseProductQuery } from './productFilters'

const categories = ['탁주', '맥주', '위스키']

describe('product route filters', () => {
  it('restores and sanitizes supported query values', () => {
    expect(parseProductQuery({ type: '위스키', q: '  블랙  ', sort: 'priceDesc', page: '3' }, categories)).toEqual({
      type: '위스키', q: '블랙', sort: 'priceDesc', page: 3, size: 12, minPriceKrw: '', maxPriceKrw: '', minAbvPercent: '', maxAbvPercent: '', tasteTag: [], aromaTag: [],
    })
    expect(parseProductQuery({ type: 'unknown', sort: 'random', page: '-2' }, categories)).toMatchObject({
      type: '', sort: 'popular', page: 1,
    })
  })

  it('restores range spellings and carries them through an applied page change', () => {
    const filters = parseProductQuery({ minPriceKrw: '0', maxPriceKrw: '12000', minAbvPercent: '6.25', maxAbvPercent: '15.00' }, categories)
    expect(buildProductQuery(filters, 2)).toEqual({ minPriceKrw: '0', maxPriceKrw: '12000', minAbvPercent: '6.25', maxAbvPercent: '15.00', sort: 'popular', page: 2 })
  })

  it('preserves every raw tag and builds canonical arrays for applied pagination', () => {
    const filters = parseProductQuery({ tasteTag: [' DRY,SWEET ', 'Line\nBreak'], aromaTag: ['Floral'], minPriceKrw: '0' }, categories)
    expect(filters.tasteTag).toEqual([' DRY,SWEET ', 'Line\nBreak'])
    expect(buildProductQuery(filters, 2)).toMatchObject({ tasteTag: ['dry,sweet', 'line\nbreak'], aromaTag: ['floral'], minPriceKrw: '0', page: 2 })
  })

  it('builds a compact shareable query and resets invalid pages', () => {
    expect(buildProductQuery({ type: '맥주', q: ' lager ', sort: 'name' }, 2)).toEqual({
      type: '맥주', q: 'lager', sort: 'name', page: 2,
    })
  })
})
