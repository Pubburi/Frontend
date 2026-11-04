import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient, type Query } from '@tanstack/react-query'
import { useSession } from '../queries'
import { api, ApiClientError } from '../services/api'
import { useUi } from '../state/ui'
import { searchPhrasePrivacy } from '../state/authReadPrivacy'
import { fallbackMessages, parseSearchPhraseResponse, searchDiagnosticText, searchOptIns, searchPhraseUrl, type SearchConditions, type SearchOptIn } from '../searchPhrases'
import { Empty } from './ui'
import type { User } from '../types'

const owners = new WeakMap<object, number>()
let nextOwner = 0
let nextView = 0
const authPending = () => ['login', 'join', 'logout', 'settings-password'].some((key) => useUi.getState().pending[key])
function inCurrentTab(event: MouseEvent<HTMLAnchorElement>) {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey &&
    (!event.currentTarget.target || event.currentTarget.target === '_self')
}
export function SearchPhrases({ onApply }: { onApply: (url: string) => void }) {
  const session = useSession()
  const client = useQueryClient()
  const location = useLocation()
  const transitioning = useUi(authPending)
  const auth = client.getQueryCache().find({ queryKey: ['session'], exact: true })
  if (auth && !owners.has(auth)) owners.set(auth, ++nextOwner)
  return <section className="search-phrases" aria-labelledby="search-phrases-title">
    <h2 id="search-phrases-title">취향 조건으로 검색</h2>
    <p>저장한 필수 범위를 사용합니다. 선호 주종·맛·향·목표 도수는 이번 검색에 사용할 항목만 따로 선택해 주세요. 취향 설정은 바뀌지 않습니다.</p>
    {transitioning || session.isPending || session.fetchStatus !== 'idle' ? <p role="status">현재 로그인 상태를 확인하는 중입니다.</p> : session.isError ?
      <><p role="status">로그인 상태를 확인하지 못했습니다.</p><button className="btn btn-outline-dark" onClick={() => session.refetch()}>로그인 상태 다시 확인</button></> :
      !session.data ? <><p>비회원은 전체 상품에서 직접 조건을 선택할 수 있습니다.</p><Link className="btn btn-outline-dark" to="/products" onClick={(event) => { if (inCurrentTab(event)) onApply('/products') }}>전체 상품 보기</Link></> : auth ?
        <OwnedSearchPhrases key={`${owners.get(auth)}:${session.data.id}:${location.key}`} user={session.data} auth={auth} onApply={onApply} /> : null}
  </section>
}
function ConditionSummary({ value }: { value: SearchConditions }) {
  const rows: [string, string][] = []
  if (value.type !== null) rows.push(['주종', value.type])
  if (value.minPriceKrw !== null) rows.push(['최소 가격', `${value.minPriceKrw}원`])
  if (value.maxPriceKrw !== null) rows.push(['최대 가격', `${value.maxPriceKrw}원`])
  if (value.minAbvPercent !== null) rows.push(['최소 도수', `${value.minAbvPercent}%`])
  if (value.maxAbvPercent !== null) rows.push(['최대 도수', `${value.maxAbvPercent}%`])
  value.tasteTag.forEach((tag) => rows.push(['맛 태그', tag]))
  value.aromaTag.forEach((tag) => rows.push(['향 태그', tag]))
  return rows.length ? <dl className="phrase-conditions">{rows.map(([label, text], index) => <div key={index}><dt>{label}</dt><dd>{text}</dd></div>)}</dl> : <p>추가 검색 조건 없음</p>
}
function OwnedSearchPhrases({ user, auth, onApply }: { user: User; auth: Query; onApply: (url: string) => void }) {
  const [view] = useState(() => ++nextView)
  const [selected, setSelected] = useState<SearchOptIn[]>([])
  const [revision, setRevision] = useState(0)
  const [submitted, setSubmitted] = useState<{ revision: number; fields: SearchOptIn[] } | null>(null)
  const currentSubmission = useRef(submitted)
  useEffect(() => () => { currentSubmission.current = null }, [])
  const client = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const privacy = searchPhrasePrivacy(client)
  const failures = useSyncExternalStore(privacy.subscribe, privacy.snapshot)
  const ownsActor = () => client.getQueryCache().find({ queryKey: ['session'], exact: true }) === auth &&
    client.getQueryData<User | null>(['session'])?.id === user.id && !authPending()
  const key = ['account', user.id, 'search-phrases', view, submitted?.revision ?? 0, submitted?.fields.join(',') ?? ''] as const
  const query = useQuery({
    queryKey: key, enabled: submitted !== null, refetchOnReconnect: false, networkMode: 'always',
    queryFn: async () => {
      const request = submitted!
      const actor = await api.me() as User
      if (!ownsActor() || currentSubmission.current !== request) throw new Error('이전 선택의 요청입니다.')
      if (actor?.id !== user.id) throw new ApiClientError({ code: 'UNAUTHORIZED' }, 401)
      const response = await api.ownSearchPhrases(request.fields)
      if (!ownsActor() || currentSubmission.current !== request) throw new Error('이전 선택의 요청입니다.')
      return parseSearchPhraseResponse(response)
    },
  })
  const currentQuery = client.getQueryCache().find({ queryKey: key, exact: true })
  const expired = failures.some((failure) => failure.auth === auth && failure.query === currentQuery)
  const busy = submitted !== null && (query.isPending || query.fetchStatus !== 'idle')
  const errorStatus = query.error instanceof ApiClientError ? query.error.status : null
  function request() {
    if (busy || !ownsActor() || expired) return
    const next = revision + 1; const request = { revision: next, fields: [...selected] }
    currentSubmission.current = request; setRevision(next); setSubmitted(request)
  }
  function loginAgain() {
    if (!ownsActor() || query.fetchStatus !== 'idle') return
    client.clear(); client.setQueryData(['session'], null)
    navigate(`/account?${new URLSearchParams({ redirect: location.pathname + location.search })}`)
  }
  return <>
    <fieldset className="phrase-optins"><legend>이번 검색에 사용할 선호</legend>
      {searchOptIns.map(({ key: field, label }) => <label key={field}><input type="checkbox" checked={selected.includes(field)} onChange={(event) => {
        setSelected(searchOptIns.map((item) => item.key).filter((key) => key === field ? event.target.checked : selected.includes(key)))
        currentSubmission.current = null
        setSubmitted(null)
      }} />{label}</label>)}
    </fieldset>
    <div className="phrase-actions"><button className="btn btn-dark" aria-disabled={busy || expired} onClick={request}>검색 문구 가져오기</button><Link className="text-link" to="/preferences">저장한 취향 수정</Link></div>
    <p className="muted">문구를 가져와도 검색은 바뀌지 않습니다. 아래 문구를 적용하면 현재 검색어·조건·정렬·페이지와 아직 제출하지 않은 입력을 모두 바꾸고, 이름순 첫 페이지로 검색합니다.</p>
    {expired ? <Empty title="다시 로그인해 주세요" description="로그인 상태가 바뀌어 검색 문구를 표시하지 않았습니다."><button className="btn btn-dark" onClick={loginAgain} disabled={query.fetchStatus !== 'idle'}>다시 로그인</button></Empty> : submitted === null ? null : query.fetchStatus === 'paused' ?
      <p role="status">연결 후 검색 문구 가져오기를 다시 선택해 주세요.</p> : busy ? <p role="status">현재 저장한 취향으로 검색 문구를 가져오는 중입니다.</p> : query.isError ?
        <Empty title={errorStatus === 409 ? '취향이 변경되었습니다' : errorStatus === 400 ? '저장한 검색 조건을 확인해 주세요' : '검색 문구를 가져오지 못했습니다'} description={errorStatus === 409 ? '현재 취향으로 검색 문구를 다시 가져와 주세요. 기존 검색은 유지했습니다.' : errorStatus === 400 ? '저장한 취향을 수정하거나 사용할 항목을 확인하고 다시 가져와 주세요. 기존 검색은 유지했습니다.' : '잠시 후 검색 문구 가져오기를 다시 선택해 주세요. 기존 검색은 유지했습니다.'} /> :
        query.data?.source === 'UNAVAILABLE' ? <Empty title="검색 문구를 준비하지 못했습니다" description="잠시 후 검색 문구 가져오기를 다시 선택해 주세요. 기존 검색은 유지했습니다." /> : query.data?.source === 'PROVIDER' ? <div className="phrase-response">
          {query.data.result.fallback_reason && <p role="status">{fallbackMessages[query.data.result.fallback_reason]}</p>}
          {!query.data.result.items.length && <Empty title="적용할 검색 문구가 없습니다" />}
          <ul className="phrase-items">{query.data.result.items.map((item, index) => <li key={index}><ConditionSummary value={item.conditions} /><Link className="btn btn-outline-dark" data-search-phrase to={searchPhraseUrl(item)} onClick={(event) => {
            if (!ownsActor() || currentSubmission.current !== submitted) { event.preventDefault(); return }
            if (inCurrentTab(event)) onApply(searchPhraseUrl(item))
          }}>{item.label} 적용</Link></li>)}</ul>
          {query.data.result.diagnostics.length > 0 && <ul className="phrase-diagnostics">{query.data.result.diagnostics.map((diagnostic) => <li key={`${diagnostic.field}:${diagnostic.code}`}>{searchDiagnosticText(diagnostic)}</li>)}</ul>}
          {query.data.result.omitted_count > 0 && <p>검색 문구 {query.data.result.omitted_count}개는 이번 목록에서 생략했습니다.</p>}
          <p className="muted">문구는 현재 상품 수를 미리 계산하지 않습니다. 적용 후 실제 검색 결과를 확인해 주세요.</p>
        </div> : null}
  </>
}
