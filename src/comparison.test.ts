import { beforeEach, describe, expect, it } from 'vitest'
import { comparisonUrl, parseComparison } from './comparison'
import { useComparison } from './state/comparison'

describe('public product comparison selection contract', () => {
  beforeEach(() => useComparison.getState().replace([]))
  it('round-trips ordered IDs without product or account snapshots', () => {
    const url = comparisonUrl([7, 2147483647, 8])
    expect(parseComparison(new URL(url, 'https://example.test').searchParams)).toEqual({ ids: [7, 2147483647, 8], error: null })
    expect(parseComparison(new URLSearchParams())).toEqual({ ids: [], error: null })
  })
  for (const query of ['productId=', 'productId=0', 'productId=-1', 'productId=01', 'productId=1e2', 'productId=1.5', 'productId=7%0A', 'productId=7%20', 'productId=9007199254740992', 'productId=7&productId=7', 'productId=1&productId=2&productId=3&productId=4&productId=5']) {
    it(`rejects the whole invalid selection: ${query}`, () => {
      const result = parseComparison(new URLSearchParams(query))
      expect(result.ids).toEqual([])
      expect(result.error).toBeTruthy()
    })
  }
  it('enforces the four-item limit synchronously and removal permits the next choice', () => {
    const state = useComparison.getState()
    for (const id of [7, 8, 9, 10]) expect(state.toggle(id)).toBe(true)
    expect(state.toggle(11)).toBe(false)
    expect(useComparison.getState().ids).toEqual([7, 8, 9, 10])
    expect(state.toggle(8)).toBe(true)
    expect(state.toggle(11)).toBe(true)
    expect(useComparison.getState().ids).toEqual([7, 9, 10, 11])
    state.replace([7, 7])
    state.replace([0])
    expect(useComparison.getState().ids).toEqual([7, 9, 10, 11])
  })
})
