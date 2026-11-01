import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api'
import { safeRedirect, useSession } from '../queries'
import { useCart, cartTotals } from '../state/cart'
import { useUi } from '../state/ui'
import { profilePrivacy } from '../state/profilePrivacy'
import { Empty, Image, Loading, Pagination, Quantity } from '../components/ui'
import { OrderCard } from '../components/OrderLines'
import { money, productImage } from '../utils/format'
import type { Order, Page, Profile } from '../types'

export function CartPage() {
  const cart = useCart()
  const totals = cartTotals(cart.items)
  const ui = useUi()
  const session = useSession()
  const navigate = useNavigate()
  const client = useQueryClient()
  const location = useLocation()
  const currentLocation = useRef(location.key)
  currentLocation.current = location.key
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  async function checkout(event: FormEvent) {
    event.preventDefault()
    if (!session.data) {
      ui.error(new Error('주문하려면 먼저 로그인해 주세요.'))
      navigate('/account?redirect=/cart')
      return
    }
    const userId = session.data.id
    const submittedLocation = location.key
    const result = await ui.run(
      'checkout',
      () => cart.checkout(userId),
      '주문이 접수되었습니다.',
    )
    if (result.ok) {
      // The order succeeded. A later profile/list refresh must not turn it into a failed order.
      void client.invalidateQueries({ queryKey: ['account', userId] })
      void client.invalidateQueries({ queryKey: ['catalog', 'popular'] })
      if (mounted.current && currentLocation.current === submittedLocation)
        navigate('/profile')
    }
  }
  const help = {
    TAKEOUT: '준비가 완료되면 매장에서 바로 찾아갈 수 있어요.',
    ONLINE: '온라인 주문으로 접수하며 상세 요청은 메모에 남겨주세요.',
    OFFLINE: '매장 테이블에서 주문할 때 테이블 번호를 입력해 주세요.',
  }[cart.orderForm.orderType]
  return (
    <section className="view cart-view">
      <div className="shop-intro compact-intro">
        <div>
          <p className="section-kicker">Cart</p>
          <h1>장바구니</h1>
          <p>선택한 상품과 수량을 주문 전에 확인하세요.</p>
        </div>
        {cart.items.length > 0 && (
          <span className="result-count">
            총 <strong>{totals.count}</strong>병
          </span>
        )}
      </div>
      {ui.pending.checkout && (
        <p className="muted" role="status">
          주문 접수 중입니다. 이미 전송한 상품과 수량은 변경되지 않습니다.
          추가로 담은 수량과 새 요청 사항은 다음 주문에 남습니다.
        </p>
      )}
      {cart.items.length ? (
        <div className="cart-layout">
          <div className="cart-list">
            {cart.items.map((item) => (
              <article key={item.product.id} className="cart-row">
                <Link
                  to={`/products/${item.product.id}`}
                  className="cart-image-link"
                >
                  <Image
                    src={productImage(item.product)}
                    alt={item.product.name}
                  />
                </Link>
                <div className="cart-product-copy">
                  <span className="product-type">{item.product.type}</span>
                  <Link to={`/products/${item.product.id}`}>
                    <strong>{item.product.name}</strong>
                  </Link>
                  <p className="muted">병당 {money(item.product.price)}원</p>
                </div>
                <Quantity
                  value={item.quantity}
                  label={`${item.product.name} 수량`}
                  onChange={(value) => cart.setQuantity(item.product.id, value)}
                />
                <strong className="line-total">
                  {money(item.product.price * item.quantity)}원
                </strong>
                <button
                  className="text-button danger-text"
                  aria-label={`${item.product.name} 삭제`}
                  onClick={() => cart.remove(item.product.id)}
                >
                  삭제
                </button>
              </article>
            ))}
          </div>
          <aside className="checkout-card">
            <div>
              <p className="section-kicker">Order Summary</p>
              <h2>주문 요약</h2>
            </div>
            <dl className="summary-list">
              <div>
                <dt>상품 수</dt>
                <dd>{totals.count}병</dd>
              </div>
              <div>
                <dt>상품 금액</dt>
                <dd>{money(totals.total)}원</dd>
              </div>
              <div className="summary-total">
                <dt>주문 예정 금액</dt>
                <dd>{money(totals.total)}원</dd>
              </div>
            </dl>
            <form className="checkout-form" onSubmit={checkout}>
              <label className="field-group">
                <span>주문 방식</span>
                <select
                  className="form-select"
                  value={cart.orderForm.orderType}
                  aria-label="주문 방식"
                  onChange={(e) =>
                    cart.setOrderForm({ orderType: e.target.value })
                  }
                >
                  <option value="TAKEOUT">포장 주문</option>
                  <option value="ONLINE">온라인 주문</option>
                  <option value="OFFLINE">매장 주문</option>
                </select>
                <small>{help}</small>
              </label>
              <label className="field-group">
                <span>테이블·요청 사항</span>
                <input
                  className="form-control"
                  maxLength={20}
                  placeholder="테이블 번호 또는 요청 사항"
                  value={cart.orderForm.orderTable}
                  onChange={(e) =>
                    cart.setOrderForm({ orderTable: e.target.value })
                  }
                />
              </label>
              <button
                className="btn btn-gold btn-wide"
                disabled={ui.pending.checkout || session.isPending}
              >
                {money(totals.total)}원 주문하기
              </button>
              <p className="muted">실제 결제 없이 데모 주문으로 접수합니다.</p>
            </form>
          </aside>
        </div>
      ) : (
        <Empty
          title="장바구니가 비어 있습니다"
          description="마음에 드는 술을 먼저 담아보세요."
        >
          <Link className="btn btn-dark" to="/products">
            전체 주류 보기
          </Link>
        </Empty>
      )}
    </section>
  )
}

export function ProfilePage() {
  const session = useSession()
  const user = session.data
  const client = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const ui = useUi()
  const queryCache = client.getQueryCache()
  const authOwner = queryCache.find({ queryKey: ['session'], exact: true })
  const [page, setPage] = useState(1)
  const profileKey = ['account', user?.id, 'profile'] as const
  const ordersKey = ['account', user?.id, 'orders', page] as const
  const profile = useQuery<Profile>({
    queryKey: profileKey,
    queryFn: () => api.profile(user!.id),
    enabled: Boolean(user),
  })
  const orders = useQuery<Page<Order>>({
    queryKey: ordersKey,
    queryFn: () => api.userOrders(user!.id, { page, size: 10 }),
    enabled: Boolean(user),
  })
  const privacy = profilePrivacy(client)
  const failures = useSyncExternalStore(privacy.subscribe, privacy.snapshot)
  const currentReads = [
    { query: queryCache.find({ queryKey: profileKey, exact: true }), fetchStatus: profile.fetchStatus },
    { query: queryCache.find({ queryKey: ordersKey, exact: true }), fetchStatus: orders.fetchStatus },
  ]
  const unauthorizedReads = failures.filter((failure) => failure.auth === authOwner && failure.account === user &&
    currentReads.some(({ query }) => query === failure.query))
  function loginAgain() {
    const currentAuth = queryCache.find({ queryKey: ['session'], exact: true })
    if (!user || !currentAuth || currentAuth !== authOwner ||
        currentAuth.state.status !== 'success' || currentAuth.state.data !== user ||
        currentAuth.state.fetchStatus !== 'idle')
      return
    const currentFailures = privacy.snapshot().filter((failure) => failure.auth === currentAuth &&
      failure.account === user && currentReads.some(({ query }) => query === failure.query))
    if (currentFailures.some(({ query }) => query.state.fetchStatus !== 'idle')) return
    const currentFailure = unauthorizedReads.some((failure) =>
      currentFailures.includes(failure) && queryCache.get(failure.query.queryHash) === failure.query &&
      failure.query.state.fetchStatus === 'idle')
    if (!currentFailure) return
    ui.clear()
    client.clear()
    client.setQueryData(['session'], null)
    navigate(`/account?${new URLSearchParams({ redirect: location.pathname + location.search })}`)
  }
  if (user && unauthorizedReads.length)
    return (
      <section className="view profile-view">
        <Empty title="다시 로그인해 주세요" description="로그인 상태가 바뀌어 내 정보를 표시하지 않았습니다.">
          <button className="btn btn-dark" onClick={loginAgain}
            disabled={session.fetchStatus !== 'idle' || currentReads.some(({ query, fetchStatus }) =>
              unauthorizedReads.some((failure) => failure.query === query) && fetchStatus !== 'idle')}>
            다시 로그인
          </button>
        </Empty>
      </section>
    )
  const grade = profile.data?.grade || {}
  const stamps = profile.data?.user?.stamps ?? user?.stamps ?? 0
  const progress = grade.stepMax
    ? Math.min(100, Math.round((Number(grade.step || 0) / grade.stepMax) * 100))
    : grade.to === 0
      ? 100
      : 0
  return (
    <section className="view profile-view">
      {profile.isPending ? (
        <Loading />
      ) : profile.isError ? (
        <Empty title="내 정보를 불러오지 못했습니다">
          <button onClick={() => profile.refetch()}>다시 시도</button>
        </Empty>
      ) : (
        <>
          <section className="profile-hero">
            <div>
              <p className="section-kicker">My Page</p>
              <h1>{profile.data?.user?.name || user?.name}님의 취향 기록</h1>
              <p className="muted">{user?.id}</p>
              <Link className="btn btn-outline-dark" to="/preferences">내 취향 설정</Link>
              <Link className="btn btn-outline-dark" to="/favorites">내 찜 목록</Link>
              <Link className="btn btn-outline-dark" to="/discover">기본 주류 둘러보기</Link>
            </div>
            <button
              className="btn btn-outline-dark"
              onClick={() => {
                void profile.refetch()
                void orders.refetch()
              }}
            >
              새로고침
            </button>
          </section>
          <section className="grade-card">
            <div className="grade-copy">
              <span className="badge gold-badge">{grade.title || '회원'}</span>
              <h2>스탬프 {stamps}개</h2>
              <p>
                {Number(grade.to) > 0
                  ? `다음 등급까지 ${grade.to}개 남았어요.`
                  : '현재 최고 등급입니다.'}
              </p>
            </div>
            <div
              className="grade-progress"
              aria-label={`등급 진행도 ${progress}%`}
            >
              <div>
                <span style={{ width: `${progress}%` }} />
              </div>
              <small>
                {grade.step || 0} / {grade.stepMax || 0}
              </small>
            </div>
          </section>
        </>
      )}
      <section className="section-band">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Orders</p>
            <h2>주문 내역</h2>
          </div>
          <span className="muted">총 {orders.data?.total || 0}건</span>
        </div>
        {orders.isPending ? (
          <Loading />
        ) : orders.isError ? (
          <Empty title="주문 내역을 불러오지 못했습니다">
            <button onClick={() => orders.refetch()}>다시 시도</button>
          </Empty>
        ) : orders.data.items.length ? (
          <div className="order-list">
            {orders.data.items.map((order) => (
              <OrderCard key={order.oId} order={order} />
            ))}
            <Pagination page={orders.data} onChange={setPage} />
          </div>
        ) : (
          <Empty
            title="아직 주문 내역이 없습니다"
            description="첫 번째 취향을 발견해 보세요."
          >
            <Link className="btn btn-dark" to="/products">
              전체 주류 보기
            </Link>
          </Empty>
        )}
      </section>
    </section>
  )
}

export function AccountPage() {
  const [mode, setMode] = useState<'login' | 'join'>('login')
  const [login, setLogin] = useState({ id: '', pass: '' })
  const [join, setJoin] = useState({ id: '', name: '', pass: '' })
  const [check, setCheck] = useState({ id: '', available: false, message: '' })
  const latestJoinId = useRef(join.id)
  latestJoinId.current = join.id
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const client = useQueryClient()
  const ui = useUi()
  const authenticating = Boolean(ui.pending.login || ui.pending.join)
  async function authenticate(event: FormEvent) {
    event.preventDefault()
    if (mode === 'join' && (!check.available || check.id !== join.id.trim())) {
      ui.error(new Error('아이디 중복 확인이 필요합니다.'))
      return
    }
    const credentials =
      mode === 'join'
        ? { id: join.id.trim(), pass: join.pass }
        : { id: login.id.trim(), pass: login.pass }
    let accountCreated = false
    const result = await ui.run(
      mode,
      async () => {
        if (mode === 'join') {
          await api.join({
            id: credentials.id,
            name: join.name.trim(),
            pass: credentials.pass,
          })
          accountCreated = true
        }
        const user = await api.login(credentials)
        client.clear()
        client.setQueryData(['session'], user)
        return user
      },
      mode === 'join' ? '가입되었습니다.' : '로그인되었습니다.',
    )
    if (result.ok) {
      setLogin({ id: '', pass: '' })
      setJoin({ id: '', name: '', pass: '' })
      navigate(safeRedirect(search.get('redirect')), { replace: true })
    } else if (accountCreated) {
      setMode('login')
      setLogin({ id: credentials.id, pass: '' })
      setJoin({ id: '', name: '', pass: '' })
      setCheck({ id: '', available: false, message: '' })
      ui.error(
        new Error('회원가입은 완료되었지만 로그인하지 못했습니다. 비밀번호를 입력해 다시 로그인해 주세요.'),
      )
    }
  }
  async function checkId() {
    const id = join.id.trim()
    if (!id) return
    const result = await ui.run('id-check', () => api.idAvailable(id))
    if (result.ok && latestJoinId.current.trim() === id)
      setCheck({
        id,
        available: Boolean(result.data?.available),
        message: result.data?.available
          ? '사용할 수 있는 아이디입니다.'
          : '이미 사용 중인 아이디입니다.',
      })
  }
  return (
    <section className="view account-layout">
      <div className="account-story">
        <p className="section-kicker">Welcome</p>
        <h1>
          한 잔의 취향을
          <br />더 선명하게
        </h1>
        <p>
          주점부리 회원이 되면 주문 내역과 등급을 한 곳에서 확인할 수 있습니다.
        </p>
        <ul>
          <li>다양한 주종을 한 번에 탐색</li>
          <li>주문할 때마다 스탬프 적립</li>
          <li>나의 주문 상태를 간편하게 확인</li>
        </ul>
      </div>
      <div className="auth-panel">
        <div className="segmented" aria-label="계정 메뉴">
          <button
            className={mode === 'login' ? 'active' : ''}
            disabled={authenticating}
            onClick={() => setMode('login')}
          >
            로그인
          </button>
          <button
            className={mode === 'join' ? 'active' : ''}
            disabled={authenticating}
            onClick={() => setMode('join')}
          >
            회원가입
          </button>
        </div>
        <form className="auth-form" onSubmit={authenticate}>
          <div>
            <p className="section-kicker">
              {mode === 'login' ? 'Sign In' : 'Join'}
            </p>
            <h2>
              {mode === 'login'
                ? '다시 만나 반가워요'
                : '취향 기록을 시작해 보세요'}
            </h2>
          </div>
          <label className="field-group">
            <span>아이디</span>
            <div className="inline-field">
              <input
                className="form-control"
                autoComplete="username"
                aria-label="아이디"
                maxLength={100}
                disabled={authenticating}
                required
                value={mode === 'login' ? login.id : join.id}
                onChange={(e) => {
                  if (mode === 'login')
                    setLogin({ ...login, id: e.target.value })
                  else {
                    setJoin({ ...join, id: e.target.value })
                    setCheck({ id: '', available: false, message: '' })
                  }
                }}
              />
              {mode === 'join' && (
                <button
                  type="button"
                  className="btn btn-outline-dark"
                  disabled={
                    authenticating || !join.id.trim() || ui.pending['id-check']
                  }
                  onClick={checkId}
                >
                  중복 확인
                </button>
              )}
            </div>
            {mode === 'join' && check.message && (
              <small
                className={check.available ? 'success-text' : 'danger-text'}
                role="status"
              >
                {check.message}
              </small>
            )}
          </label>
          {mode === 'join' && (
            <label className="field-group">
              <span>이름</span>
              <input
                className="form-control"
                autoComplete="name"
                maxLength={100}
                disabled={authenticating}
                required
                value={join.name}
                onChange={(e) => setJoin({ ...join, name: e.target.value })}
              />
            </label>
          )}
          <label className="field-group">
            <span>비밀번호</span>
            <input
              type="password"
              aria-label="비밀번호"
              className="form-control"
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              minLength={mode === 'join' ? 4 : undefined}
              maxLength={100}
              disabled={authenticating}
              required
              value={mode === 'login' ? login.pass : join.pass}
              onChange={(e) =>
                mode === 'login'
                  ? setLogin({ ...login, pass: e.target.value })
                  : setJoin({ ...join, pass: e.target.value })
              }
            />
            {mode === 'join' && <small>4자 이상 입력해 주세요.</small>}
          </label>
          <button
            className="btn btn-dark w-100"
            disabled={
              authenticating ||
              (mode === 'join' &&
                (!check.available || check.id !== join.id.trim()))
            }
          >
            {ui.pending[mode]
              ? mode === 'login'
                ? '로그인 중…'
                : '가입 중…'
              : mode === 'login'
                ? '로그인'
                : '회원가입'}
          </button>
        </form>
      </div>
    </section>
  )
}
