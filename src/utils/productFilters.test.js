import { describe, expect, it } from 'vitest'
import { buildProductQuery, parseProductQuery, removeProductCondition } from './productFilters'

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

  it('removes only a selected applied scalar while preserving modified drafts and raw hard conditions', () => {
    const search = new URLSearchParams('q=old&minPriceKrw=0&minPriceKrw=10&maxPriceKrw=bad&sort=name&page=3')
    const applied = parseProductQuery(Object.fromEntries(search), categories)
    const draft = { ...applied, q: 'new draft', type: '맥주', sort: 'priceAsc' }
    const removed = removeProductCondition(search, applied, draft, 'q')
    expect(removed.search.has('q')).toBe(false)
    expect(removed.search.getAll('minPriceKrw')).toEqual(['0', '10'])
    expect(removed.search.get('maxPriceKrw')).toBe('bad')
    expect(removed.search.get('sort')).toBe('name')
    expect(removed.search.get('page')).toBe('1')
    expect(removed.form).toMatchObject({ q: 'new draft', type: '맥주', sort: 'priceAsc' })
    expect(search.get('q')).toBe('old')
    expect(draft.q).toBe('new draft')
  })

  it('clears an unchanged removed input but retains an independently edited value', () => {
    const search = new URLSearchParams('minPriceKrw=0&maxPriceKrw=12000&sort=name&page=2')
    const applied = parseProductQuery(Object.fromEntries(search), categories)
    expect(removeProductCondition(search, applied, applied, 'minPriceKrw').form.minPriceKrw).toBe('')
    expect(removeProductCondition(search, applied, { ...applied, minPriceKrw: '500' }, 'minPriceKrw').form.minPriceKrw).toBe('500')
    expect(removeProductCondition(search, applied, applied, 'minPriceKrw').search.get('maxPriceKrw')).toBe('12000')
  })

  it('removes one literal repeated tag without splitting commas/newlines or changing Unicode authority', () => {
    const search = new URLSearchParams([['tasteTag', 'dry,sweet'], ['tasteTag', 'Line\nBreak'], ['tasteTag', 'Ä'], ['aromaTag', 'Floral'], ['minPriceKrw', '0']])
    const applied = parseProductQuery({ ...Object.fromEntries(search), tasteTag: search.getAll('tasteTag'), aromaTag: search.getAll('aromaTag') }, categories)
    const removed = removeProductCondition(search, applied, applied, 'tasteTag', 1)
    expect(removed.search.getAll('tasteTag')).toEqual(['dry,sweet', 'Ä'])
    expect(removed.search.getAll('aromaTag')).toEqual(['Floral'])
    expect(removed.search.get('minPriceKrw')).toBe('0')
    expect(removed.form.tasteTag).toEqual(['dry,sweet', 'Ä'])
    expect(removeProductCondition(search, applied, { ...applied, tasteTag: ['new draft', 'Line\nBreak', 'Ä'] }, 'tasteTag', 1).form.tasteTag).toEqual(['new draft', 'Line\nBreak', 'Ä'])
  })

  it('does not transform a missing tag target into a broader search', () => {
    const search = new URLSearchParams('tasteTag=dry%2Csweet&minPriceKrw=0')
    const applied = parseProductQuery({ tasteTag: ['dry,sweet'], minPriceKrw: '0' }, categories)
    expect(removeProductCondition(search, applied, applied, 'tasteTag', 2)).toBeNull()
    expect(search.toString()).toBe('tasteTag=dry%2Csweet&minPriceKrw=0')
  })
})
