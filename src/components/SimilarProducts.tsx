import { useId } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { parseReferenceExplanation, type ContentItem, type FilterFact } from '../contentRecommendations'

type ProductLink = { id: number; name: string; explanation?: ContentItem['explanation'] }

export function parseSimilarProducts(data: unknown, referenceId: number): { links: ProductLink[]; local: boolean } {
  const invalid = () => { throw new Error('유사 상품의 비교 근거를 확인하지 못했습니다.') }
  if (!data || typeof data !== 'object' || !('items' in data) ||
      !Array.isArray(data.items) || data.items.length > 4) return invalid()
  const local = Object.hasOwn(data, 'catalogScope'), explained = Object.hasOwn(data, 'explanations')
  if (Object.keys(data).length !== 1 + Number(local) + Number(explained) || local && (!('catalogScope' in data) || data.catalogScope !== 'REVIEWED_LOCAL_CATALOG')) return invalid()
  const explanations = 'explanations' in data ? data.explanations : undefined
  if (explained && (!Array.isArray(explanations) || explanations.length !== data.items.length)) return invalid()

  const ids = new Set([referenceId])
  const links: ProductLink[] = []
  for (const [index, item] of (data.items as unknown[]).entries()) {
    if (!item || typeof item !== 'object' || !('id' in item) || !('name' in item) ||
        typeof item.id !== 'number' || !Number.isInteger(item.id) || item.id < 1 || item.id > 2147483647 ||
        ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim()) return invalid()
    ids.add(item.id)
    let explanation: ContentItem['explanation'] | undefined
    if (explained) {
      const entry: unknown = (explanations as unknown[])[index]
      if (!entry || typeof entry !== 'object' || Object.keys(entry).length !== 2 || !('productId' in entry) || entry.productId !== item.id || !('explanation' in entry)) return invalid()
      explanation = parseReferenceExplanation(entry.explanation, referenceId)
    }
    links.push({ id: item.id, name: item.name, ...(explanation ? { explanation } : {}) })
  }
  return { links, local }
}

export function SimilarProducts({ productId }: { productId: number }) {
  const heading = useId()
  const query = useQuery({
    queryKey: ['catalog', 'similar-products', productId, 'explanations'],
    queryFn: async ({ signal }) => parseSimilarProducts(await api.similarProducts(productId, signal), productId),
  })
  const busy = query.isPending || query.fetchStatus !== 'idle'
  const result = query.isSuccess && !busy ? query.data : null

  return (
    <section className="section-band similar-products catalog-similar" aria-labelledby={heading}>
      <div>
        <h2 id={heading}>비슷한 상품</h2>
        {result && result.links.length > 0 && <p className="muted">{result.local ? '검수한 로컬 상품의 확인된 특성을 기준으로 보여드려요.' : '검수한 시연 상품의 특성을 기준으로 보여드려요.'}</p>}
        <button className="text-button" aria-disabled={busy} aria-busy={busy} onClick={() => { if (!busy) void query.refetch() }}>비슷한 상품 다시 확인</button>
      </div>
      {busy ? <p role="status">비슷한 상품을 확인하는 중입니다.</p> : query.isError ? <p role="status">비슷한 상품과 비교 근거를 불러오지 못했습니다. 다시 확인해 주세요.</p> : !result?.links.length ? <p role="status">현재 표시할 수 있는 비슷한 상품이 없습니다.</p> :
      <ul className="content-cards">
        {result.links.map(({ id, name, explanation }) => (
          <li className="content-card" key={id} data-similar-product={id}>
            <Link className="text-link similar-product-link" to={`/products/${id}`}>{name}</Link>
            {explanation && <>
              <ul>{explanation.score_evidence.map((fact, i) => <li className="content-fact" key={i}>{typeof fact.actual_value === 'string' ? <>{fact.label}: {fact.actual_value}</> : <>{fact.kind === 'abv_comparison' ? '도수' : '용량'}: 이 상품 {fact.actual_value}{fact.unit === 'vol%' ? '%' : fact.unit} · 현재 상품 {fact.target_value}{fact.unit === 'vol%' ? '%' : fact.unit}</>}</li>)}</ul>
              {explanation.score_evidence_truncated && <p>비교 근거 {explanation.total_positive_contributions}개 중 {explanation.score_evidence.length}개를 표시합니다.</p>}
              <details><summary>통과한 입력 조건</summary><ul>{explanation.filter_evidence.map((fact, i) => <li className="content-fact" key={i}><FilterText fact={fact} /></li>)}</ul></details>
            </>}
          </li>
        ))}
      </ul>
      }
    </section>
  )
}
function FilterText({ fact }: { fact: FilterFact }) {
  if (fact.kind === 'availability_filter') return <>{fact.label} — 판매·재고 확인을 뜻하지 않습니다.</>
  if (fact.kind === 'category_filter') return <>{fact.label}: {fact.actual_value} (허용 주종 {fact.allowed_category_count}개)</>
  return <>{fact.label}: {fact.actual_value} {fact.unit} (최소 {fact.minimum === null ? '미지정' : fact.minimum}, 최대 {fact.maximum === null ? '미지정' : fact.maximum})</>
}
