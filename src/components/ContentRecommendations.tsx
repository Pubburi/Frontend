import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient, type Query } from '@tanstack/react-query'
import { useSession } from '../queries'
import { api, ApiClientError } from '../services/api'
import { useUi } from '../state/ui'
import { contentFallbacks, contentReasons, parseContentResponse, type ContentResponse, type FilterFact } from '../contentRecommendations'
import { money } from '../utils/format'
import { Empty } from './ui'
import type { User } from '../types'

const owners = new WeakMap<object, number>()
let nextOwner = 0
let nextView = 0
const authPending = () => ['login', 'join', 'logout', 'settings-password'].some((key) => useUi.getState().pending[key])
const requestLabel = '저장한 취향으로 검수 DEMO 추천 보기'

export function ContentRecommendations() {
  const session = useSession()
  const client = useQueryClient()
  const location = useLocation()
  const transitioning = useUi(authPending)
  const auth = client.getQueryCache().find({ queryKey: ['session'], exact: true })
  if (auth && !owners.has(auth)) owners.set(auth, ++nextOwner)
  return <section className="content-recommendations section-band" aria-labelledby="content-recommendations-title">
    <h2 id="content-recommendations-title">저장한 취향으로 추천</h2>
    <p>검수한 DEMO 후보 안에서 저장한 취향을 비교합니다. 평점·찜은 이번 결과에 반영하지 않습니다.</p>
    {transitioning || session.isPending || session.fetchStatus !== 'idle' ? <p role="status">현재 로그인 상태를 확인하는 중입니다.</p> : session.isError ?
      <><p role="status">로그인 상태를 확인하지 못했습니다.</p><button className="btn btn-outline-dark" onClick={() => session.refetch()}>추천 로그인 상태 다시 확인</button></> :
      !session.data ? <Link className="btn btn-dark" to="/account?redirect=/">로그인하고 취향 추천 보기</Link> : auth ?
        <OwnedContentRecommendations key={`${owners.get(auth)}:${session.data.id}:${location.key}`} user={session.data} auth={auth} /> : null}
    <div className="phrase-actions"><Link className="text-link" to="/preferences">저장한 취향 설정</Link><Link className="text-link" to="/discover">취향 없이 기본 목록 보기</Link></div>
  </section>
}

function OwnedContentRecommendations({ user, auth }: { user: User; auth: Query }) {
  const [view] = useState(() => ++nextView)
  const [submitted, setSubmitted] = useState<{ revision: number } | null>(null)
  const revision = useRef(0)
  const current = useRef(submitted)
  const running = useRef(false)
  const client = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => {
    // Invalidate synchronously even when a fast auth write starts/ends in one
    // React batch. A failed write must not restore a previous private result.
    const unsubscribe = useUi.subscribe(() => {
      if (authPending()) { current.current = null; running.current = false; setSubmitted(null) }
    })
    return () => { current.current = null; unsubscribe() }
  }, [])
  const ownsActor = () => client.getQueryCache().find({ queryKey: ['session'], exact: true }) === auth &&
    client.getQueryData(['session']) === user && auth.state.status === 'success' && auth.state.fetchStatus === 'idle' && !authPending()
  const query = useQuery({
    queryKey: ['account', user.id, 'content-recommendations', view, submitted?.revision ?? 0],
    enabled: submitted !== null, gcTime: 0, staleTime: Infinity, refetchOnMount: false, refetchOnReconnect: false, networkMode: 'always',
    queryFn: async () => {
      const request = submitted!
      const ownsRequest = () => ownsActor() && current.current === request
      try {
        if (!ownsRequest()) throw new Error('이전 화면의 추천 요청입니다.')
        const actor = await api.me() as User
        if (!ownsRequest()) throw new Error('이전 화면의 추천 요청입니다.')
        if (actor?.id !== user.id) throw new ApiClientError({ code: 'UNAUTHORIZED' }, 401)
        const response = await api.ownContentRecommendations()
        if (!ownsRequest()) throw new Error('이전 화면의 추천 요청입니다.')
        return parseContentResponse(response)
      } finally { if (current.current === request) running.current = false }
    },
  })
  const busy = submitted !== null && (query.isPending || query.fetchStatus !== 'idle')
  const status = query.error instanceof ApiClientError ? query.error.status : null
  const expired = submitted !== null && query.isError && status === 401
  function request() {
    if (running.current || busy || expired || !ownsActor()) return
    const next = { revision: ++revision.current }
    running.current = true; current.current = next; setSubmitted(next)
  }
  function loginAgain() {
    if (!ownsActor() || busy) return
    client.clear(); client.setQueryData(['session'], null)
    navigate(`/account?${new URLSearchParams({ redirect: location.pathname + location.search })}`)
  }
  return <>
    <button className="btn btn-dark" aria-disabled={busy || expired} onClick={request}>{requestLabel}</button>
    {submitted === null ? null : busy ? <p role="status">현재 저장한 취향으로 추천을 확인하는 중입니다.</p> : expired ?
      <Empty title="추천을 보려면 다시 로그인해 주세요" description="로그인 상태가 바뀌어 이전 추천은 표시하지 않았습니다."><button className="btn btn-dark" onClick={loginAgain}>추천 다시 로그인</button></Empty> : query.isError ?
        <Empty title={status === 409 ? '취향이나 검수 후보가 변경되었습니다' : status === 400 ? '추천 조건을 확인해 주세요' : '추천을 가져오지 못했습니다'} description={status === 409 ? '현재 취향으로 추천 보기를 다시 선택해 주세요.' : status === 400 ? '저장한 취향을 확인하거나 추천 보기를 다시 선택해 주세요.' : '잠시 후 추천 보기를 다시 선택해 주세요. 기본 목록은 별도로 볼 수 있습니다.'} /> :
        query.data?.source === 'UNAVAILABLE' ? <Empty title="검수 DEMO 추천을 준비하지 못했습니다" description="현재 추천을 제공할 수 없습니다. 다시 요청하거나 별도의 기본 목록을 이용해 주세요." /> : query.data?.source === 'PROVIDER' ? <ContentResults response={query.data} /> : null}
  </>
}
function FilterText({ fact }: { fact: FilterFact }) {
  if (fact.kind === 'availability_filter') return <>{fact.label} — 판매·재고 확인을 뜻하지 않습니다.</>
  if (fact.kind === 'category_filter') return <>{fact.label}: {fact.actual_value} (허용 주종 {fact.allowed_category_count}개)</>
  return <>{fact.label}: {fact.actual_value} {fact.unit} (최소 {fact.minimum === null ? '미지정' : `${fact.minimum} ${fact.unit}`}, 최대 {fact.maximum === null ? '미지정' : `${fact.maximum} ${fact.unit}`})</>
}
function ContentResults({ response }: { response: Extract<ContentResponse, { source: 'PROVIDER' }> }) {
  const family = response.catalogScope === 'REVIEWED_FAMILY_BROWSE_DEMO'
  return <div className="content-results">
    <p className="eyebrow">{family ? '검수 상품군 DEMO · 열람 전용' : '검수 상품 DEMO · 열람 전용'}</p>
    <p>{family ? '특정 용량·판매 상품이 아닌 열람용 상품군입니다. 용량은 미확인입니다.' : '검수용 표본 정보이며 실제 판매·재고를 보장하지 않습니다.'} 비교 점수는 만족 확률이 아닙니다.</p>
    {response.result.fallback_reason && <p role="status">{contentFallbacks[response.result.fallback_reason]}</p>}
    {!response.result.items.length && <Empty title="조건에 맞는 검수 DEMO 후보가 없습니다" />}
    <ol className="content-cards">{response.result.items.map((item, index) => {
      const product = response.products[index], facts = item.explanation
      return <li className="content-card" key={item.product_id} data-content-product={item.product_id}>
        <h3>{product.name}</h3>
        <p>{product.type} · DEMO 표시 가격 {money(product.price)}원 · 도수 {product.abv}%</p>
        <p>용량 미확인</p>
        <p>비교 점수 {item.score} (0–1)</p>
        <ul>{item.reasons.map((reason, i) => <li key={i}>{contentReasons[reason]}</li>)}</ul>
        {facts.score_evidence.length > 0 && <><h4>저장 선호와 비교한 근거</h4><ul>{facts.score_evidence.map((fact, i) => <li className="content-fact" key={i}>{fact.label}: 후보 {fact.actual_value}{fact.unit ? ` ${fact.unit}` : ''} / 저장 선호 {fact.target_value}{fact.unit ? ` ${fact.unit}` : ''}</li>)}</ul></>}
        {facts.score_evidence_truncated && <p>양수 비교 근거 {facts.total_positive_contributions}개 중 상위 {facts.score_evidence.length}개만 표시합니다.</p>}
        <h4>통과한 입력 조건</h4><ul>{facts.filter_evidence.map((fact, i) => <li className="content-fact" key={i}><FilterText fact={fact} /></li>)}</ul>
      </li>
    })}</ol>
  </div>
}
