import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from '../queries'
import { ApiClientError } from '../services/api'
import { notificationKey, useNotificationQuery } from '../state/notifications'
import type { NotificationPage } from '../notifications'
import { Empty, Pagination } from './ui'

export function NotificationNav() {
  const { query, ready } = useNotificationQuery()
  const count = ready && query.isSuccess && query.fetchStatus === 'idle' ? query.data.unreadCount : 0
  return <NavLink to="/notifications">알림 {count > 0 && <span className="cart-count notification-count" aria-label={`읽지 않은 알림 ${count}개`}>{count}</span>}</NavLink>
}

export function NotificationsPage() {
  const session = useSession(), location = useLocation(), [search, setSearch] = useSearchParams()
  const raw = search.getAll('page'), page = raw.length === 0 ? 1 : raw.length === 1 && /^[1-9]\d*$/.test(raw[0]) ? Number(raw[0]) : 0
  const valid = Number.isSafeInteger(page) && page > 0 && (page - 1) * 20 <= 2147483647
  const heading = useRef<HTMLHeadingElement>(null)
  function changePage(value: number, keyboard = false, replace = false) {
    const next = new URLSearchParams(search); next.set('page', String(value)); setSearch(next, { replace })
    if (keyboard) heading.current?.focus()
  }
  const state = useNotificationQuery(valid ? page : 1, 20, `${location.key}:page`, valid)
  const { scope, account, ready, expired } = state
  if (!session.isPending && !session.isError && session.fetchStatus === 'idle' && session.data === null)
    return <Navigate to={`/account?${new URLSearchParams({ redirect: location.pathname + location.search })}`} replace />
  return <section className="view notifications-view">
    <div className="shop-intro compact-intro"><div><p className="section-kicker">Notifications</p><h1 ref={heading} tabIndex={-1}>알림</h1><p>내 데모 주문의 완료와 회원 후기 삭제 소식을 확인하세요. 외부 알림을 보내지 않습니다.</p></div></div>
    {!valid ? <Empty title="페이지 번호를 확인해 주세요"><button className="btn btn-dark" onClick={() => changePage(1, false, true)}>첫 알림 페이지 보기</button></Empty> :
      expired ? <Empty title="다시 로그인 상태를 확인해 주세요" description="로그인 상태가 바뀌어 알림과 읽지 않은 수를 표시하지 않았습니다."><button className="btn btn-dark" onClick={() => void account.recheck().catch(() => {})}>알림 로그인 상태 다시 확인</button></Empty> :
        !ready ? <Empty title={session.isError ? '로그인 상태를 확인하지 못했습니다' : '현재 로그인 상태를 확인하는 중입니다'}>{session.isError && <button className="btn btn-dark" onClick={() => void account.recheck().catch(() => {})}>알림 로그인 상태 다시 확인</button>}</Empty> : scope ?
          <NotificationList key={`${scope.generation}:${location.key}`} state={state} page={page} onPage={changePage} focusFallback={() => heading.current} /> : null}
  </section>
}

function NotificationList({ state, page, onPage, focusFallback }: {
  state: ReturnType<typeof useNotificationQuery>; page: number
  onPage: (page: number, keyboard?: boolean, replace?: boolean) => void; focusFallback: () => HTMLElement | null
}) {
  const { scope, account, pending, query } = state, client = useQueryClient()
  const [message, setMessage] = useState(''), [error, setError] = useState('')
  const alive = useRef(false), readTrigger = useRef<HTMLElement | null>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const owns = () => alive.current && !!scope && account.owns(scope)
  useLayoutEffect(() => {
    if (readTrigger.current && !readTrigger.current.isConnected) {
      if (owns() && document.activeElement === document.body) focusFallback()?.focus()
      readTrigger.current = null
    }
  }, [query.fetchStatus, query.dataUpdatedAt, pending])
  const maximum = query.data ? Math.max(1, query.data.totalPages) : page
  const repair = query.isSuccess && query.data.page === page && page > maximum
  useEffect(() => { if (repair && query.fetchStatus === 'idle') onPage(maximum, false, true) }, [repair, maximum, query.fetchStatus])
  useEffect(() => {
    if (!scope || !query.data || !owns()) return
    const key = [...notificationKey(scope), 'summary', 1, 1]
    const summary = client.getQueryState<NotificationPage>(key)
    if (summary?.fetchStatus === 'idle' && summary.data?.unreadCount !== query.data.unreadCount)
      void client.invalidateQueries({ queryKey: key, exact: true })
  }, [query.dataUpdatedAt])
  async function read(ids: string[], bulk: boolean) {
    if (!scope || !owns() || pending || query.fetchStatus !== 'idle') return
    const trigger = document.activeElement
    readTrigger.current = trigger instanceof HTMLElement ? trigger : null
    setError(''); setMessage('')
    try {
      if (await account.mark(scope, ids, bulk) && owns()) setMessage(bulk ? '현재 페이지의 알림을 읽음으로 표시했습니다.' : '알림을 읽음으로 표시했습니다.')
    } catch (cause) {
      if (!owns()) return
      setError(cause instanceof ApiClientError && cause.status === 404 ? '알림이 변경되어 읽음으로 표시하지 못했습니다. 현재 페이지를 다시 확인해 주세요.' : '읽음 처리 결과를 확인하지 못했습니다. 알림을 새로고침해 확인해 주세요.')
    } finally {
      if (owns() && trigger instanceof HTMLElement && !trigger.isConnected && document.activeElement === document.body) focusFallback()?.focus()
    }
  }
  const status = query.error instanceof ApiClientError ? query.error.status : 0
  const unsupported = status === 404 && query.error instanceof ApiClientError && query.error.code === 'NOTIFICATIONS_NOT_SUPPORTED'
  const busy = query.isPending || query.fetchStatus !== 'idle'
  const unread = query.data?.items.filter((item) => item.readAt === null).map((item) => item.id) ?? []
  return <>
    <div className="button-row"><button className="btn btn-outline-dark" disabled={pending || busy} onClick={() => void query.refetch()}>알림 새로고침</button>
      <button className="btn btn-dark" disabled={pending || busy || !unread.length || query.isError} onClick={() => void read(unread, true)}>현재 페이지 읽음</button></div>
    {message && <p role="status" className="notice success">{message}</p>}
    {error && <p role="alert" className="notice error">{error}</p>}
    {pending && <p role="status">알림을 읽음으로 표시하는 중입니다.</p>}
    {busy || repair ? <p role="status">현재 알림을 불러오는 중입니다.</p> : query.isError ?
      <Empty title={unsupported ? '현재 서버는 내부 알림을 지원하지 않습니다' : '알림을 불러오지 못했습니다'} description="빈 알림으로 처리하지 않았습니다. 새로고침해서 다시 확인해 주세요." /> : query.data ? <>
        <p className="muted">읽지 않은 알림 {query.data.unreadCount}개 · 최신순</p>
        {query.data.items.length ? <ol className="notification-list">{query.data.items.map((item) => <li key={item.id}>
          <article className={`settings-card notification-card ${item.readAt === null ? 'unread' : ''}`} aria-labelledby={`notification-${item.id}`}>
            <div className="notification-heading"><h2 id={`notification-${item.id}`}>{item.type === 'ORDER_COMPLETED' ? '데모 주문 처리 완료' : '회원 후기 삭제'}</h2><span className="badge">{item.readAt === null ? '읽지 않음' : '읽음'}</span></div>
            <p>{item.type === 'ORDER_COMPLETED' ? `주문 #${item.orderId}의 데모 처리가 완료되었습니다. 실제 결제·배송 완료를 뜻하지 않습니다.` : `‘${item.productName}’에 남긴 회원 후기가 관리자에 의해 삭제되었습니다.`}</p>
            <time dateTime={new Date(item.createdAt).toISOString()}>{new Date(item.createdAt).toLocaleString('ko-KR')}</time>
            <div className="button-row">{item.targetAvailable ? <Link className="text-link" to={item.type === 'ORDER_COMPLETED' ? `/orders/${item.orderId}` : `/products/${item.productId}`}>{item.type === 'ORDER_COMPLETED' ? `주문 #${item.orderId} 보기` : '관련 상품 보기'}</Link> : <span className="muted">관련 {item.type === 'ORDER_COMPLETED' ? '주문' : '상품'}을 더 이상 볼 수 없습니다.</span>}
              {item.readAt === null && <button className="btn btn-outline-dark btn-sm" disabled={pending} onClick={() => void read([item.id], false)}>읽음으로 표시</button>}</div>
          </article>
        </li>)}</ol> : <Empty title="아직 받은 알림이 없습니다" description="데모 주문이 처리되거나 관리자가 내 후기를 삭제하면 여기에 표시됩니다." />}
        <Pagination page={query.data} onChange={(value) => onPage(value)} onKeyboardNavigate={(value) => onPage(value, true)} />
      </> : null}
  </>
}
