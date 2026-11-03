import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../queries'
import { api, ApiClientError } from '../services/api'
import { recentProducts, useRecentProducts } from '../state/recentProducts'
import { ProductCard } from '../components/ui'
import type { Product } from '../types'
import { useUi } from '../state/ui'

export function RecentPage() {
  const history = useRecentProducts()
  const client = useQueryClient()
  const session = useSession()
  const location = useLocation()
  const heading = useRef<HTMLHeadingElement>(null)
  const currentLocation = useRef(location.key); currentLocation.current = location.key
  const revision = useRef(0)
  const [checked, setChecked] = useState<{ key: string; generation: number } | null>(null)
  const authPending = useUi((state) => Boolean(state.pending.login || state.pending.join || state.pending.logout))
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState(false)
  async function confirmSession() {
    const call = ++revision.current
    const key = location.key
    const auth = client.getQueryCache().find({ queryKey: ['session'], exact: true })
    setChecking(true); setChecked(null); setCheckError(false)
    const result = await session.refetch()
    if (call !== revision.current || key !== currentLocation.current || auth !== client.getQueryCache().find({ queryKey: ['session'], exact: true })) return
    const current = recentProducts(client).getState()
    setChecking(false)
    if (result.isSuccess && result.data === auth?.state.data && current.ready) setChecked({ key, generation: current.generation })
    else setCheckError(true)
  }
  useEffect(() => {
    if (!authPending && history.generation > 0 && (checked?.key !== location.key || checked.generation !== history.generation || history.verificationRequired)) void confirmSession()
    return () => { revision.current++ }
  }, [location.key, history.generation, authPending])
  useEffect(() => {
    history.prune()
    const timer = window.setInterval(() => recentProducts(client).getState().prune(), 60_000)
    return () => window.clearInterval(timer)
  }, [client])
  const allowed = history.ready && checked?.key === location.key && checked.generation === history.generation && !checking && !authPending && !session.isError && !checkError
  const entries = allowed ? history.entries : []
  const queries = useQueries({ queries: entries.map(({ id }) => ({
    queryKey: ['recent', history.generation, id],
    queryFn: async (): Promise<Product> => {
      const product = await api.product(id)
      if (product?.id !== id) throw new Error('현재 상품의 정보를 확인하지 못했습니다.')
      return product
    },
  })) })
  function focus(event: MouseEvent<HTMLButtonElement>) {
    if (event.detail === 0 && document.activeElement === event.currentTarget) heading.current?.focus({ preventScroll: true })
  }
  return <section className="view recent-view">
    <div className="shop-intro compact-intro"><div><p className="section-kicker">Recently Viewed</p><h1 ref={heading} tabIndex={-1}>최근 본 상품</h1><p>다시 살펴보고 싶은 상품을 찾아보세요. 상품 정보는 현재 값으로 다시 확인합니다.</p></div></div>
    <div className="recent-policy">
      <p>비회원 기록은 이 브라우저에 최대 20개·30일간 보관합니다. 로그인 중 기록은 현재 인증 중의 이 창에서만 보관하며, 새로고침·로그아웃·계정 전환 시 초기화합니다.</p>
      <p>상품 번호와 열람 시각만 보관합니다. 계정·다른 기기와 동기화하지 않으며, 로그인 전 비회원 기록을 계정 기록에 합치지 않습니다.</p>
    </div>
    <div className="button-row"><Link className="btn btn-outline-dark" to="/products">전체 주류 보기</Link>{allowed && entries.length > 0 && <button className="btn btn-outline-dark" onClick={(event) => { focus(event); if (history.owner) history.clear(history.owner) }}>최근 기록 전체 삭제</button>}</div>
    {session.isError || checkError ? <div className="state-panel" role="status"><h2>로그인 상태를 확인하지 못했습니다</h2><p>이전 기록을 표시하지 않았습니다. 다시 확인해 주세요.</p><button className="btn btn-dark" onClick={() => void confirmSession()}>로그인 상태 다시 확인</button></div> : !allowed ? <p role="status">로그인 상태를 확인하는 동안 최근 기록을 표시하지 않습니다.</p> : <>
      {history.kind === 'guest' && history.storageWarning && <p className="notice" role="status">이 브라우저에 기록 변경을 저장하지 못했습니다. 이 창에서는 계속 이용할 수 있지만, 새로고침하면 이전 비회원 기록이 다시 나타나거나 최근 기록이 사라질 수 있습니다. 로그인 중 기록은 브라우저에 저장하지 않습니다.</p>}
      {history.invalidStorage && <p role="status">저장된 기록 형식을 확인하지 못해 복원하지 않았습니다. 새로 본 상품부터 기록합니다.</p>}
      {!entries.length ? <div className="state-panel" role="status"><h2>최근 본 상품이 없습니다</h2><p>상품 상세를 열면 이곳에서 다시 찾아볼 수 있습니다.</p></div> : <div className="product-grid recent-grid">{entries.map((entry, index) => {
        const query = queries[index]
        return <section key={entry.id} className="recent-item" aria-label={`최근 상품 ${entry.id}`}>
          <p className="muted recent-time"><time dateTime={new Date(entry.viewedAt).toISOString()}>{new Date(entry.viewedAt).toLocaleString('ko-KR')}</time> 열람</p>
          <button className="text-button danger-text" aria-label={`상품 ${entry.id} 최근 기록 삭제`} onClick={(event) => { focus(event); if (history.owner) history.remove(history.owner, entry.id) }}>기록 삭제</button>
          {query.isPaused ? <p role="status">연결을 기다리는 중입니다.</p> : query.isPending || query.isFetching ? <p role="status">상품 정보를 불러오는 중입니다.</p> : query.isError ? <div className="state-panel" role="status"><h2>{query.error instanceof ApiClientError && query.error.status === 404 ? '상품을 찾을 수 없습니다' : '상품을 불러오지 못했습니다'}</h2><button className="btn btn-outline-dark btn-sm" onClick={() => { if (recentProducts(client).getState().owner === history.owner && recentProducts(client).getState().ready) void query.refetch() }}>상품 다시 불러오기</button></div> : <ProductCard product={query.data} />}
        </section>
      })}</div>}
    </>}
  </section>
}
