import { describe, expect, it } from 'vitest'
import { reviewSummary, type ReviewPage } from './reviewSummary'

const page = (ratingSummary: unknown, total = 12): ReviewPage => ({
  items: total === 0 ? [] : [{ id: 1, productId: 8, userId: 'authored', rating: 5, comment: '현재 페이지 표본' }],
  page: 1, size: 1, total, totalPages: total, hasNext: total > 1, ratingSummary,
})
describe('whole-product review summary', () => {
  it('preserves the provider aggregate instead of deriving the current page mean', () => {
    expect(reviewSummary(page({ count: 12, average: 2.75 }))).toEqual({ count: 12, average: 2.75 })
  })
  it.each([0, 3.25, 5.56, -0.5])('keeps finite stored values without clipping: %s', (average) => {
    expect(reviewSummary(page({ count: 12, average }))).toEqual({ count: 12, average })
  })
  it('distinguishes an empty aggregate from a real zero average', () => {
    expect(reviewSummary(page({ count: 0, average: null }, 0))).toEqual({ count: 0, average: null })
    expect(reviewSummary(page({ count: 0, average: 0 }, 0))).toBeNull()
    expect(reviewSummary(page({ count: 12, average: null }))).toBeNull()
  })
  it.each([undefined, null, [], {}, { count: 11, average: 2.75 }, { count: '12', average: 2.75 },
    { count: 12.5, average: 2.75 }, { count: -1, average: 2.75 }, { count: 12, average: '2.75' },
    { count: 12, average: NaN }, { count: 12, average: Infinity }, { count: 12 }])(
    'does not invent an aggregate from missing, mismatched or invalid metadata: %j', (value) => {
      expect(reviewSummary(page(value))).toBeNull()
    },
  )
})
