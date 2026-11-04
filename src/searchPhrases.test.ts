import { describe, expect, it } from 'vitest'
import { parseSearchPhraseResponse, searchPhraseUrl } from './searchPhrases'

const wire = () => ({ source: 'PROVIDER', result: { algorithm: 'r06-explicit-search-phrases-v1', items: [{ template_id: 'selected_preferences', label: '선택한 취향 조건으로 검색', conditions: { type: null, minPriceKrw: 0, maxPriceKrw: 20000, minAbvPercent: '0.00', maxAbvPercent: '20.00', tasteTag: ['dry,sweet', 'line\nbreak', 'A:Σ'], aromaTag: [] }, query_pairs: [{ name: 'minPriceKrw', value: '0' }, { name: 'maxPriceKrw', value: '20000' }, { name: 'minAbvPercent', value: '0.00' }, { name: 'maxAbvPercent', value: '20.00' }, { name: 'tasteTag', value: 'dry,sweet' }, { name: 'tasteTag', value: 'line\nbreak' }, { name: 'tasteTag', value: 'A:Σ' }], backend_unicode_revalidation_required: true }], candidate_count: 1, omitted_count: 0, product_count: null, diagnostics: [{ field: 'tasteTags', code: 'backend_unicode_revalidation_required' }], fallback_reason: null } })
describe('owned search phrase typed consumer', () => {
  it('keeps0/decimal scale and literal commas/newlines/nonASCII once encoded;never merges old search values', () => {
    const parsed = parseSearchPhraseResponse(wire()); expect(parsed).toEqual(wire())
    if (parsed.source !== 'PROVIDER') throw new Error('missing provider')
    const url = new URL(searchPhraseUrl(parsed.result.items[0]), 'http://local')
    expect([...url.searchParams]).toEqual([...wire().result.items[0].query_pairs.map(({ name, value }) => [name, value]), ['sort', 'name'], ['page', '1']])
    expect(url.searchParams.getAll('tasteTag')).toEqual(['dry,sweet', 'line\nbreak', 'A:Σ'])
    expect(url.searchParams.has('q')).toBe(false); expect(url.searchParams.has('size')).toBe(false)
  })
  it.each([
    (v: any) => { v.result.items[0].query_pairs[0].value = '1' },
    (v: any) => { v.result.items[0].query_pairs.reverse() },
    (v: any) => { v.result.items[0].query_pairs.push({ name: 'q', value: 'weaker' }) },
    (v: any) => { v.result.items[0].query_pairs[0].name = 'url' },
    (v: any) => { v.result.items[0].conditions.minPriceKrw = '0' },
    (v: any) => { v.result.items[0].conditions.maxAbvPercent = '1e2' },
    (v: any) => { v.result.items[0].conditions.type = '가짜 주종' },
    (v: any) => { v.result.items[0].conditions.tasteTag = ['a', 'A'] },
    (v: any) => { v.result.items[0].label = '추천 1위' },
    (v: any) => { v.result.items[0].template_id = 'fallback' },
    (v: any) => { v.result.items[0].template_id = ['selected_preferences'] },
    (v: any) => { v.result.items[0].template_id = { value: 'selected_preferences' } },
    (v: any) => { v.result.items[0].backend_unicode_revalidation_required = false },
    (v: any) => { v.result.product_count = 0 },
    (v: any) => { v.result.candidate_count = 2 },
    (v: any) => { v.result.omitted_count = 1 },
    (v: any) => { v.result.diagnostics[0].code = 'generated' },
    (v: any) => { v.result.fallback_reason = 'selected_preferences_empty' },
    (v: any) => { v.result.algorithm = 'ranker' },
    (v: any) => { v.result.items[0].owner = 'other' },
  ])('rejects inconsistent/extra/unsafe wire before a link exists', (change) => { const value = wire(); change(value); expect(() => parseSearchPhraseResponse(value)).toThrow() })
  it('distinguishes unavailable, selected unknown/empty/conflict and explicit all-products', () => {
    expect(parseSearchPhraseResponse({ source: 'UNAVAILABLE', result: null })).toEqual({ source: 'UNAVAILABLE', result: null })
    expect(() => parseSearchPhraseResponse({ source: 'UNAVAILABLE', result: wire().result })).toThrow()
    for (const fallback of ['selected_preferences_unknown', 'selected_preferences_empty', 'selected_target_outside_hard_bounds']) {
      const value = wire(); Object.assign(value.result, { items: [], candidate_count: 0, fallback_reason: fallback })
      expect(parseSearchPhraseResponse(value)).toEqual(value)
    }
    const value = wire(); Object.assign(value.result.items[0], { template_id: 'all_products', label: '전체 상품 보기', conditions: { type: null, minPriceKrw: null, maxPriceKrw: null, minAbvPercent: null, maxAbvPercent: null, tasteTag: [], aromaTag: [] }, query_pairs: [], backend_unicode_revalidation_required: false }); Object.assign(value.result, { diagnostics: [], fallback_reason: 'no_explicit_search_conditions' })
    const parsed = parseSearchPhraseResponse(value); if (parsed.source === 'PROVIDER') expect(searchPhraseUrl(parsed.result.items[0])).toBe('/products?sort=name&page=1')
  })
})
