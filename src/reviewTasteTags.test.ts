import { describe, expect, it } from 'vitest'
import { buildReviewTasteTags, readReviewTasteTags } from './reviewTasteTags'

describe('optional subjective review tags', () => {
  it('preserves empty, literal commas/newlines, and provider-owned Unicode casing', () => {
    expect(buildReviewTasteTags([])).toEqual([])
    expect(buildReviewTasteTags(['  SWEET  ', 'grain\nsmoke', 'dry,sweet', 'ΟΣ', '\u00a0literal\u00a0'])).toEqual(['sweet', 'grain\nsmoke', 'dry,sweet', 'ΟΣ', '\u00a0literal\u00a0'])
  })
  it.each([[''], [' '], ['SWEET', ' sweet '], ['x'.repeat(41)], Array(21).fill('x'), ['\ud800']])('rejects invalid writes %j', (...tags) => {
    expect(() => buildReviewTasteTags(tags as string[])).toThrow()
  })
  it.each([undefined, null, 'sweet', [null], [''], ['SWEET', 'sweet']])('keeps unknown/invalid reads distinct from empty %j', (value) => {
    expect(readReviewTasteTags(value)).toBeNull()
  })
  it('retains an actual empty array and server literals without recomputing them', () => {
    expect(readReviewTasteTags([])).toEqual([])
    expect(readReviewTasteTags(['dry,sweet', 'grain\nsmoke', 'ΟΣ'])).toEqual(['dry,sweet', 'grain\nsmoke', 'ΟΣ'])
  })
})
