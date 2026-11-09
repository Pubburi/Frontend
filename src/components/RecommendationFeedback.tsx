import { useLayoutEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { useSession } from '../queries'
import { api, ApiClientError } from '../services/api'
import { useUi } from '../state/ui'
import type { User } from '../types'

type Feedback = 'MATCHED' | 'NOT_INTERESTED' | null

const authPending = ({ pending }: ReturnType<typeof useUi.getState>) =>
  Boolean(pending.login || pending.join || pending.logout || pending['settings-password'])

// A route or cache change cannot cancel a write already accepted by the server.
const writes = new WeakMap<QueryClient, Map<string, Promise<void>>>()

export async function waitForRecommendationFeedbackWrites(client: QueryClient, accountId: string) {
  const pending = writes.get(client)
  if (!pending) return
  const accountWrites = [...pending].filter(([key]) => JSON.parse(key)[0] === accountId)
  await Promise.all(accountWrites.map(([, write]) => write))
}

function readFeedback(value: unknown, productId: number): Feedback {
  if (value && typeof value === 'object' && 'productId' in value && value.productId === productId &&
    'feedback' in value && (value.feedback === null || value.feedback === 'MATCHED' || value.feedback === 'NOT_INTERESTED')) {
    return value.feedback
  }
  throw new Error('추천 피드백 응답을 확인하지 못했습니다.')
}

export function RecommendationFeedback({ productId, onNotInterested }: { productId: number; onNotInterested?: () => void }) {
  const session = useSession()
  const location = useLocation()
  const transitioning = useUi(authPending)
  const [open, setOpen] = useState(false)
  const generation = useRef(0)
  const [revision, setRevision] = useState(0)
  useLayoutEffect(() => useUi.subscribe((state, previous) => {
    if (authPending(state) && !authPending(previous)) setRevision(++generation.current)
  }), [])

  return <details className="recommendation-feedback" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="text-link">추천 피드백</summary>
    {open && <>
      <p>이 상품에 대한 내 선택을 저장합니다. 회원 후기에는 공개되지 않습니다.</p>
      {transitioning || session.isPending || session.fetchStatus !== 'idle' ? <p role="status">로그인 상태를 확인하는 중입니다.</p> :
        session.isError ? <button type="button" className="btn btn-outline-dark" onClick={() => session.refetch()}>피드백 로그인 상태 다시 확인</button> :
          session.data ? <OwnedFeedback key={`${location.key}:${revision}:${session.data.id}`} productId={productId} user={session.data}
            isCurrent={() => generation.current === revision} refreshSession={() => void session.refetch()} onNotInterested={onNotInterested} /> :
            <Link className="text-link" to={`/account?${new URLSearchParams({ redirect: location.pathname + location.search })}`}>로그인하고 피드백 남기기</Link>}
    </>}
  </details>
}

function OwnedFeedback({ productId, user, isCurrent, refreshSession, onNotInterested }: {
  productId: number; user: User; isCurrent: () => boolean; refreshSession: () => void; onNotInterested?: () => void
}) {
  const client = useQueryClient()
  const auth = client.getQueryCache().find({ queryKey: ['session'], exact: true })
  const alive = useRef(false)
  const [writeState, setWriteState] = useState<{ status: 'saving' | 'saved' | 'checking' } | { status: 'error'; error: unknown } | null>(null)
  const retryButton = useRef<HTMLButtonElement>(null)
  const queryKey = ['account', user.id, 'recommendation-feedback', productId]
  const writeKey = JSON.stringify([user.id, productId])
  const ownsActor = () => alive.current && isCurrent() && auth?.state.status === 'success' && auth.state.fetchStatus === 'idle' &&
    client.getQueryCache().find({ queryKey: ['session'], exact: true }) === auth && client.getQueryData(['session']) === user && !authPending(useUi.getState())
  useLayoutEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const query = useQuery({
    queryKey, gcTime: 0, refetchOnReconnect: false, networkMode: 'always',
    queryFn: async ({ signal }) => {
      await writes.get(client)?.get(writeKey)
      if (!ownsActor() || signal.aborted) throw new Error('이전 화면의 피드백 조회입니다.')
      const response = await api.ownRecommendationFeedback(productId, user.id, undefined, signal)
      if (!ownsActor()) throw new Error('이전 계정의 피드백 조회입니다.')
      const feedback = readFeedback(response, productId)
      if (feedback === 'NOT_INTERESTED') onNotInterested?.()
      return feedback
    },
  })

  function change(feedback: Feedback) {
    const pendingWrites = writes.get(client) ?? new Map<string, Promise<void>>()
    if (!ownsActor() || pendingWrites.has(writeKey) || !query.isSuccess || query.fetchStatus !== 'idle' || query.data === feedback) return
    writes.set(client, pendingWrites)
    setWriteState({ status: 'saving' })
    const write = (async () => {
      try {
        const current = readFeedback(await api.ownRecommendationFeedback(productId, user.id, feedback), productId)
        if (current !== feedback) throw new Error('저장한 피드백을 확인하지 못했습니다.')
        if (ownsActor()) {
          client.setQueryData(queryKey, current)
          setWriteState({ status: 'saved' })
          if (current === 'NOT_INTERESTED') onNotInterested?.()
        }
      } catch (error) {
        if (ownsActor()) setWriteState({ status: 'error', error })
      } finally {
        pendingWrites.delete(writeKey)
      }
    })()
    pendingWrites.set(writeKey, write)
  }

  const error = writeState?.status === 'error' ? writeState.error : query.error
  const status = error instanceof ApiClientError ? error.status : null
  const checking = writeState?.status === 'checking'
  function checkAgain() {
    if (checking || client.getQueryState(queryKey)?.fetchStatus !== 'idle') return
    setWriteState({ status: 'checking' })
    void query.refetch().then((result) => {
      if (!ownsActor()) return
      if (result.isSuccess && document.activeElement === retryButton.current) {
        retryButton.current?.closest('details')?.querySelector('summary')?.focus()
      }
      setWriteState(null)
    })
  }
  if (!checking && (query.fetchStatus !== 'idle' || query.isPending)) return <p role="status">내 피드백을 확인하는 중입니다.</p>
  if (checking || error) return <>
    <p role="status">{checking ? '내 피드백을 다시 확인하는 중입니다.' : status === 401 ? '로그인 상태가 바뀌어 피드백을 표시하지 않았습니다.' : status === 404 ? '현재 이 상품의 피드백을 사용할 수 없습니다.' :
      writeState?.status === 'error' ? '저장 결과를 확인하지 못했습니다. 다시 확인한 뒤 선택해 주세요.' : '내 피드백을 불러오지 못했습니다.'}</p>
    {checking || status !== 401 && status !== 404 ? <button ref={retryButton} type="button" className="btn btn-outline-dark" aria-disabled={checking} onClick={checkAgain}>내 피드백 다시 확인</button> :
      status === 401 && <button type="button" className="btn btn-outline-dark" onClick={refreshSession}>피드백 로그인 상태 다시 확인</button>}
  </>

  const saving = writeState?.status === 'saving'
  return <>
    <div className="button-row" role="group" aria-label="내 추천 피드백">
      <button type="button" className="btn btn-outline-dark" aria-pressed={query.data === 'MATCHED'} aria-disabled={saving || query.data === 'MATCHED'} onClick={() => change('MATCHED')}>취향에 맞음</button>
      <button type="button" className="btn btn-outline-dark" aria-pressed={query.data === 'NOT_INTERESTED'} aria-disabled={saving || query.data === 'NOT_INTERESTED'} onClick={() => change('NOT_INTERESTED')}>관심 없음</button>
      <button type="button" className="text-button" aria-disabled={saving || query.data === null} onClick={() => change(null)}>선택 지우기</button>
    </div>
    <p role="status">{saving ? '내 피드백을 저장하는 중입니다.' : writeState?.status === 'saved' ?
      (query.data === null ? '선택을 지웠습니다.' : '내 피드백을 저장했습니다.') : ''}</p>
  </>
}
