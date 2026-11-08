import { useId, useRef, useState } from 'react'
import { useQuery, type QueryKey } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, ApiClientError } from '../services/api'
import { checkedOrderContext, orderContextUnavailable } from '../orderRecommendations'
import { referenceStates } from '../cartRecommendations'
import type { Order } from '../types'
import { ContextResults } from './CartRecommendations'
import { Empty } from './ui'

type Request = { order: Order; revision: number }
export function OrderRecommendations({ owner, order, queryKey, ownsOrder }: { owner: string; order: Order | null; queryKey: QueryKey; ownsOrder: (order: Order) => boolean }) {
  const heading = useId(), [submitted, setSubmitted] = useState<Request | null>(null)
  const current = useRef<Request | null>(null), running = useRef<Request | null>(null), revision = useRef(0)
  if (current.current && current.current.order !== order) { current.current = null; running.current = null }
  function owns(request: Request) { return current.current === request && request.order === order && ownsOrder(request.order) }
  const owned = submitted !== null && owns(submitted)
  const query = useQuery({
    queryKey: [...queryKey, 'recommendations', submitted?.revision ?? 0],
    enabled: owned, staleTime: Infinity, refetchOnMount: false, refetchOnReconnect: false, networkMode: 'always',
    queryFn: async ({ signal }) => {
      const request = submitted!
      try {
        if (!owns(request)) throw new Error('이전 주문의 비교 요청입니다.')
        const value = await api.orderRecommendations(owner, request.order.oId, signal)
        if (!owns(request)) throw new Error('이전 주문의 비교 요청입니다.')
        return checkedOrderContext(value, request.order)
      } catch (cause) {
        // Only the current request may report an auth failure to the shared order boundary.
        if (!owns(request)) throw new Error('이전 주문의 비교 요청입니다.')
        throw cause
      } finally { if (running.current === request) running.current = null }
    },
  })
  const busy = owned && (query.isPending || query.fetchStatus !== 'idle')
  const response = owned && query.isSuccess && !busy ? query.data : null
  function compare() {
    if (!order || !ownsOrder(order) || !order.details.length || running.current && owns(running.current)) return
    const request = { order, revision: ++revision.current }; current.current = request; running.current = request; setSubmitted(request)
  }
  if (!order) return null
  const status = query.error instanceof ApiClientError ? query.error.status : 0
  return <section className="section-band order-recommendations" aria-labelledby={heading}>
    <p className="eyebrow">{response?.catalogScope === 'REVIEWED_LOCAL_CATALOG' ? '검수 로컬 상품' : response ? '검수 상품 DEMO' : '검수 상품 비교'}</p>
    <h2 id={heading}>이 주문과 비슷한 술</h2>
    <p>주문한 상품의 현재 특성과 비슷한 후보를 살펴보세요.</p>
    <button className="btn btn-outline-dark" disabled={!order.details.length} aria-disabled={busy} aria-busy={busy} onClick={compare}>비슷한 상품 보기</button>
    <details><summary>{response?.catalogScope === 'REVIEWED_DEMO' ? '추천 기준·DEMO 안내' : '추천 기준 안내'}</summary>
      <p>주문 당시 이름·금액은 위 이력에 보관되며, 비교에는 현재 검수한 상품 특성을 사용합니다. 수량·주문 금액으로 선호를 추정하지 않고 각 후보에 표시한 기준 상품 하나와 비교합니다. 전체 주문의 궁합·공동구매 통계나 만족 확률이 아닙니다. 가격은 시연용이며 현재 상품 표시가 실제 판매·재고를 뜻하지 않습니다.</p>
      {response && <><h3>확인한 주문 항목 {response.referenceCount}개</h3><ul>{response.references.map((ref) => <li key={ref.detailId}>{ref.name ?? `삭제된 상품 (주문 항목 ${ref.detailId})`} · 주문 {ref.quantity}개 · {referenceStates[ref.state]}</li>)}</ul></>}
    </details>
    {!order.details.length && <p className="muted">비교할 주문 상품이 없습니다.</p>}
    {submitted && !owned && <p role="status">주문을 다시 확인해 이전 비교를 표시하지 않았습니다. 비슷한 상품을 다시 선택해 주세요.</p>}
    {owned && (busy ? <p role="status">상품을 찾는 중입니다. 주문 이력은 계속 확인할 수 있습니다.</p> : query.isError ?
      <Empty title={status === 409 ? '주문이나 비교 조건이 변경되었습니다' : '상품 비교를 가져오지 못했습니다'} description={status === 409 || status === 404 ? '주문 상태를 새로고침한 뒤 비교를 다시 선택해 주세요.' : '주문 이력은 그대로입니다. 상품 비교를 다시 선택해 주세요.'} /> : response ?
        <ContextResults context="order" response={response} unavailableDescription={response.unavailableReason ? orderContextUnavailable[response.unavailableReason] : undefined} /> : null)}
    <p><Link className="text-link" to="/discover">기본 추천 보기</Link></p>
  </section>
}
