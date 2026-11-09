import { useId } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { parseProductThemes, productThemes } from '../productThemes'
import { api, ApiClientError } from '../services/api'
import { useUi } from '../state/ui'
import { money } from '../utils/format'

export function HomeProductThemes() {
  const title = useId()
  const { key } = useLocation()
  const selection = useUi((state) => state.homeTheme)
  const select = useUi((state) => state.selectHomeTheme)
  const selected = productThemes.find((theme) => selection?.locationKey === key && theme.id === selection.id)
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

  return <section className="section-band content-recommendations" aria-labelledby={title}>
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
              <h4><Link className="text-link" to={`/products/${product.id}`}>{product.name}</Link></h4>
              <p>시연 가격 {money(product.price)}원 · 도수 {product.abv}% · {volumeMl}mL</p>
            </li>)}
          </ul> : <p role="status">이 기준에 맞는 검수 상품이 없습니다.</p>}
      <button type="button" className="text-button" aria-disabled={busy} onClick={() => {
        if (!busy) void query.refetch({ cancelRefetch: false })
      }}>테마 목록 다시 확인</button>
    </>}
  </section>
}
