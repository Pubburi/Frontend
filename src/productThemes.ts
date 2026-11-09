import type { Product } from './types'

export const productThemes = [
  { id: 'BEGINNER', label: '입문', criterion: '도수 7% 이하' },
  { id: 'GIFT', label: '선물', criterion: '용량 300–500mL' },
  { id: 'TABLE', label: '음식 자리', criterion: '용량 500mL 이상' },
] as const

export type ProductThemeId = typeof productThemes[number]['id']
interface ThemeItem { product: Product; volumeMl: number }
type ProductThemesResponse =
  | { source: 'UNAVAILABLE'; themes: [] }
  | { source: 'REVIEWED_LOCAL_CATALOG'; themes: { id: ProductThemeId; items: ThemeItem[] }[] }

const productKeys = ['id', 'name', 'type', 'price', 'abv', 'img', 'orderCount'] as const
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const integer = (value: unknown, minimum: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= 2147483647

function need(value: unknown): asserts value {
  if (!value) throw new Error('검수 테마 응답을 확인하지 못했습니다.')
}

function checkProduct(product: unknown): asserts product is Product {
  need(object(product) && Object.keys(product).length === productKeys.length && productKeys.every((key) => Object.hasOwn(product, key)))
  need(integer(product.id, 1) && text(product.name) && text(product.type) && integer(product.price, 0))
  need(typeof product.abv === 'number' && Number.isFinite(product.abv) && product.abv >= 0 && product.abv <= 100)
  need((product.img === null || typeof product.img === 'string') && integer(product.orderCount, 0))
}

function rank(theme: ProductThemeId, { product, volumeMl }: ThemeItem): number | null {
  if (theme === 'BEGINNER') return product.abv <= 7 ? product.abv : null
  if (theme === 'GIFT') return volumeMl >= 300 && volumeMl <= 500 ? volumeMl : null
  return volumeMl >= 500 ? -volumeMl : null
}

export function parseProductThemes(value: unknown): ProductThemesResponse {
  need(object(value) && Object.keys(value).length === 2 && Array.isArray(value.themes))
  if (value.source === 'UNAVAILABLE') {
    need(value.themes.length === 0)
    return { source: value.source, themes: [] }
  }
  need(value.source === 'REVIEWED_LOCAL_CATALOG' && value.themes.length === productThemes.length)
  const products = new Map<number, ThemeItem>()
  for (const [index, theme] of value.themes.entries()) {
    const id = productThemes[index].id
    need(object(theme) && Object.keys(theme).length === 2 && theme.id === id && Array.isArray(theme.items) && theme.items.length <= 6)
    const ids = new Set<number>()
    let previousRank = -Infinity
    let previousId = 0
    for (const item of theme.items) {
      need(object(item) && Object.keys(item).length === 2 && integer(item.volumeMl, 1))
      const product = item.product
      checkProduct(product)
      need(!ids.has(product.id))
      const current = { product, volumeMl: item.volumeMl }
      const currentRank = rank(id, current)
      need(currentRank !== null && (currentRank > previousRank || currentRank === previousRank && product.id > previousId))
      const seen = products.get(product.id)
      need(!seen || seen.volumeMl === current.volumeMl && productKeys.every((key) => seen.product[key] === product[key]))
      products.set(product.id, current)
      ids.add(product.id)
      previousRank = currentRank
      previousId = product.id
    }
  }
  return value as unknown as ProductThemesResponse
}
