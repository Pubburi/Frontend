import { useEffect, useId, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { api, ApiClientError } from '../services/api'
import { accountCart, type useAccountCart } from '../state/accountCart'
import { checkedCartContext, contextFallbacks, contextUnavailable, referenceStates, type CartContextResponse } from '../cartRecommendations'
import type { AccountCart } from '../types'
import type { FilterFact } from '../contentRecommendations'
import { money } from '../utils/format'
import { Empty } from './ui'

type Account = ReturnType<typeof useAccountCart>
type Request = { scope: NonNullable<Account['scope']>; cart: AccountCart; location: string; revision: number }
let nextView = 0

export function CartRecommendations({ account }: { account: Account }) {
  const client = useQueryClient(), location = useLocation(), heading = useId()
  const store = accountCart(client)
  const [view] = useState(() => ++nextView), [submitted, setSubmitted] = useState<Request | null>(null)
  const current = useRef<Request | null>(null), running = useRef<Request | null>(null), alive = useRef(true), route = useRef(location.key), revision = useRef(0)
  route.current = location.key
  useEffect(() => {
    alive.current = true
    const off = store.subscribe((value) => {
      const request = current.current
      if (request && (value.scope !== request.scope || value.data !== request.cart || !value.ready || value.pending || value.loading || value.blocked || value.error || value.operation)) {
        current.current = null; running.current = null
      }
    })
    return () => { off(); alive.current = false; current.current = null }
  }, [store])
  function readable() {
    const value = store.getState()
    return !!value.scope && value.ready && !!value.data && !value.pending && !value.loading && !value.blocked && !value.error && !value.operation
  }
  function owns(request: Request) {
    const value = store.getState()
    return alive.current && current.current === request && route.current === request.location && readable() && value.scope === request.scope &&
      value.data === request.cart && value.data.version === request.cart.version
  }
  const owned = submitted !== null && owns(submitted)
  const query = useQuery({
    queryKey: ['account', account.scope?.id, 'cart-recommendations', view, submitted?.revision ?? 0],
    enabled: owned, gcTime: 0, staleTime: Infinity, refetchOnMount: false, refetchOnReconnect: false, networkMode: 'always',
    queryFn: async ({ signal }) => {
      const request = submitted!
      try {
        if (!owns(request)) throw new Error('이전 장바구니의 비교 요청입니다.')
        const result = await api.cartRecommendations(request.scope.id, request.cart.version, signal)
        if (!owns(request)) throw new Error('이전 장바구니의 비교 요청입니다.')
        return checkedCartContext(result, request.cart)
      } catch (cause) {
        if (owns(request) && cause instanceof ApiClientError && cause.status === 401) store.getState().rejectAuth(request.scope)
        throw cause
      } finally { if (running.current === request) running.current = null }
    },
  })
  const busy = owned && (query.isPending || query.fetchStatus !== 'idle')
  function compare() {
    const value = store.getState()
    if (!readable() || !value.scope || !value.data?.items.length || running.current && owns(running.current)) return
    const request = { scope: value.scope, cart: value.data, location: route.current, revision: ++revision.current }
    current.current = request; running.current = request; setSubmitted(request)
  }
  const status = query.error instanceof ApiClientError ? query.error.status : 0
  const response = owned && query.isSuccess && !busy ? query.data : null
  return <section className="section-band cart-recommendations" aria-labelledby={heading}>
    <p className="eyebrow">검수 상품 DEMO</p>
    <h2 id={heading}>담은 상품과 비슷한 술</h2>
    <p>저장된 상품의 특성이 비슷한 후보를 살펴보세요.</p>
    <button className="btn btn-outline-dark" disabled={!readable() || !account.data?.items.length} aria-disabled={busy} aria-busy={busy} onClick={compare}>비슷한 상품 보기</button>
    <details><summary>추천 기준·DEMO 안내</summary>
      <p>검수용 표본을 비교하며 실제 판매·재고를 보장하지 않습니다. 수량과 미저장 입력은 점수에 쓰지 않습니다. 후보마다 표시한 기준 상품 하나와의 특성 비교이며 전체 조합의 궁합·공동구매 통계가 아닙니다. 비교 점수는 만족 확률이 아닙니다.</p>
      {response && <><h3>확인한 기준 {response.references.length}개</h3><ul>{response.references.map((ref) => <li key={ref.productId}>
        {ref.name ?? `삭제된 상품 #${ref.productId}`} · 저장 {ref.quantity}개 · {referenceStates[ref.state]}
      </li>)}</ul></>}
    </details>
    {!account.data?.items.length && <p className="muted">계정 장바구니에 상품을 담은 뒤 비교할 수 있습니다.</p>}
    {submitted && !owned && <p role="status">장바구니가 바뀌어 이전 비교를 표시하지 않았습니다. 현재 저장된 상품으로 다시 비교해 주세요.</p>}
    {owned && (busy ? <p role="status">상품을 찾는 중입니다. 장바구니와 주문은 계속 사용할 수 있습니다.</p> : query.isError ?
      <Empty title={status === 409 ? '장바구니나 비교 조건이 변경되었습니다' : '상품 비교를 가져오지 못했습니다'} description={status === 409 ? '현재 카트를 새로고침한 뒤 비교를 다시 선택해 주세요.' : '카트와 주문 입력은 유지됩니다. 상품 비교를 다시 선택해 주세요.'} /> :
        query.data ? <ContextResults response={query.data} /> : null)}
    <p><Link className="text-link" to="/discover">기본 추천 보기</Link></p>
  </section>
}
function FilterText({ fact }: { fact: FilterFact }) {
  if (fact.kind === 'availability_filter') return <>{fact.label}</>
  if (fact.kind === 'category_filter') return <>{fact.label}: {fact.actual_value} (허용 주종 {fact.allowed_category_count}개)</>
  return <>{fact.label}: {fact.actual_value} {fact.unit} (최소 {fact.minimum === null ? '미지정' : fact.minimum}, 최대 {fact.maximum === null ? '미지정' : fact.maximum})</>
}
function ContextResults({ response }: { response: CartContextResponse }) {
  const result = response.result
  return <div className="cart-context-results">
    {response.source === 'UNAVAILABLE' ? <Empty title="이 장바구니를 비교하지 못했습니다" description={contextUnavailable[response.unavailableReason!]} /> : result && <>
      {result.fallback_reason && <p role="status">{contextFallbacks[result.fallback_reason]} 조건이나 기준을 완화해 채우지 않았습니다.</p>}
      {!result.items.length && <Empty title="비교 근거가 있는 검수 후보가 없습니다" />}
      <ol className="content-cards">{result.items.map((item, index) => {
        const product = response.products[index], facts = item.explanation, match = result.matches[index]
        const reference = response.references.find((ref) => ref.productId === match.reference_product_id)!
        return <li className="content-card" key={item.product_id} data-cart-context-product={item.product_id}>
          <h3><Link className="text-link" to={`/products/${product.id}`}>{product.name}</Link></h3>
          <p>{product.type} · 현재 표시 가격 {money(product.price)}원 · 도수 {product.abv}%</p>
          <p>비교 점수 {item.score < 0.001 ? '<0.001' : item.score.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}</p>
          <p>이 후보는 기준 상품 ‘{reference.name}’의 특성과 비교했습니다.</p>
          <h4>비교에 사용한 실제 근거</h4><ul>{facts.score_evidence.map((fact, i) => <li key={i}>
            {fact.label}: 후보 {fact.actual_value}{fact.unit ? ` ${fact.unit}` : ''} / 기준 상품 {fact.target_value}{fact.unit ? ` ${fact.unit}` : ''}
          </li>)}</ul>
          {facts.score_evidence_truncated && <p>양수 비교 근거 {facts.total_positive_contributions}개 중 상위 {facts.score_evidence.length}개를 표시합니다.</p>}
          <h4>통과한 입력 조건</h4><ul>{facts.filter_evidence.map((fact, i) => <li key={i}><FilterText fact={fact} /></li>)}</ul>
        </li>
      })}</ol>
    </>}
  </div>
}
