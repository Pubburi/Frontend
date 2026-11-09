import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
  useSearchParams,
} from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSession, safeRedirect } from './queries'
import { signupPreferenceReviews } from './preferences'
import { api } from './services/api'
import { cartTotals, useCart } from './state/cart'
import { useAccountCart } from './state/accountCart'
import { useUi } from './state/ui'
import { Empty, Image, Loading } from './components/ui'
import { HomePage, ProductsPage, ProductDetailPage } from './pages/CatalogPages'
import { AccountPage, CartPage, ProfilePage } from './pages/AccountPages'
import { PreferencesPage } from './pages/PreferencesPage'
import { FavoritesPage } from './pages/FavoritesPage'
import { DiscoverPage } from './pages/DiscoverPage'
import { ComparePage } from './pages/ComparePage'
import { useComparison } from './state/comparison'
import { comparisonUrl } from './comparison'
import { RecentPage } from './pages/RecentPage'
import { SettingsPage } from './pages/SettingsPage'
import { useRecentProducts } from './state/recentProducts'
import MarketDetailPage from './pages/MarketDetailPage'
import OrderDetailPage from './pages/OrderDetailPage'
import { NotebookPage } from './components/Notebook'
import { NotificationNav, NotificationsPage } from './components/Notifications'

const AdminPage = lazy(() => import('./pages/AdminPage'))
function Guard({
  mode,
  children,
}: {
  mode: 'auth' | 'admin' | 'guest'
  children: ReactNode
}) {
  const session = useSession()
  const location = useLocation()
  const [search] = useSearchParams()
  if (session.isError || (session.isPending && session.fetchStatus === 'paused'))
    return (
      <Empty
        title="로그인 상태를 확인하지 못했습니다"
        description="연결을 확인한 뒤 다시 시도해 주세요."
      >
        <button className="btn btn-dark" onClick={() => void session.refetch()}>다시 시도</button>
      </Empty>
    )
  if (session.isPending)
    return <p className="session-status" role="status">로그인 상태를 확인하는 중입니다.</p>
  if (mode === 'guest') {
    if (!session.data) return children
    return signupPreferenceReviews.has(session.data) ? (
      <Navigate to="/preferences" state={{ signupPreferenceReview: true }} replace />
    ) : (
      <Navigate to={safeRedirect(search.get('redirect'))} replace />
    )
  }
  if (!session.data)
    return (
      <Navigate
        to={`/account?${new URLSearchParams({ redirect: location.pathname + location.search + location.hash })}`}
        replace
      />
    )
  if (mode === 'admin' && session.data.role !== 'ADMIN')
    return <Navigate to="/" replace />
  return children
}
export function App() {
  const session = useSession()
  const cart = useCart()
  const accountCart = useAccountCart(true)
  const cartCount = accountCart.mode === 'account' && !accountCart.legacy
    ? accountCart.ready && !accountCart.error && !accountCart.loading ? accountCart.data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0 : 0
    : cartTotals(cart.items).count
  useRecentProducts()
  const comparisonIds = useComparison((state) => state.ids)
  const ui = useUi()
  const client = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const currentLocation = useRef(location.key)
  currentLocation.current = location.key
  const [menu, setMenu] = useState(false)
  const header = useRef<HTMLElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const member = session.isSuccess && session.fetchStatus === 'idle' ? session.data : null
  useEffect(() => {
    if (!menu) return
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      setMenu(false)
      menuButton.current?.focus({ preventScroll: true })
    }
    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !header.current?.contains(event.target)) setMenu(false)
    }
    document.addEventListener('keydown', dismissOnEscape)
    document.addEventListener('pointerdown', dismissOutside)
    return () => {
      document.removeEventListener('keydown', dismissOnEscape)
      document.removeEventListener('pointerdown', dismissOutside)
    }
  }, [menu])
  const navigationType = useNavigationType()
  const previousLocation = useRef<{ key: string; destination: string } | null>(null)
  useEffect(() => {
    const previous = previousLocation.current
    const destination = location.pathname + location.search + location.hash
    previousLocation.current = { key: location.key, destination }
    setMenu(false)
    // Consume navigation ownership once, including same-URL entries. POP never opts out.
    if (previous?.destination === destination) return
    if (location.hash) {
      const target = document.getElementById(location.hash.slice(1))
      if (target) {
        target.scrollIntoView({ behavior: 'instant' })
        target.focus({ preventScroll: true })
        return
      }
    }
    const intent = location.state?.catalogResultsNavigation
    const focusedResults = navigationType === 'PUSH' && previous &&
      intent?.fromLocationKey === previous.key && intent?.destination === destination &&
      document.activeElement instanceof HTMLElement &&
      document.activeElement.dataset.catalogResults === 'true'
    const removal = location.state?.catalogFilterRemoval
    const removedFilter = navigationType === 'PUSH' && previous && removal?.fromLocationKey === previous.key &&
      removal?.destination === destination
    const pageRepair = location.state?.catalogPageRepair
    const repairedPage = navigationType === 'REPLACE' && previous && pageRepair?.fromLocationKey === previous.key &&
      pageRepair.destination === destination
    if (!focusedResults && !removedFilter && !repairedPage) window.scrollTo({ top: 0 })
  }, [location.key, location.pathname, location.search, location.hash, navigationType])
  async function logout() {
    const submittedLocation = location.key
    const result = await ui.run(
      'logout',
      async () => {
        await api.logout()
        client.clear()
        client.setQueryData(['session'], null)
      },
      '로그아웃되었습니다.',
    )
    if (result.ok && currentLocation.current === submittedLocation) navigate('/')
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <header className="topbar" ref={header}>
        <div className="topbar-inner">
          <Link className="brand" to="/" onClick={() => setMenu(false)}>
            <Image src="/images/icon/mainIcon.webp" loading="eager" />
            <span>주점부리</span>
          </Link>
          <button
            ref={menuButton}
            className="menu-toggle"
            aria-expanded={menu}
            aria-controls="navigation-more"
            aria-label="메뉴 열기"
            onClick={() => setMenu(!menu)}
          >
            <span className="menu-glyph" aria-hidden="true"><i /><i /><i /></span>
            더 보기
          </button>
          <nav className="nav-actions" aria-label="주요 메뉴">
            <div className="nav-primary">
              <NavLink to="/products">전체 주류</NavLink>
              <NavLink to="/cart" aria-label={cartCount > 99 ? `장바구니 ${cartCount}개` : undefined}>
                장바구니
                {cartCount > 0 && <span className="cart-count">{cartCount > 99 ? '99+' : cartCount}</span>}
              </NavLink>
              <NotificationNav />
              <NavLink to={member ? '/profile' : '/account'}>마이</NavLink>
            </div>
            <div id="navigation-more" className={`nav-more ${menu ? 'open' : ''}`}>
              <div className="nav-extra">
                <NavLink to="/" end onClick={() => setMenu(false)}>홈</NavLink>
                <NavLink to="/recent" onClick={() => setMenu(false)}>최근 본 상품</NavLink>
                <NavLink to={comparisonUrl(comparisonIds)} onClick={() => setMenu(false)}>
                  상품 비교{comparisonIds.length > 0 ? ` ${comparisonIds.length}` : ''}
                </NavLink>
                {member?.role === 'ADMIN' && <NavLink to="/admin" onClick={() => setMenu(false)}>관리</NavLink>}
              </div>
              <div className="user-pill">
                {member ? (
                  <>
                    <span className="user-name" title={member.name}>{member.name}님</span>
                    <button className="btn btn-sm btn-outline-dark" disabled={ui.pending.logout} onClick={logout}>
                      {ui.pending.logout ? '로그아웃 중' : '로그아웃'}
                    </button>
                  </>
                ) : session.isError || session.fetchStatus === 'paused' ? (
                  <button className="btn btn-sm btn-outline-dark" onClick={() => void session.refetch()}>
                    로그인 다시 확인
                  </button>
                ) : session.isPending || session.isFetching ? (
                  <span className="header-session-status" role="status">로그인 확인 중</span>
                ) : (
                  <Link className="btn btn-sm btn-dark" to="/account" onClick={() => setMenu(false)}>로그인</Link>
                )}
              </div>
            </div>
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        {(accountCart.pending || accountCart.loading) && location.pathname !== '/cart' && <p className="notice" role="status">계정 장바구니를 확인·처리하는 동안 담기를 잠시 기다려 주세요. 상품 탐색은 계속할 수 있습니다.</p>}
        {cart.storageWarning && (
          <div className="notice" role="status" aria-live="polite">
            <strong>장바구니 보관 제한</strong>
            <span>
              이 브라우저에 장바구니 변경을 저장하지 못했습니다. 현재 화면에서는
              이용할 수 있지만 새로고침하면 이전 목록이 보이거나 담은 상품이
              사라질 수 있습니다. 주문 결과는 주문 내역에서 확인해 주세요.
            </span>
          </div>
        )}
        {ui.notice && (
          <div
            className={`notice ${ui.notice.type}`}
            role={ui.notice.type === 'error' ? 'alert' : 'status'}
            aria-live="polite"
          >
            <span>{ui.notice.message}</span>
            <button aria-label="알림 닫기" onClick={ui.clear}>
              ×
            </button>
          </div>
        )}
        <Suspense fallback={<Loading label="화면을 불러오는 중입니다." />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/products/:id" element={<ProductDetailPage />} />
            <Route path="/markets/:id" element={<MarketDetailPage />} />
            <Route path="/orders/:id" element={<OrderDetailPage />} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="/recent" element={<RecentPage />} />
            <Route path="/discover" element={<DiscoverPage />} />
            <Route path="/notebook" element={<NotebookPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route
              path="/account"
              element={
                <Guard mode="guest">
                  <AccountPage />
                </Guard>
              }
            />
            <Route
              path="/profile"
              element={
                <Guard mode="auth">
                  <ProfilePage />
                </Guard>
              }
            />
            <Route
              path="/settings"
              element={<SettingsPage />}
            />
            <Route
              path="/preferences"
              element={
                <Guard mode="auth">
                  <PreferencesPage />
                </Guard>
              }
            />
            <Route
              path="/favorites"
              element={
                <Guard mode="auth">
                  <FavoritesPage />
                </Guard>
              }
            />
            <Route
              path="/admin"
              element={
                <Guard mode="admin">
                  <AdminPage />
                </Guard>
              }
            />
            <Route
              path="*"
              element={
                <Empty title="페이지를 찾을 수 없습니다" icon="404">
                  <Link className="btn btn-dark" to="/">
                    홈으로 돌아가기
                  </Link>
                </Empty>
              }
            />
          </Routes>
        </Suspense>
      </main>
      <footer className="site-footer">
        <div>
          <strong>주점부리</strong>
          <p>
            탁주부터 위스키까지, 취향에 맞는 한 잔을 발견하는 주류 큐레이션 숍
          </p>
        </div>
        <p>
          지나친 음주는 건강에 해롭습니다. 청소년에게 주류를 판매하지 않습니다.
        </p>
      </footer>
    </div>
  )
}
