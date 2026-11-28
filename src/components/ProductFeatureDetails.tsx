import { useId, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { publicFeatureQueryKey, publicSourceLink } from '../publicProductFeatures'

function FeatureRow({ name, field, children }: { name: string; field: string; children: ReactNode }) {
  return <div className="product-feature-row" data-feature={field}><dt>{name}</dt><dd>{children}</dd></div>
}
function Tags({ values, label }: { values: string[]; label: string }) {
  if (!values.length) return <span className="muted">등록된 태그 없음</span>
  return <ul className="product-feature-tags" aria-label={label}>
    {values.map((tag, index) => <li key={`${index}:${tag}`}>{tag}</li>)}
  </ul>
}

export function ProductFeatureDetails({ productId }: { productId: number }) {
  const heading = useId()
  const query = useQuery({
    queryKey: publicFeatureQueryKey(productId),
    queryFn: async () => {
      const data = await api.productFeatures(productId)
      if (data.productId !== productId) throw new Error('현재 상품의 특성을 확인하지 못했습니다.')
      return data
    },
  })
  const features = query.data
  const source = features ? publicSourceLink(features.sourceUrl) : null
  const rows = features ? [
    {
      name: '용량', field: 'volume',
      value: features.volumeMl === null ? null : `${features.volumeMl.toLocaleString('ko-KR')} mL`,
    },
    { name: '설명', field: 'description', value: features.description },
    {
      name: '맛', field: 'taste',
      value: features.tasteTags === null ? null : <Tags values={features.tasteTags} label="맛 태그" />,
    },
    {
      name: '향', field: 'aroma',
      value: features.aromaTags === null ? null : <Tags values={features.aromaTags} label="향 태그" />,
    },
    {
      name: '출처', field: 'source',
      value: features.sourceName === null && features.sourceUrl === null ? null : <>
        {features.sourceName !== null && <span>{features.sourceName}</span>}
        {source ? <a href={source} target="_blank" rel="noopener noreferrer">출처 보기 (새 창)</a> :
          features.sourceUrl !== null ? <span className="muted">출처 링크 미제공</span> : null}
      </>,
    },
    { name: '출처 메모', field: 'note', value: features.sourceNote },
  ] : []
  const known = rows.filter(({ value }) => value !== null)
  const missing = rows.filter(({ value }) => value === null).map(({ name }) => name)
  return (
    <section className="product-features" aria-labelledby={heading}>
      <h2 id={heading}>상품 특성</h2>
      {query.isPending || query.isFetching ? (
        <p className="muted" role="status">상품 특성을 불러오는 중입니다.</p>
      ) : query.isError ? (
        <div className="product-feature-state" role="status">
          <p>상품 특성을 불러오지 못했습니다. 상품 정보와 장바구니는 계속 이용할 수 있습니다.</p>
          <button className="btn btn-outline-dark btn-sm" onClick={() => query.refetch()}>특성 다시 불러오기</button>
        </div>
      ) : known.length ? (
        <>
          <dl className="product-feature-list">
            {known.map(({ name, field, value }) => <FeatureRow key={field} name={name} field={field}>{value}</FeatureRow>)}
          </dl>
          {!!missing.length && <p className="muted product-feature-unconfirmed">확인되지 않은 항목은 {missing.join(' · ')}입니다.</p>}
        </>
      ) : features ? <p className="muted">아직 확인된 상품 특성이 없습니다.</p> : null}
    </section>
  )
}
