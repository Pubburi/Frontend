import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient, type Query } from '@tanstack/react-query'
import { api, ApiClientError } from '../services/api'
import { useSession } from '../queries'
import { useUi } from '../state/ui'
import { orderPrivacy } from '../state/orderPrivacy'
import { parseOrderId, demoOrderStatus } from '../orders'
import { Empty, Loading } from '../components/ui'
import { OrderLines, orderMoney } from '../components/OrderLines'
import { orderType } from '../utils/format'
import type { Order, User } from '../types'

const owners = new WeakMap<object, number>()
let nextOwner = 0
let nextView = 0
const authPending = () => {
  const pending = useUi.getState().pending
  return Boolean(pending.login || pending.join || pending.logout || pending['settings-password'])
}
function OrderShell({ id, children, action }: { id: number | null; children: ReactNode; action?: ReactNode }) {
  return <section className="view order-detail-view" data-order-id={id ?? undefined}>
    <div className="shop-intro compact-intro">
      <div><p className="section-kicker">Demo Order</p><h1>데모 주문 상세</h1><p>실제 결제·배송·예약 없이 접수한 시연 주문입니다.</p></div>
      <div className="order-detail-actions"><Link className="btn btn-outline-dark" to="/profile">내 주문 내역</Link>{action}</div>
    </div>
    {children}
  </section>
}
export default function OrderDetailPage() {
  const id = parseOrderId(useParams().id)
  const location = useLocation()
  const session = useSession()
  const client = useQueryClient()
  const auth = client.getQueryCache().find({ queryKey: ['session'], exact: true })
  const transitioning = useUi(authPending)
  if (id === null) return <OrderShell id={null}><Empty title="주문 번호를 확인해 주세요" description="내 주문 내역에서 다시 선택해 주세요." /></OrderShell>
  if (transitioning || session.isPending || session.fetchStatus !== 'idle') return <OrderShell id={id}><Loading label="현재 로그인 상태를 확인하는 중입니다." /></OrderShell>
  if (session.isError) return <OrderShell id={id}><Empty title="로그인 상태를 확인하지 못했습니다"><button className="btn btn-dark" onClick={() => session.refetch()}>로그인 상태 다시 확인</button></Empty></OrderShell>
  if (!session.data) return <Navigate to={`/account?${new URLSearchParams({ redirect: location.pathname + location.search })}`} replace />
  if (!auth) return null
  if (!owners.has(auth)) owners.set(auth, ++nextOwner)
  return <OwnedOrder key={`${owners.get(auth)}:${session.data.id}:${location.key}:${id}`} id={id} user={session.data} auth={auth} />
}
function OwnedOrder({ id, user, auth }: { id: number; user: User; auth: Query }) {
  const client = useQueryClient()
  const location = useLocation()
  const navigate = useNavigate()
  const session = useSession()
  // New mounts after auth writes/ABA/route entries never reuse a pre-transition read.
  const [view] = useState(() => ++nextView)
  const privacy = orderPrivacy(client)
  const failures = useSyncExternalStore(privacy.subscribe, privacy.snapshot)
  const ownsActor = () => client.getQueryCache().find({ queryKey: ['session'], exact: true }) === auth &&
    client.getQueryData<User | null>(['session'])?.id === user.id && !authPending()
  const key = ['account', user.id, 'order-detail', id, view] as const
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      // A fresh, independent read cannot inherit a session request started before an auth write.
      const actor = await api.me() as User
      if (!ownsActor()) throw new Error('이전 계정의 조회입니다.')
      if (actor?.id !== user.id) throw new ApiClientError({ code: 'UNAUTHORIZED' }, 401)
      const order = await api.order(id)
      if (!ownsActor()) throw new Error('이전 계정의 조회입니다.')
      if (order?.oId !== id) throw new Error('요청한 주문과 응답이 일치하지 않습니다.')
      if (actor.role !== 'ADMIN' && order.userId !== actor.id) throw new ApiClientError({ code: 'FORBIDDEN' }, 403)
      return { order, admin: actor.role === 'ADMIN' }
    },
    refetchOnReconnect: false,
  })
  const currentQuery = client.getQueryCache().find({ queryKey: key, exact: true })
  const expired = failures.some((failure) => failure.auth === auth && failure.query === currentQuery)
  const busy = query.isPending || query.fetchStatus !== 'idle'
  function loginAgain() {
    if (!ownsActor() || session.fetchStatus !== 'idle' || query.fetchStatus !== 'idle') return
    client.clear(); client.setQueryData(['session'], null)
    navigate(`/account?${new URLSearchParams({ redirect: location.pathname + location.search })}`)
  }
  const action = expired ? <button className="btn btn-dark" disabled={query.fetchStatus !== 'idle' || session.fetchStatus !== 'idle'} onClick={loginAgain}>다시 로그인</button> :
    <button className="btn btn-outline-dark" aria-disabled={busy} onClick={() => { if (!busy && ownsActor()) void query.refetch() }}>주문 상태 새로고침</button>
  return <OrderShell id={id} action={action}>
    {expired ? <Empty title="다시 로그인해 주세요" description="로그인 상태가 바뀌어 주문을 표시하지 않았습니다." /> : query.fetchStatus === 'paused' ?
      <Empty title="연결 후 주문을 확인해 주세요" description="연결이 복구되면 현재 권한과 주문을 다시 확인합니다." /> : busy ?
      <Loading label="현재 주문을 확인하는 중입니다." /> : query.isError ?
      <Empty title={query.error instanceof ApiClientError && query.error.status === 403 ? '주문을 볼 권한이 없습니다' : query.error instanceof ApiClientError && query.error.status === 404 ? '주문을 찾을 수 없습니다' : '주문을 불러오지 못했습니다'} description="내 주문 내역으로 돌아가거나 상태를 다시 확인해 주세요." /> : query.data ? <>
        <article className="order-row order-detail-card">
          <div className="order-summary-head"><div><h2>주문 #{query.data.order.oId}</h2><strong>{orderType(query.data.order.orderType)}</strong><p><span className="badge" data-order-field="status">{demoOrderStatus(query.data.order.completed)}</span></p></div><strong className="order-detail-total">{orderMoney(query.data.order.totalPrice)}</strong></div>
          <OrderLines order={query.data.order} showUnitPrice />
        </article>
        <p className="muted">상태는 마지막 조회 기준입니다. 데모 처리 완료는 실제 결제·상품 준비·배송 완료를 뜻하지 않습니다.</p>
        {query.data.admin && <p><span className="muted">주문 회원: {query.data.order.userId ?? '탈퇴한 회원'}</span> <Link className="text-link" to="/admin?tab=orders">관리자 주문 목록</Link></p>}
      </> : null}
  </OrderShell>
}
