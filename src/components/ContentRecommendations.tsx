import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient, type Query } from '@tanstack/react-query'
import { useSession } from '../queries'
import { api, ApiClientError } from '../services/api'
import { useUi } from '../state/ui'
import { contentFallbacks, contentReasons, explorationSelectionLabels, parseContentResponse, parseExplorationResponse, type ActivityEvidence, type ContentResponse, type ExplorationResponse, type FilterFact, type ScoreFact } from '../contentRecommendations'
import { money } from '../utils/format'
import { Empty } from './ui'
import { RecommendationFeedback, waitForRecommendationFeedbackWrites } from './RecommendationFeedback'
import type { User } from '../types'

const owners = new WeakMap<object, number>()
let nextOwner = 0
let nextView = 0
const authPending = () => ['login', 'join', 'logout', 'settings-password'].some((key) => useUi.getState().pending[key])
export function ContentRecommendations({ exploration = false }: { exploration?: boolean }) {
  const session = useSession()
  const client = useQueryClient()
  const location = useLocation()
  const transitioning = useUi(authPending)
  const auth = client.getQueryCache().find({ queryKey: ['session'], exact: true })
  if (auth && !owners.has(auth)) owners.set(auth, ++nextOwner)
  const titleId = exploration ? 'exploration-recommendations-title' : 'content-recommendations-title'
  return <section className="content-recommendations section-band" aria-labelledby={titleId}>
    <h2 id={titleId}>{exploration ? '취향 탐색' : '내 취향 추천'}</h2>
    <p>{exploration ? '저장한 취향 안에서 다른 후보를 둘러보세요.' : '저장한 취향과 검수한 상품 특성을 비교합니다.'}</p>
    {transitioning || session.isPending || session.fetchStatus !== 'idle' ? <p role={exploration ? undefined : 'status'}>현재 로그인 상태를 확인하는 중입니다.</p> : session.isError ?
      <><p role={exploration ? undefined : 'status'}>로그인 상태를 확인하지 못했습니다.</p><button className="btn btn-outline-dark" onClick={() => session.refetch()}>{exploration ? '탐색 로그인 상태 다시 확인' : '추천 로그인 상태 다시 확인'}</button></> :
      !session.data ? <Link className="btn btn-dark" to={exploration ? `/account?${new URLSearchParams({ redirect: location.pathname + location.search })}` : '/account?redirect=/'}>{exploration ? '로그인하고 다른 후보 보기' : '로그인하고 취향 추천 보기'}</Link> : auth ?
        <OwnedContentRecommendations key={`${owners.get(auth)}:${session.data.id}:${location.key}`} user={session.data} auth={auth} exploration={exploration} /> : null}
    {!exploration && <div className="phrase-actions"><Link className="text-link" to="/preferences">저장한 취향 설정</Link><Link className="text-link" to="/discover">취향 없이 기본 목록 보기</Link></div>}
  </section>
}

function OwnedContentRecommendations({ user, auth, exploration }: { user: User; auth: Query; exploration: boolean }) {
  const [view] = useState(() => ++nextView)
  const [submitted, setSubmitted] = useState<{ revision: number } | null>(null)
  const revision = useRef(0)
  const current = useRef(submitted)
  const running = useRef(false)
  const requestButton = useRef<HTMLButtonElement>(null)
  const [hidden, setHidden] = useState<ReadonlySet<number>>(() => new Set())
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
    queryKey: ['account', user.id, exploration ? 'exploration-recommendations' : 'content-recommendations', view, submitted?.revision ?? 0],
    enabled: submitted !== null, gcTime: 0, staleTime: Infinity, refetchOnMount: false, refetchOnReconnect: false, networkMode: 'always',
    queryFn: async () => {
      const request = submitted!
      const ownsRequest = () => ownsActor() && current.current === request
      try {
        if (exploration) await waitForRecommendationFeedbackWrites(client, user.id)
        if (!ownsRequest()) throw new Error('이전 화면의 추천 요청입니다.')
        const actor = await api.me() as User
        if (!ownsRequest()) throw new Error('이전 화면의 추천 요청입니다.')
        if (actor?.id !== user.id) throw new ApiClientError({ code: 'UNAUTHORIZED' }, 401)
        const response = await (exploration ? api.ownExplorationRecommendations(actor.id) : api.ownContentRecommendations(actor.id))
        if (!ownsRequest()) throw new Error('이전 화면의 추천 요청입니다.')
        return exploration ? parseExplorationResponse(response) : parseContentResponse(response)
      } finally { if (current.current === request) running.current = false }
    },
  })
  const busy = submitted !== null && (query.isPending || query.fetchStatus !== 'idle')
  const status = query.error instanceof ApiClientError ? query.error.status : null
  const expired = submitted !== null && query.isError && status === 401
  function request() {
    if (running.current || busy || expired || !ownsActor()) return
    const next = { revision: ++revision.current }
    running.current = true
    current.current = next
    if (exploration) setHidden(new Set())
    setSubmitted(next)
  }
  function loginAgain() {
    if (!ownsActor() || busy) return
    client.clear(); client.setQueryData(['session'], null)
    navigate(`/account?${new URLSearchParams({ redirect: location.pathname + location.search })}`)
  }
  function hideNegative(productId: number) {
    if (!submitted || current.current !== submitted || !ownsActor()) return
    if (document.activeElement?.closest(`[data-content-product="${productId}"]`)) requestButton.current?.focus()
    setHidden((previous) => new Set([...previous, productId]))
  }
  const selected = exploration && query.data?.source === 'PROVIDER' && 'selections' in query.data.result
    ? query.data.result as Extract<ExplorationResponse, { source: 'PROVIDER' }>['result'] : null
  return <>
    <button ref={requestButton} className="btn btn-dark" aria-disabled={busy || expired} onClick={request}>{exploration ? '다른 후보 둘러보기' : '취향 추천 보기'}</button>
    {submitted === null ? null : busy ? <p role="status">{exploration ? '탐색 후보를 확인하는 중입니다.' : '현재 취향 추천을 확인하는 중입니다.'}</p> : expired ?
      <Empty title={exploration ? '탐색하려면 다시 로그인해 주세요' : '추천을 보려면 다시 로그인해 주세요'} description="로그인 상태가 바뀌어 이전 추천은 표시하지 않았습니다."><button className="btn btn-dark" onClick={loginAgain}>{exploration ? '탐색 다시 로그인' : '추천 다시 로그인'}</button></Empty> : query.isError ?
        <Empty title={status === 409 ? '취향이나 검수 후보가 변경되었습니다' : status === 400 ? '추천 조건을 확인해 주세요' : '추천을 가져오지 못했습니다'} description={status === 409 ? '현재 취향과 피드백으로 추천 보기를 다시 선택해 주세요.' : status === 400 ? '저장한 취향을 확인하거나 추천 보기를 다시 선택해 주세요.' : '잠시 후 추천 보기를 다시 선택해 주세요. 기본 목록은 별도로 볼 수 있습니다.'} /> :
        query.data?.source === 'UNAVAILABLE' ? <Empty title={exploration ? '탐색 후보를 준비하지 못했습니다' : '취향 추천을 준비하지 못했습니다'} description="현재 추천을 제공할 수 없습니다. 다시 요청하거나 별도의 기본 목록을 이용해 주세요.">{exploration && <Link className="text-link" to="/discover">기본 목록 보기</Link>}</Empty> : query.data?.source === 'PROVIDER' ?
          selected && selected.exploration_reason !== 'selected' ? <EmptyExploration result={selected} /> :
            <ContentResults response={query.data} exploration={selected ? { selections: selected.selections, hidden, hideNegative } : undefined} /> : null}
  </>
}
type SelectedExploration = Extract<ExplorationResponse, { source: 'PROVIDER' }>['result']
function EmptyExploration({ result }: { result: SelectedExploration }) {
  const description = result.exploration_reason === 'below_relevance_floor' ? '취향과 비교할 근거가 충분한 검수 상품을 찾지 못했습니다.' :
    result.fallback_reason === 'no_eligible_products' ? contentFallbacks.no_eligible_products :
      result.fallback_reason === 'no_supported_preferences' ? '검수 상품과 비교할 수 있는 저장 선호가 부족합니다.' : '저장한 취향과 공유하는 근거가 있는 검수 상품이 없습니다.'
  return <Empty title="둘러볼 검수 후보가 없습니다" description={description} />
}
function FilterText({ fact }: { fact: FilterFact }) {
  if (fact.kind === 'availability_filter') return <>{fact.label} — 판매·재고 확인을 뜻하지 않습니다.</>
  if (fact.kind === 'category_filter') return <>{fact.label}: {fact.actual_value} (허용 주종 {fact.allowed_category_count}개)</>
  return <>{fact.label}: {fact.actual_value} {fact.unit} (최소 {fact.minimum === null ? '미지정' : `${fact.minimum} ${fact.unit}`}, 최대 {fact.maximum === null ? '미지정' : `${fact.maximum} ${fact.unit}`})</>
}
function ScoreText({ fact, category, activity, reference }: { fact: ScoreFact; category: string; activity?: ActivityEvidence; reference: boolean }) {
  if (!reference && fact.kind === 'category_match' && fact.target_value === category && activity) {
    const sources = []
    if (activity.favoriteCategories.includes(fact.target_value)) sources.push('찜한 검수 상품의 주종')
    if (activity.highlyRatedCategories.includes(fact.target_value)) sources.push('최근 4점 이상 후기를 남긴 검수 상품의 주종')
    if (sources.length) return <>{fact.label}: {fact.actual_value} ({sources.join(' · ')})</>
  }
  return <>{fact.label}: 후보 {fact.actual_value}{fact.unit ? ` ${fact.unit}` : ''} / {reference ? '비교 상품' : '저장 선호'} {fact.target_value}{fact.unit ? ` ${fact.unit}` : ''}</>
}
function ContentResults({ response, exploration }: {
  response: Extract<ContentResponse, { source: 'PROVIDER' }>
  exploration?: { selections: SelectedExploration['selections']; hidden: ReadonlySet<number>; hideNegative: (productId: number) => void }
}) {
  const family = response.catalogScope === 'REVIEWED_FAMILY_BROWSE_DEMO'
  const local = response.catalogScope === 'REVIEWED_LOCAL_CATALOG'
  const feedback = response.feedbackEvidence
  const fallback = response.result.fallback_reason
  const noSharedFeedback = feedback?.rankingMode === 'positive_feedback' && fallback === 'no_matching_features'
  return <div className="content-results">
    <p className="eyebrow">{local ? '검수 로컬 상품' : family ? '검수 상품군 DEMO · 열람 전용' : '검수 상품 DEMO · 열람 전용'}</p>
    <details><summary>상품 정보·추천 안내</summary><p>{local ? '공개 출처에서 검수한 특성을 로컬 상품에 연결했습니다. 가격은 시연용이며 현재 상품 표시가 실제 판매·재고를 뜻하지 않습니다. 이미지·맛·향 정보는 미확인입니다.' : family ? '특정 용량·판매 상품이 아닌 열람용 상품군입니다. 용량은 미확인입니다.' : '검수용 표본 정보이며 실제 판매·재고를 보장하지 않습니다.'} 비교 점수는 만족 확률이 아닙니다.</p></details>
    {feedback && feedback.excludedNotInterestedCount > 0 && <p>관심 없음 선택을 반영해 검수 후보군에서 {feedback.excludedNotInterestedCount}개를 제외했습니다.</p>}
    {fallback && !noSharedFeedback && <p role="status">{feedback && fallback === 'no_eligible_products' ?
      '저장한 필수 조건과 피드백을 적용했습니다. 조건을 완화하지 않았습니다.' : contentFallbacks[fallback]}</p>}
    {exploration && exploration.hidden.size > 0 && <p role="status">관심 없음으로 저장한 상품을 숨겼습니다.</p>}
    {!response.result.items.length && <Empty title={noSharedFeedback ? '비교 근거가 있는 검수 후보가 없습니다' : '조건에 맞는 검수 후보가 없습니다'} />}
    <ol className="content-cards">{response.result.items.map((item, index) => {
      if (exploration?.hidden.has(item.product_id)) return null
      const product = response.products[index], facts = item.explanation
      const comparison = facts.comparison
      const reference = comparison.kind === 'reference_product'
        ? feedback?.positiveReferences.find(({ productId }) => productId === comparison.product_id) : undefined
      return <li className="content-card" key={item.product_id} data-content-product={item.product_id}>
        <h3>{local ? <Link className="text-link" to={`/products/${product.id}`}>{product.name}</Link> : product.name}</h3>
        <p>{product.type} · {local ? '시연 가격' : 'DEMO 표시 가격'} {money(product.price)}원 · 도수 {product.abv}%</p>
        {family && <p>용량 미확인</p>}
        <p>비교 점수 {item.score > 0 && item.score < 0.001 ? '<0.001' : item.score.toLocaleString('ko-KR', { maximumFractionDigits: 3 })} (0–1)</p>
        {exploration && <p className="content-fact">{explorationSelectionLabels[exploration.selections[index].basis]}</p>}
        {reference && <p className="content-fact">취향에 맞음으로 표시한 ‘{reference.name}’과 비교했습니다.</p>}
        <ul>{item.reasons.map((reason, i) => <li key={i}>{reference && reason === 'content_similarity' ? '표시한 상품과 공유하는 특성이 있습니다.' : contentReasons[reason]}</li>)}</ul>
        {facts.score_evidence.length > 0 && <><h4>추천에 사용한 비교 근거</h4><ul>{facts.score_evidence.map((fact, i) => <li className="content-fact" key={i}><ScoreText fact={fact} category={product.type} activity={response.activityEvidence} reference={Boolean(reference)} /></li>)}</ul></>}
        {facts.score_evidence_truncated && <p>양수 비교 근거 {facts.total_positive_contributions}개 중 상위 {facts.score_evidence.length}개만 표시합니다.</p>}
        <h4>통과한 입력 조건</h4><ul>{facts.filter_evidence.map((fact, i) => <li className="content-fact" key={i}><FilterText fact={fact} /></li>)}</ul>
        {exploration && local && <RecommendationFeedback productId={product.id} onNotInterested={() => exploration.hideNegative(product.id)} />}
      </li>
    })}</ol>
  </div>
}
