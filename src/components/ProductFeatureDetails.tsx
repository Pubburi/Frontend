import { useId, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { publicFeatureQueryKey, publicSourceLink } from '../publicProductFeatures'

function FeatureRow({ name, field, children }: { name: string; field: string; children: ReactNode }) {
  return <div className="product-feature-row" data-feature={field}><dt>{name}</dt><dd>{children}</dd></div>
}
function Tags({ values, label }: { values: string[] | null; label: string }) {
  if (values === null) return <span className="muted">미확인</span>
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
      ) : features ? (
        <dl className="product-feature-list">
          <FeatureRow name="용량" field="volume">
            {features.volumeMl === null ? '미확인' : `${features.volumeMl.toLocaleString('ko-KR')} mL`}
          </FeatureRow>
          <FeatureRow name="설명" field="description">{features.description ?? '미확인'}</FeatureRow>
          <FeatureRow name="맛" field="taste"><Tags values={features.tasteTags} label="맛 태그" /></FeatureRow>
          <FeatureRow name="향" field="aroma"><Tags values={features.aromaTags} label="향 태그" /></FeatureRow>
          <FeatureRow name="출처" field="source">
            <span>{features.sourceName ?? '미확인'}</span>
            {source ? <a href={source} target="_blank" rel="noopener noreferrer">출처 보기 (새 창)</a> :
              features.sourceUrl !== null ? <span className="muted">출처 링크 미제공</span> : null}
          </FeatureRow>
          <FeatureRow name="출처 메모" field="note">{features.sourceNote ?? '미확인'}</FeatureRow>
        </dl>
      ) : null}
    </section>
  )
}
