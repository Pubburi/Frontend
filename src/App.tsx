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
import { api } from './services/api'
import { cartTotals, useCart } from './state/cart'
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
  if (session.isPending)
    return <Loading label="로그인 상태를 확인하는 중입니다." />
  if (session.isError)
    return (
      <Empty title="로그인 상태를 확인하지 못했습니다">
        <button onClick={() => session.refetch()}>다시 시도</button>
      </Empty>
    )
  if (mode === 'guest')
    return session.data ? (
      <Navigate to={safeRedirect(search.get('redirect'))} replace />
    ) : (
      children
    )
  if (!session.data)
    return (
      <Navigate
        to={`/account?${new URLSearchParams({ redirect: location.pathname + location.search })}`}
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
  useRecentProducts()
  const comparisonIds = useComparison((state) => state.ids)
  const ui = useUi()
  const client = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const [menu, setMenu] = useState(false)
  const navigationType = useNavigationType()
  const previousLocation = useRef<{ key: string; destination: string } | null>(null)
  useEffect(() => {
    const previous = previousLocation.current
    const destination = location.pathname + location.search
    previousLocation.current = { key: location.key, destination }
    // Consume navigation ownership once, including same-URL entries. POP never opts out.
    if (previous?.destination === destination) return
    setMenu(false)
    const intent = location.state?.catalogPagination
    const focusedResults = navigationType === 'PUSH' && previous &&
      intent?.fromLocationKey === previous.key && intent?.destination === destination &&
      document.activeElement instanceof HTMLElement &&
      document.activeElement.dataset.catalogResults === 'true'
    const removal = location.state?.catalogFilterRemoval
    const focusedFilter = navigationType === 'PUSH' && previous && removal?.fromLocationKey === previous.key &&
      removal?.destination === destination && document.activeElement instanceof HTMLElement &&
      document.activeElement.dataset.catalogFilterControl === 'true'
    const pageRepair = location.state?.catalogPageRepair
    const repairedPage = navigationType === 'REPLACE' && previous && pageRepair?.fromLocationKey === previous.key &&
      pageRepair.destination === destination
    if (!focusedResults && !focusedFilter && !repairedPage) window.scrollTo({ top: 0 })
  }, [location.key, location.pathname, location.search, navigationType])
  async function logout() {
    const result = await ui.run(
      'logout',
      async () => {
        await api.logout()
        client.clear()
        client.setQueryData(['session'], null)
      },
      '로그아웃되었습니다.',
    )
    if (result.ok) navigate('/')
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/">
          <Image src="/images/icon/mainIcon.webp" loading="eager" />
          <span>주점부리</span>
        </Link>
        <button
          className="menu-toggle"
          aria-expanded={menu}
          aria-controls="main-navigation"
          aria-label="메뉴 열기"
          onClick={() => setMenu(!menu)}
        >
          <span />
          <span />
          <span />
        </button>
        <div
          id="main-navigation"
          className={`navigation-panel ${menu ? 'open' : ''}`}
        >
          <nav className="nav-actions" aria-label="주요 메뉴">
            <NavLink to="/">홈</NavLink>
            <NavLink to="/products">전체 주류</NavLink>
            <NavLink to="/recent">최근 본 상품</NavLink>
            <NavLink to={comparisonUrl(comparisonIds)}>상품 비교{comparisonIds.length > 0 ? ` ${comparisonIds.length}` : ''}</NavLink>
            <NavLink to="/cart">
              장바구니{' '}
              {cartTotals(cart.items).count > 0 && (
                <span className="cart-count">
                  {cartTotals(cart.items).count}
                </span>
              )}
            </NavLink>
            <NavLink to={session.data ? '/profile' : '/account'}>마이</NavLink>
            {session.data?.role === 'ADMIN' && (
              <NavLink to="/admin">관리</NavLink>
            )}
          </nav>
          <div className="user-pill">
            {session.data ? (
              <>
                <span className="user-name">{session.data.name}님</span>
                <button
                  className="btn btn-sm btn-outline-dark"
                  disabled={ui.pending.logout}
                  onClick={logout}
                >
                  로그아웃
                </button>
              </>
            ) : (
              <Link className="btn btn-sm btn-dark" to="/account">
                로그인
              </Link>
            )}
          </div>
        </div>
      </header>
      <main>
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
