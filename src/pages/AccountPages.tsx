import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api'
import { safeRedirect, useSession } from '../queries'
import { useCart, cartTotals } from '../state/cart'
import { accountCart as accountCartState, useAccountCart } from '../state/accountCart'
import { AccountCartView } from '../components/AccountCart'
import { useUi } from '../state/ui'
import { profilePrivacy } from '../state/authReadPrivacy'
import { Empty, Image, Loading, Pagination, Quantity } from '../components/ui'
import { OrderCard } from '../components/OrderLines'
import { money, productImage } from '../utils/format'
import { validPassword } from '../settings'
import { categories } from '../catalog'
import { signupAbvPresets, signupPreferenceReviews, type SignupPreferenceChoices } from '../preferences'
import type { Order, Page, Profile, User } from '../types'

function checkoutAuthPending(pending: Record<string, boolean>) {
  return Boolean(pending.login || pending.join || pending.logout || pending['settings-password'])
}

import './account-admin.css'

export function CartPage() {
  const account = useAccountCart(true)
  if (account.mode === 'unknown') return <DeviceCartPage authorityBlocked verify={() => void account.recheck()} />
  if (account.mode === 'guest' || account.legacy) return <DeviceCartPage />
  return <AccountCartView account={account} />
}

function DeviceCartPage({ authorityBlocked = false, verify }: { authorityBlocked?: boolean; verify?: () => void }) {
  const cart = useCart()
  const totals = cartTotals(cart.items)
  const ui = useUi()
  const session = useSession()
  const navigate = useNavigate()
  const client = useQueryClient()
  const location = useLocation()
  const checkingSession = checkoutAuthPending(ui.pending) || session.isPending || session.fetchStatus !== 'idle'
  const currentLocation = useRef(location.key)
  currentLocation.current = location.key
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  async function checkout(event: FormEvent) {
    event.preventDefault()
    const authority = accountCartState(client).getState()
    if (authorityBlocked || !authority.ready || !(authority.mode === 'guest' || authority.mode === 'account' && authority.legacy)) return
    const current = client.getQueryState<User | null>(['session'])
    if (checkoutAuthPending(useUi.getState().pending) || current?.status !== 'success' ||
        current.fetchStatus !== 'idle' || current.data !== session.data) return
    if (!current.data) {
      ui.error(new Error('주문하려면 먼저 로그인해 주세요.'))
      navigate('/account?redirect=/cart')
      return
    }
    const userId = current.data.id
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
      <div className="shop-intro compact-intro purchase-intro">
        <div>
          <p className="section-kicker">기기 장바구니</p>
          <h1>장바구니</h1>
          <p>선택한 상품과 수량을 주문 전에 확인하세요.</p>
          {authorityBlocked && <p className="muted">로그인 확인 전에는 이 기기에 담은 상품만 표시합니다. 계정 장바구니와 주문은 확인 후 이용할 수 있습니다.</p>}
        </div>
        {cart.items.length > 0 && (
          <span className="purchase-chip">
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
                    product
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
          <aside className="checkout-card" aria-labelledby="device-checkout-heading">
            <div>
              <p className="section-kicker">시연 주문</p>
              <h2 id="device-checkout-heading">주문 요약</h2>
            </div>
            <dl className="summary-list">
              <div>
                <dt>상품 수</dt>
                <dd>{totals.count}병</dd>
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
                <span>테이블·요청 사항 <small>선택</small></span>
                <input
                  className="form-control"
                  aria-label="테이블·요청 사항"
                  maxLength={20}
                  placeholder="테이블 번호 또는 요청 사항"
                  value={cart.orderForm.orderTable}
                  onChange={(e) =>
                    cart.setOrderForm({ orderTable: e.target.value })
                  }
                />
              </label>
              {!checkingSession && (session.isError || authorityBlocked) && (
                <button className="btn btn-outline-dark" type="button" onClick={() => authorityBlocked ? verify?.() : void session.refetch()}>
                  로그인 상태 다시 확인
                </button>
              )}
              {!checkingSession && !session.isError && !authorityBlocked && session.data === null && (
                <p className="purchase-feedback">로그인한 뒤 같은 장바구니에서 주문을 이어갈 수 있어요.</p>
              )}
              <button
                className="btn btn-gold btn-wide"
                disabled={authorityBlocked || ui.pending.checkout || checkingSession || session.isError}
              >
                {money(totals.total)}원 주문하기
              </button>
              <p className="muted">
                <span role="status">{checkingSession
                  ? '로그인 상태를 확인하는 동안 주문을 기다려 주세요.'
                  : session.isError ? '로그인 상태를 확인하지 못했습니다. 장바구니와 요청 사항은 유지됩니다.' : authorityBlocked ? '로그인 상태를 다시 확인한 뒤 주문해 주세요. 기기 입력은 유지됩니다.' : ''}</span>
                {(checkingSession || session.isError) && <br />}
                실제 결제 없이 데모 주문으로 접수합니다.
              </p>
            </form>
          </aside>
        </div>
      ) : (
        <Empty
          title="장바구니가 비어 있습니다"
          description="상품을 둘러보고 마음에 드는 술을 담아보세요."
        >
          <Link className="btn btn-dark" to="/products">
            전체 주류 보기
          </Link>
        </Empty>
      )}
      {authorityBlocked && !cart.items.length && !checkingSession && <button className="btn btn-outline-dark" onClick={verify}>로그인 상태 다시 확인</button>}
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
  const orderHeading = useRef<HTMLHeadingElement>(null)
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
  const orderAnchorReady = Boolean(user && !profile.isPending && !unauthorizedReads.length)
  useEffect(() => {
    if (location.hash !== '#order-history' || !orderAnchorReady) return
    const frame = requestAnimationFrame(() => {
      const heading = orderHeading.current
      heading?.focus({ preventScroll: true })
      heading?.scrollIntoView({ block: 'start' })
    })
    return () => cancelAnimationFrame(frame)
  }, [location.key, location.hash, orderAnchorReady])
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
      <section className="view profile-view profile-redesign">
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
    <section className="view profile-view profile-redesign">
      {profile.isPending ? (
        <Loading />
      ) : profile.isError ? (
        <Empty title="내 정보를 불러오지 못했습니다">
          <button onClick={() => profile.refetch()}>다시 시도</button>
        </Empty>
      ) : (
        <>
          <div className="profile-overview">
            <section className="profile-hero">
              <div>
                <p className="section-kicker">마이 주점부리</p>
                <h1>{profile.data?.user?.name || user?.name}님의 취향 기록</h1>
                <p className="profile-account-id">{user?.id}</p>
              </div>
              <button className="btn btn-outline-dark" onClick={() => {
                void profile.refetch()
                void orders.refetch()
              }}>
                새로고침
              </button>
            </section>
            <section className="grade-card" aria-label="회원 등급">
              <div className="grade-copy">
                <span className="badge gold-badge">{grade.title || '회원'}</span>
                <h2>스탬프 {stamps}개</h2>
                <p>{Number(grade.to) > 0 ? `다음 등급까지 ${grade.to}개 남았어요.` : '현재 최고 등급입니다.'}</p>
              </div>
              <div className="grade-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}
                aria-label={`등급 진행도 ${progress}%`}>
                <div><span style={{ width: `${progress}%` }} /></div>
                <small>{grade.step || 0} / {grade.stepMax || 0}</small>
              </div>
            </section>
          </div>
          <nav className="profile-shortcuts" aria-label="내 활동 바로가기">
            {[
              ['/preferences', '내 취향 설정', '추천에 쓰는 취향과 조건'],
              ['/favorites', '내 찜 목록', '다시 보고 싶은 상품'],
              ['/notebook', '내 취향 기록', '나만의 시음과 관심 메모'],
              ['/discover', '기본 주류 둘러보기', '주류 탐색 다시 시작'],
              ['/settings', '내 계정 설정', '이름과 비밀번호 관리'],
            ].map(([to, title, description]) => (
              <Link key={to} className="profile-shortcut" to={to} aria-label={title}>
                <strong>{title}</strong>
                <span>{description}</span>
                <span className="profile-shortcut-arrow" aria-hidden="true">→</span>
              </Link>
            ))}
          </nav>
        </>
      )}
      <section className="section-band profile-order-history" id="order-history">
        <div className="section-heading">
          <div>
            <h2 ref={orderHeading} tabIndex={-1}>주문 내역</h2>
          </div>
          {orders.data && <span className="muted">총 {orders.data.total}건</span>}
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
  const location = useLocation()
  const currentLocation = useRef(location.key)
  currentLocation.current = location.key
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const [mode, setMode] = useState<'login' | 'join'>('login')
  const [login, setLogin] = useState({ id: '', pass: '' })
  const [join, setJoin] = useState({ id: '', name: '', pass: '' })
  const [taste, setTaste] = useState<SignupPreferenceChoices>({ categories: [], targetAbvPercent: null })
  const [retryTaste, setRetryTaste] = useState<(SignupPreferenceChoices & { owner: string }) | null>(null)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const passwordInput = useRef<HTMLInputElement>(null)
  const [check, setCheck] = useState({ id: '', available: false, message: '' })
  const latestJoinId = useRef(join.id)
  latestJoinId.current = join.id
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const client = useQueryClient()
  const ui = useUi()
  const authenticating = Boolean(ui.pending.login || ui.pending.join)
  const redirect = search.get('redirect')
  const returning = redirect !== null && safeRedirect(redirect) !== '/profile'
  function switchMode(next: 'login' | 'join') {
    setMode(next)
    setPasswordVisible(false)
  }
  async function authenticate(event: FormEvent) {
    event.preventDefault()
    const submittedLocation = location.key
    const target = safeRedirect(search.get('redirect'))
    if (mode === 'join' && (!check.available || check.id !== join.id.trim())) {
      ui.error(new Error('아이디 중복 확인이 필요합니다.'))
      return
    }
    if (mode === 'join' && !validPassword(join.pass)) {
      ui.error(new Error('비밀번호는 4~100자·UTF-8 최대72바이트로 입력해 주세요. 공백도 비밀번호에 포함됩니다.'))
      passwordInput.current?.focus()
      return
    }
    const credentials =
      mode === 'join'
        ? { id: join.id.trim(), pass: join.pass }
        : { id: login.id.trim(), pass: login.pass }
    const choices = mode === 'join'
      ? (taste.categories.length || taste.targetAbvPercent !== null ? taste : null)
      : retryTaste?.owner === credentials.id ? retryTaste : null
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
        return api.login(credentials)
      },
      mode === 'join' ? '가입되었습니다.' : '로그인되었습니다.',
    )
    if (result.ok) {
      client.clear()
      const user: User = result.data
      const isCurrentPage = mounted.current && currentLocation.current === submittedLocation
      const review = isCurrentPage && choices && user.id === credentials.id
      if (review) {
        signupPreferenceReviews.set(user, { categories: choices.categories, targetAbvPercent: choices.targetAbvPercent, returnTo: target })
      }
      client.setQueryData(['session'], user)
      if (isCurrentPage) {
        setLogin({ id: '', pass: '' })
        setJoin({ id: '', name: '', pass: '' })
        setPasswordVisible(false)
        setRetryTaste(null)
        if (!review) navigate(target, { replace: true })
      }
    } else if (accountCreated) {
      if (mounted.current && currentLocation.current === submittedLocation) {
        switchMode('login')
        setLogin({ id: credentials.id, pass: '' })
        setJoin({ id: '', name: '', pass: '' })
        setCheck({ id: '', available: false, message: '' })
        setRetryTaste(choices ? { ...choices, owner: credentials.id } : null)
        setTaste({ categories: [], targetAbvPercent: null })
        passwordInput.current?.focus()
      }
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
    <section className="view account-layout account-redesign">
      <div className="auth-panel">
        <p className="section-kicker auth-brand">주점부리 계정</p>
        <div className="segmented" role="group" aria-label="계정 메뉴">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            aria-pressed={mode === 'login'}
            disabled={authenticating}
            onClick={() => switchMode('login')}
          >
            로그인
          </button>
          <button
            type="button"
            className={mode === 'join' ? 'active' : ''}
            aria-pressed={mode === 'join'}
            disabled={authenticating}
            onClick={() => switchMode('join')}
          >
            회원가입
          </button>
        </div>
        <form className="auth-form" onSubmit={authenticate} aria-busy={authenticating}>
          <div className="auth-form-heading">
            <h1>
              {mode === 'login'
                ? '다시 만나 반가워요'
                : '취향 기록을 시작해 보세요'}
            </h1>
            <p>{returning ? '로그인하면 하던 작업을 이어갈 수 있습니다.' : mode === 'login'
              ? '주문 내역과 저장한 취향을 이어서 확인하세요.'
              : '사용할 아이디를 확인한 뒤 회원가입을 진행하세요.'}</p>
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
          <div className="field-group">
            <label htmlFor="account-password">비밀번호</label>
            <div className="account-password-field">
            <input
              id="account-password"
              ref={passwordInput}
              type={passwordVisible ? 'text' : 'password'}
              aria-label="비밀번호"
              aria-describedby={mode === 'join' ? 'join-password-limit' : undefined}
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
            <button type="button" className="btn btn-outline-dark" aria-controls="account-password"
              onClick={() => setPasswordVisible((visible) => !visible)}>
              {passwordVisible ? '비밀번호 숨기기' : '비밀번호 보기'}
            </button>
            </div>
            {mode === 'join' && <small id="join-password-limit">4~100자·UTF-8 최대72바이트. 한글·이모지는 여러 바이트이며 공백도 그대로 포함됩니다. 현재 {new TextEncoder().encode(join.pass).byteLength}/72바이트</small>}
          </div>
          {mode === 'join' && <fieldset className="signup-taste" disabled={authenticating}>
            <legend>내 주류 취향 <small>선택 사항</small></legend>
            <p>좋아하는 주종이나 도수를 고르세요. 가입 후 확인하고 저장할 수 있어요.</p>
            <strong>주종</strong>
            <div className="signup-taste-group" role="group" aria-label="선호 주종">
              {categories.map(({ label }) => (
                <button key={label} type="button" aria-pressed={taste.categories.includes(label)} onClick={() => setTaste((current) => ({
                  ...current,
                  categories: current.categories.includes(label) ? current.categories.filter((item) => item !== label) : [...current.categories, label],
                }))}>{label}</button>
              ))}
            </div>
            <strong>도수</strong>
            <div className="signup-taste-group" role="group" aria-label="선호 도수">
              {signupAbvPresets.map((value) => (
                <button key={value} type="button" aria-pressed={taste.targetAbvPercent === value} onClick={() => setTaste((current) => ({
                  ...current, targetAbvPercent: current.targetAbvPercent === value ? null : value,
                }))}>{value}%</button>
              ))}
            </div>
          </fieldset>}
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
      <aside className="account-story" aria-labelledby="account-benefits">
        <p className="section-kicker">주점부리에서 만나는 술</p>
        <h2 id="account-benefits">발견한 취향을 한곳에 모으세요</h2>
        <ul>
          <li><strong>마음에 든 술</strong><span>찜해 두고 다음에 바로 찾아보세요.</span></li>
          <li><strong>기억하고 싶은 한 잔</strong><span>개인 취향 기록에 감상을 남기세요.</span></li>
          <li><strong>주문과 스탬프</strong><span>마이페이지에서 함께 확인하세요.</span></li>
        </ul>
      </aside>
    </section>
  )
}
