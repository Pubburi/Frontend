import { useId, useLayoutEffect, useRef, type MouseEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { parseProductThemes, productThemes, type ProductThemeId } from '../productThemes'
import type { ProductOrigin } from '../pages/CatalogPages'
import { api, ApiClientError } from '../services/api'
import { useUi } from '../state/ui'
import { money } from '../utils/format'

export function HomeProductThemes({ productReturn, onOpen }: {
  productReturn: ProductOrigin | null
  onOpen: (event: MouseEvent<HTMLAnchorElement>, productId: number, theme: ProductThemeId) => void
}) {
  const title = useId()
  const { key } = useLocation()
  const region = useRef<HTMLElement>(null)
  const restored = useRef<ProductOrigin | null>(null)
  const selection = useUi((state) => state.homeTheme)
  const select = useUi((state) => state.selectHomeTheme)
  const selectedId = selection?.locationKey === key ? selection.id : productReturn?.theme
  const selected = productThemes.find((theme) => theme.id === selectedId)
  const query = useQuery({
    queryKey: ['catalog', 'home-themes', key],
    queryFn: async ({ signal }) => parseProductThemes(await api.productThemes(signal)),
    enabled: !!selected,
    gcTime: 0,
    refetchOnReconnect: false,
    networkMode: 'always',
  })
  const busy = query.isPending || query.fetchStatus !== 'idle'
  const items = query.data?.themes.find((theme) => theme.id === selected?.id)?.items
  const changed = query.error instanceof ApiClientError && query.error.status === 409
  useLayoutEffect(() => {
    const section = region.current
    if (!section || !productReturn || productReturn.theme !== selectedId || restored.current === productReturn) return
    const discard = () => { restored.current = productReturn }
    const restore = () => {
      if (restored.current === productReturn) return
      discard()
      if (document.activeElement !== document.body) return
      const link = section.querySelector<HTMLAnchorElement>(`[data-theme-product="${productReturn.productId}"] a`)
      if (link) {
        if (productReturn.keyboard) link.focus({ preventScroll: true })
        const { top, height } = link.getBoundingClientRect()
        const inset = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
        if (productReturn.top >= inset && productReturn.top + height <= window.innerHeight) {
          window.scrollBy({ top: top - productReturn.top, behavior: 'instant' })
        } else {
          link.scrollIntoView({ block: 'center', behavior: 'instant' })
        }
      } else {
        const option = section.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
        if (productReturn.keyboard) option?.focus({ preventScroll: true })
        option?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
      }
    }
    const interactions = ['keydown', 'pointerdown', 'wheel']
    for (const event of interactions) window.addEventListener(event, discard, { once: true, passive: true })
    const frame = busy ? null : requestAnimationFrame(restore)
    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      for (const event of interactions) window.removeEventListener(event, discard)
    }
  }, [productReturn, selectedId, busy])

  return <section ref={region} className="section-band catalog-home-themes" aria-labelledby={title}>
    <div className="section-heading">
      <div>
        <h2 id={title}>테마로 둘러보기</h2>
        <p className="muted">검수 상품을 도수와 용량으로 둘러보세요.</p>
      </div>
    </div>
    <div className="button-row theme-options" role="group" aria-label="탐색 테마">
      {productThemes.map(({ id, label }) => <button key={id} type="button"
        className={`btn btn-sm ${selected?.id === id ? 'btn-dark' : 'btn-outline-dark'}`}
        aria-pressed={selected?.id === id} onClick={() => select(key, id)}>{label}</button>)}
    </div>
    {selected && <>
      <h3 className="theme-criterion">{selected.label} · {selected.criterion}</h3>
      {busy ? <p role="status">테마 목록을 확인하는 중입니다.</p> : query.isError ?
        <p role="status">{changed ? '테마 상품 정보가 변경되었습니다. 다시 확인해 주세요.' : '테마 목록을 불러오지 못했습니다.'}</p> :
        query.data?.source === 'UNAVAILABLE' ? <p role="status">테마 목록을 준비하지 못했습니다.</p> :
          items?.length ? <ul className="content-cards theme-cards">
            {items.map(({ product, volumeMl }) => <li key={product.id} className="content-card" data-theme-product={product.id}>
              <h4><Link className="text-link" to={`/products/${product.id}`} onClick={(event) => onOpen(event, product.id, selected.id)}>{product.name}</Link></h4>
              <p>시연 가격 {money(product.price)}원 · 도수 {product.abv}% · {volumeMl}mL</p>
            </li>)}
          </ul> : <p role="status">이 기준에 맞는 검수 상품이 없습니다.</p>}
      <button type="button" className="text-button" aria-disabled={busy} onClick={() => {
        if (!busy) void query.refetch({ cancelRefetch: false })
      }}>테마 목록 다시 확인</button>
    </>}
  </section>
}
