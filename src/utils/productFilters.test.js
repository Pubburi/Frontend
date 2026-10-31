import { describe, expect, it } from 'vitest'
import { buildProductQuery, parseProductQuery } from './productFilters'

const categories = ['탁주', '맥주', '위스키']

describe('product route filters', () => {
  it('restores and sanitizes supported query values', () => {
    expect(parseProductQuery({ type: '위스키', q: '  블랙  ', sort: 'priceDesc', page: '3' }, categories)).toEqual({
      type: '위스키', q: '블랙', sort: 'priceDesc', page: 3, size: 12,
    })
    expect(parseProductQuery({ type: 'unknown', sort: 'random', page: '-2' }, categories)).toMatchObject({
      type: '', sort: 'popular', page: 1,
    })
  })

  it('builds a compact shareable query and resets invalid pages', () => {
    expect(buildProductQuery({ type: '맥주', q: ' lager ', sort: 'name' }, 2)).toEqual({
      type: '맥주', q: 'lager', sort: 'name', page: 2,
    })
  })
})
