import { describe, expect, it } from 'vitest'
import { buildProductTags, normalizeProductTag, parseProductTags, validateProductTags } from './productTags'

describe('literal search tag contract', () => {
  it('keeps repeated values and literal comma/newline distinct from absent constraints', () => {
    expect(parseProductTags({ tasteTag: [' DRY,SWEET ', 'Line\nBreak'] })).toEqual({ tasteTag: [' DRY,SWEET ', 'Line\nBreak'], aromaTag: [] })
    expect(buildProductTags({ tasteTag: [' DRY,SWEET ', 'Line\nBreak'] })).toEqual({ tasteTag: ['dry,sweet', 'line\nbreak'] })
    expect(buildProductTags({})).toEqual({}); expect(validateProductTags({})).toEqual({})
    expect(buildProductTags({ tasteTag: [''] })).toEqual({ tasteTag: [''] })
  })
  it('preserves non-ASCII casing for the provider instead of browser Unicode guesses', () => {
    expect(buildProductTags({ tasteTag: ['\u1c89', 'A:Σ', 'AΣ:A', 'İ'] })).toEqual({ tasteTag: ['\u1c89', 'a:Σ', 'aΣ:a', 'İ'] })
    expect(buildProductTags({ tasteTag: ['Ä', 'ä'] })).toEqual({ tasteTag: ['Ä', 'ä'] })
  })
  it('uses provider Java whitespace stripping without dropping NBSP/FEFF or inner whitespace', () => {
    expect(normalizeProductTag('\u001c\u3000DRY\u2000')).toBe('dry')
    for (const value of ['\u00a0DRY\u00a0', '\ufeffDRY\ufeff', '\u2007DRY\u202f'])
      expect(normalizeProductTag(value)).toBe(value.toLowerCase())
    expect(normalizeProductTag('  A, B\nC  ')).toBe('a, b\nc')
  })
  it('rejects raw length, blank, malformed scalar, count and provable duplicates without truncation/deduping', () => {
    for (const value of ['', ' \n ', 'x'.repeat(41), ' '.repeat(40) + 'a', '\ud800'])
      expect(validateProductTags({ tasteTag: [value] }).tasteTag, value).toBeTruthy()
    expect(validateProductTags({ tasteTag: ['Dry', ' dry '] }).tasteTag?.index).toBe(1)
    expect(validateProductTags({ tasteTag: Array.from({ length: 21 }, (_, i) => `t${i}`) }).tasteTag?.index).toBe(20)
    expect(validateProductTags({ tasteTag: Array.from({ length: 20 }, (_, i) => `t${i}`), aromaTag: ['dry'] })).toEqual({})
    expect(validateProductTags({ tasteTag: ['dry'], aromaTag: ['DRY'] })).toEqual({})
    expect(validateProductTags({ tasteTag: ['😀'.repeat(20), '\u00a0'] })).toEqual({})
    expect(validateProductTags({ tasteTag: ['😀'.repeat(21)] }).tasteTag).toBeTruthy()
    expect(validateProductTags({ tasteTag: ['a'.repeat(39) + 'İ', 'Ä', 'ä'] })).toEqual({})
  })
})
