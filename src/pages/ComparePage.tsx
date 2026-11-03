import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { api, ApiClientError } from '../services/api'
import { comparisonUrl, parseComparison } from '../comparison'
import { useComparison } from '../state/comparison'
import { publicSourceLink } from '../publicProductFeatures'
import { money } from '../utils/format'
import type { Product, ProductFeatures } from '../types'

function Tags({ values }: { values: string[] | null }) {
  if (values === null) return <span className="muted">미확인</span>
  if (!values.length) return <span className="muted">등록된 태그 없음</span>
  return <ul className="product-feature-tags">{values.map((tag, index) => <li key={index}>{tag}</li>)}</ul>
}
const numeric = (value: number | null | undefined, unit: string) =>
  value == null || !Number.isFinite(value) ? '미확인' : `${unit === '원' ? money(value) : unit === '%' ? String(value) : value.toLocaleString('ko-KR')}${unit}`

export function ComparePage() {
  const [search, setSearch] = useSearchParams()
  const { ids, error } = parseComparison(search)
  const heading = useRef<HTMLHeadingElement>(null)
  const replace = useComparison((state) => state.replace)
  useEffect(() => { if (!error) replace(ids) }, [search.toString(), error, replace])
  const products = useQueries({ queries: ids.map((id) => ({
    queryKey: ['comparison', 'product', id],
    queryFn: async (): Promise<Product> => {
      const data = await api.product(id)
      if (data?.id !== id) throw new Error('현재 상품의 정보를 확인하지 못했습니다.')
      return data
    },
  })) })
  const features = useQueries({ queries: ids.map((id, index) => ({
    queryKey: ['comparison', 'features', id],
    queryFn: async (): Promise<ProductFeatures> => {
      const data = await api.productFeatures(id)
      if (data?.productId !== id) throw new Error('현재 상품의 특성을 확인하지 못했습니다.')
      return data
    },
    enabled: products[index].isSuccess && !products[index].isFetching && !products[index].isPaused,
  })) })
  function select(next: number[], event: MouseEvent<HTMLButtonElement>) {
    if (event.detail === 0 && document.activeElement === event.currentTarget) heading.current?.focus({ preventScroll: true })
    replace(next)
    setSearch(new URLSearchParams(comparisonUrl(next).split('?')[1] ?? ''))
  }
  function productValue(index: number, render: (product: Product) => ReactNode) {
    const query = products[index]
    if (query.isPaused) return <span className="muted">연결을 기다리는 중</span>
    if (query.isPending || query.isFetching) return <span className="muted">불러오는 중</span>
    if (query.isError) return <span className="muted">확인할 수 없음</span>
    return render(query.data)
  }
  function featureValue(index: number, render: (value: ProductFeatures) => ReactNode) {
    if (!products[index].isSuccess || products[index].isFetching || products[index].isPaused) return <span className="muted">상품 정보 확인 후 조회</span>
    const query = features[index]
    if (query.isPaused) return <span className="muted">연결을 기다리는 중</span>
    if (query.isPending || query.isFetching) return <span className="muted">불러오는 중</span>
    if (query.isError) return <span className="muted">확인할 수 없음</span>
    return render(query.data)
  }
  const rows: { key: string; label: string; render: (index: number) => ReactNode }[] = [
    { key: 'price', label: '가격', render: (i) => productValue(i, (p) => numeric(p.price, '원')) },
    { key: 'abv', label: '도수', render: (i) => productValue(i, (p) => numeric(p.abv, '%')) },
    { key: 'type', label: '주종', render: (i) => productValue(i, (p) => p.type) },
    { key: 'feature-state', label: '특성 조회', render: (i) => {
      if (!products[i].isSuccess || products[i].isFetching || products[i].isPaused) return '상품 정보 확인 후 조회'
      const query = features[i]
      if (query.isPaused) return <span role="status">연결을 기다리는 중입니다.</span>
      if (query.isPending || query.isFetching) return <span role="status">상품 특성을 불러오는 중입니다.</span>
      if (query.isError) return <div role="status"><p>상품 특성을 불러오지 못했습니다.</p><button className="btn btn-outline-dark btn-sm" onClick={() => query.refetch()}>특성 다시 불러오기</button></div>
      return '조회 완료'
    } },
    { key: 'volume', label: '용량', render: (i) => featureValue(i, (f) => numeric(f.volumeMl, ' mL')) },
    { key: 'taste', label: '맛', render: (i) => featureValue(i, (f) => <Tags values={f.tasteTags} />) },
    { key: 'aroma', label: '향', render: (i) => featureValue(i, (f) => <Tags values={f.aromaTags} />) },
    { key: 'source', label: '특성 출처', render: (i) => featureValue(i, (f) => {
      const link = publicSourceLink(f.sourceUrl)
      return <><span>{f.sourceName ?? '미확인'}</span>{link && <a href={link} target="_blank" rel="noopener noreferrer">출처 보기 (새 창)</a>}{f.sourceNote && <p>{f.sourceNote}</p>}</>
    }) },
  ]
  return <section className="view comparison-view">
    <div className="shop-intro compact-intro">
      <div><p className="section-kicker">Compare</p><h1 tabIndex={-1} ref={heading}>상품 비교</h1><p>최대 4개의 현재 상품 정보를 나란히 확인하세요. 확인하지 못한 특성은 추정하지 않습니다.</p></div>
    </div>
    <div className="button-row comparison-actions">
      <Link className="btn btn-outline-dark" to="/products">상품 더 고르기</Link>
      {(ids.length > 0 || error) && <button className="btn btn-outline-dark" onClick={(event) => select([], event)}>비교 전체 해제</button>}
    </div>
    {error ? <div className="state-panel" role="alert"><h2>비교 상품 주소를 확인해 주세요</h2><p>{error} 선택을 해제한 뒤 상품을 다시 골라 주세요.</p></div> : !ids.length ?
      <div className="state-panel" role="status"><h2>비교할 상품을 골라 주세요</h2><p>목록이나 상세에서 비교 선택을 누르면 이 화면에서 함께 볼 수 있습니다. 선택은 이 창에서 유지되며 비교 주소로 다시 열 수 있습니다.</p></div> : <>
        <p className="muted" id="comparison-scroll-hint">좁은 화면에서는 비교 표를 좌우로 이동해 모든 상품을 확인하세요.</p>
        <div className="comparison-scroll" role="region" aria-label="상품 비교 표" aria-describedby="comparison-scroll-hint" tabIndex={0}>
          <table className="comparison-table" style={{ minWidth: 110 + ids.length * 240 }}>
            <caption>선택한 {ids.length}개 상품의 현재 가격·도수·주종과 확인된 특성 비교</caption>
            <thead><tr><th scope="col">비교 항목</th>{ids.map((id, index) => {
              const query = products[index]
              return <th scope="col" key={id} data-product-id={id}>
                <button className="btn btn-outline-dark btn-sm" aria-label={`상품 ${id} 비교 해제`} onClick={(event) => select(ids.filter((value) => value !== id), event)}>비교 해제</button>
                <h2>{productValue(index, (p) => <Link to={`/products/${id}`}>{p.name}</Link>)}</h2>
                {query.isPaused ? <p role="status">연결을 기다리는 중입니다.</p> : (query.isPending || query.isFetching) ? <p role="status">상품 {id} 정보를 불러오는 중입니다.</p> : query.isError ? <div role="status"><p>{query.error instanceof ApiClientError && query.error.status === 404 ? '상품을 찾을 수 없습니다.' : '상품을 불러오지 못했습니다.'}</p><button className="btn btn-outline-dark btn-sm" onClick={() => query.refetch()}>상품 다시 불러오기</button></div> : null}
              </th>
            })}</tr></thead>
            <tbody>{rows.map((row) => <tr key={row.key}><th scope="row">{row.label}</th>{ids.map((id, index) => <td key={id} data-product-id={id} data-field={row.key}>{row.render(index)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </>}
  </section>
}
