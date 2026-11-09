import { describe, expect, it } from 'vitest'
import { parseProductThemes } from './productThemes'

const row = (id: number, abv: number, volumeMl: number) => ({
  product: { id, name: `검수 상품 ${id}`, type: '탁주', price: 0, abv, img: null, orderCount: 0 },
  volumeMl,
})
function wire() {
  return structuredClone({
    source: 'REVIEWED_LOCAL_CATALOG',
    themes: [
      { id: 'BEGINNER', items: [row(1, 0, 299), row(2, 7, 300), row(3, 7, 500)] },
      { id: 'GIFT', items: [row(2, 7, 300), row(3, 7, 500), row(4, 7.01, 500)] },
      { id: 'TABLE', items: [row(5, 9.5, 501), row(3, 7, 500), row(4, 7.01, 500)] },
    ],
  })
}

describe('reviewed product themes', () => {
  it('preserves the given order, inclusive bounds, same product across themes and actual zero price', () => {
    const data = wire()
    const value = parseProductThemes(data)
    expect(value).toBe(data)
    expect(value.themes.map(({ items }) => items.map(({ product }) => product.id))).toEqual([[1, 2, 3], [2, 3, 4], [5, 3, 4]])
    expect(data.themes[0].items[0].product.price).toBe(0)
  })

  it('distinguishes three valid empty themes from unavailable authority', () => {
    const empty = wire()
    empty.themes.forEach((theme) => { theme.items = [] })
    expect(parseProductThemes(empty)).toEqual(empty)
    expect(parseProductThemes({ source: 'UNAVAILABLE', themes: [] })).toEqual({ source: 'UNAVAILABLE', themes: [] })
    expect(() => parseProductThemes({ source: 'UNAVAILABLE', themes: empty.themes })).toThrow()
  })

  it.each([
    ['scope', (data: ReturnType<typeof wire>) => { data.source = 'DEMO' }],
    ['theme order', (data: ReturnType<typeof wire>) => { data.themes.reverse() }],
    ['beginner bound', (data: ReturnType<typeof wire>) => { data.themes[0].items[2].product.abv = 7.01 }],
    ['gift lower bound', (data: ReturnType<typeof wire>) => { data.themes[1].items[0].volumeMl = 299 }],
    ['gift upper bound', (data: ReturnType<typeof wire>) => { data.themes[1].items[2].volumeMl = 501 }],
    ['table bound', (data: ReturnType<typeof wire>) => { data.themes[2].items[2].volumeMl = 499 }],
    ['table order', (data: ReturnType<typeof wire>) => { data.themes[2].items.reverse() }],
    ['tied ID order', (data: ReturnType<typeof wire>) => { data.themes[0].items.splice(1, 2, row(3, 7, 500), row(2, 7, 300)) }],
    ['duplicate ID', (data: ReturnType<typeof wire>) => { data.themes[1].items.push(row(4, 7.01, 500)) }],
    ['conflicting current price', (data: ReturnType<typeof wire>) => { data.themes[2].items[1].product.price = 2000 }],
    ['out-of-range ID', (data: ReturnType<typeof wire>) => { data.themes[0].items[0].product.id = 2147483648 }],
    ['fractional volume', (data: ReturnType<typeof wire>) => { data.themes[2].items[0].volumeMl = 501.5 }],
    ['too many products', (data: ReturnType<typeof wire>) => { data.themes[0].items = Array.from({ length: 7 }, (_, index) => row(20 + index, 5, 299)) }],
  ])('rejects invalid %s across the whole response', (_label, mutate) => {
    const data = wire()
    mutate(data)
    expect(() => parseProductThemes(data)).toThrow()
  })
})
