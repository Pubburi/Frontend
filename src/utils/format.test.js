import { describe, expect, it } from 'vitest'
import { productImage, webpSource } from './format'

describe('format utilities', () => {
  it('prefers webp product image paths', () => {
    expect(productImage({ img: 'takju1.png' })).toBe('/images/pub/takju1.webp')
    expect(productImage({ img: '/images/category/탁주.png' })).toBe('/images/category/탁주.webp')
  })

  it('keeps existing webp paths and falls back to webp icon', () => {
    expect(productImage({ img: 'takju1.webp' })).toBe('/images/pub/takju1.webp')
    expect(productImage(null)).toBe('/images/icon/mainIcon.webp')
    expect(webpSource('/images/pub/sake1.jpg')).toBe('/images/pub/sake1.webp')
  })
})
