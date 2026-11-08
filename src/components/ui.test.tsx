import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Image } from './ui'

describe('product image fallback boundary', () => {
  let host: HTMLDivElement, root: Root
  beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
  afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals() })
  const image = () => host.querySelector('img')!
  function render(src: string | undefined, product = true) { act(() => root.render(<Image src={src} alt="등록 상품" product={product} />)) }
  function fail() { act(() => image().dispatchEvent(new Event('error'))) }
  it('identifies an absent product image while preserving an uncaptioned logo', () => {
    render(undefined); expect(host.querySelector('figcaption')?.textContent).toBe('상품 이미지 미등록'); expect(image().alt).toBe('상품 이미지 미등록 — 기본 아이콘')
    render('/images/icon/mainIcon.webp', false); expect(host.querySelector('figcaption')).toBeNull(); expect(image().alt).toBe('등록 상품')
  })
  it('tries the original after WebP failure and identifies the generic only when both fail', () => {
    render('/images/product.png'); expect(host.querySelector('source')?.getAttribute('srcset')).toBe('/images/product.webp'); expect(image().alt).toBe('등록 상품')
    fail(); expect(host.querySelector('source')).toBeNull(); expect(image().getAttribute('src')).toBe('/images/product.png'); expect(host.querySelector('figcaption')).toBeNull()
    fail(); expect(image().getAttribute('src')).toBe('/images/icon/mainIcon.webp'); expect(image().alt).toBe('상품 이미지 미등록 — 기본 아이콘'); expect(host.querySelector('figcaption')).not.toBeNull()
    fail(); expect(image().getAttribute('src')).toBe('/images/icon/mainIcon.webp')
  })
  it('resets failed attempts when the source changes, including A→B→A', () => {
    render('/images/a.png'); fail(); fail(); render('/images/b.png'); expect(image().getAttribute('src')).toBe('/images/b.png'); expect(host.querySelector('figcaption')).toBeNull()
    render('/images/a.png'); expect(host.querySelector('source')?.getAttribute('srcset')).toBe('/images/a.webp'); expect(image().getAttribute('src')).toBe('/images/a.png'); expect(image().alt).toBe('등록 상품'); expect(host.querySelector('figcaption')).toBeNull()
  })
})
