import { test as base, expect } from '@playwright/test'

const users = [{ id: 'member', name: '회원A', role: 'USER', stamps: 0 }, { id: 'other', name: '회원B', role: 'USER', stamps: 0 }, { id: 'admin', name: '관리자', role: 'ADMIN', stamps: 0 }]
const initialOrder = { oId: 901, userId: 'member', orderType: 'TAKEOUT', orderTable: '원래 요청', completed: 'N', orderTime: '2026-11-04T00:00:00Z', totalPrice: 15554, priceBasis: 'ORDER_SNAPSHOT', details: [{ id: 1, productId: 7, name: '주문 당시 상품', type: '탁주', quantity: 2, unitPrice: 7777, sumPrice: 15554 }] }
const ok = (data) => ({ data, message: 'ok', error: null })
const bad = (status) => ({ data: null, message: null, error: { code: ({ 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND' })[status] || 'SERVICE_UNAVAILABLE' } })
const pageOf = (items, page = 1, size = 10) => ({ items: items.slice((page - 1) * size, page * size), page, size,
  total: items.length, totalPages: Math.ceil(items.length / size), hasNext: page * size < items.length })
const test = base.extend({
  fixture: [async ({ page }, use) => {
    const s = { user: users[0], orders: structuredClone([initialOrder, { ...initialOrder, oId: 902, userId: 'other', orderTable: '다른 회원 요청' }]), responses: new Map(), gates: new Map(), allGates: [], meFailures: [], calls: [], unexpected: [], errors: [], logoutStatus: 200 }
    s.hold = (path, response) => { let release; const wait = new Promise((r) => { release = r }); const gate = { response, wait, release, started: false }; s.gates.set(path, gate); s.allGates.push(gate); return gate }
    s.orderReads = (id) => s.calls.filter((c) => c.path === `/orders/${id}`).length
    page.on('pageerror', (e) => s.errors.push(e.message))
    await page.route('**/api/**', async (route) => {
      if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/users/me/notifications') return route.fulfill({ status: 404, json: { data: null, error: { code: 'NOTIFICATIONS_NOT_SUPPORTED' } } })
      if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/users/me/cart') return route.fulfill({ status: 404, json: { data: null, error: { code: 'CART_NOT_SUPPORTED' } } })
      const url = new URL(route.request().url()), path = url.pathname.slice(4), method = route.request().method()
      s.calls.push({ path, method, query: Object.fromEntries(url.searchParams), body: route.request().postData() ? route.request().postDataJSON() : null, owner: route.request().headers()['x-pubburi-account-owner'] })
      if (method === 'POST' && path === '/auth/login') { const id = route.request().postDataJSON().id; s.user = users.find((u) => u.id === id); return route.fulfill({ json: ok(s.user) }) }
      if (method === 'POST' && path === '/auth/logout') { if (s.logoutStatus === 200) s.user = null; return route.fulfill({ status: s.logoutStatus, json: s.logoutStatus === 200 ? ok(true) : bad(s.logoutStatus) }) }
      let response
      if (method === 'GET' && path === '/auth/me') response = s.meFailures.length ? { status: s.meFailures.shift() } : { status: s.user ? 200 : 401, data: s.user }
      else if (method === 'GET' && /^\/orders\/\d+$/.test(path)) {
        const order = s.orders.find((o) => o.oId === Number(path.split('/').at(-1)))
        response = s.responses.get(path) ?? { status: !s.user ? 401 : !order ? 404 : s.user.role === 'ADMIN' || order.userId === s.user.id ? 200 : 403, data: order }
      } else if (method === 'GET' && /^\/users\/[^/]+\/profile$/.test(path)) response = { status: 200, data: { user: s.user, grade: { title: '씨앗', step: 0, stepMax: 10, to: 10 } } }
      else if (method === 'GET' && /^\/users\/[^/]+\/orders$/.test(path)) response = s.responses.get(path) ?? { status: 200, data: pageOf(s.orders.filter((o) => o.userId === s.user?.id), Number(url.searchParams.get('page') || 1), Number(url.searchParams.get('size') || 10)) }
      else if (method === 'GET' && path === '/admin/orders') response = { status: 200, data: pageOf(s.orders, Number(url.searchParams.get('page') || 1), Number(url.searchParams.get('size') || 20)) }
      else if (method === 'GET' && path === '/products/popular') response = { status: 200, data: [] }
      else if (method === 'GET' && path === '/markets') response = { status: 200, data: pageOf([]) }
      const gate = s.gates.get(path)
      if (gate) { response = gate.response; gate.started = true; s.gates.delete(path) }
      if (response) { response = structuredClone(response); if (gate) await gate.wait; return route.fulfill({ status: response.status, json: response.status === 200 ? ok(response.data) : bad(response.status) }) }
      s.unexpected.push({ path, method }); await route.fulfill({ status: 501, json: bad(501) })
    })
    try { await use(s) } finally { for (const gate of s.allGates) gate.release(); expect(s.errors).toEqual([]); expect(s.unexpected).toEqual([]); expect(s.calls.filter((c) => c.method !== 'GET' && !c.path.startsWith('/auth/'))).toEqual([]) }
  }, { auto: true }],
})
const view = (page) => page.locator('.order-detail-view')
const refresh = (page) => page.getByRole('button', { name: '주문 상태 새로고침', exact: true })
async function facts(page, id = 901, status = '데모 접수') { await expect(view(page)).toHaveAttribute('data-order-id', String(id)); await expect(page.locator('.order-item-line').first()).toBeVisible(); await expect(page.locator('[data-order-field="status"]')).toHaveText(status) }
async function signOut(page) { await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await expect(page.locator('.user-name')).toHaveCount(0) }
async function signIn(page, id) { await page.locator('.user-pill').getByRole('link', { name: '로그인', exact: true }).click(); await page.getByLabel('아이디', { exact: true }).fill(id); await page.getByLabel('비밀번호', { exact: true }).fill('fixture'); await page.locator('form.auth-form').getByRole('button', { name: '로그인', exact: true }).click(); await expect(page).toHaveURL('/profile') }

for (const width of [390, 1440]) test(`주문 마지막 페이지가 사라지면 남은 본인 주문을 다시 읽고 새로고침 초점을 보존 ${width}px`, async ({ page, fixture }) => {
  fixture.orders = Array.from({ length: 11 }, (_, index) => ({ ...initialOrder, oId: 901 + index }))
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/profile?from=history')
  const history = page.locator('.profile-order-history')
  await expect(history.locator('.order-row')).toHaveCount(10)
  await history.getByRole('button', { name: '다음', exact: true }).click()
  await expect(history.getByRole('link', { name: '주문 911 상세 보기', exact: true })).toBeVisible()
  fixture.orders = fixture.orders.slice(0, 10)
  let started = false, release
  const gate = new Promise((resolve) => { release = resolve })
  await page.route('**/api/users/member/orders?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('page') === '1') { started = true; await gate }
    await route.fallback()
  })
  try {
    const before = fixture.calls.length
    const reload = page.getByRole('button', { name: '새로고침', exact: true })
    await reload.press('Enter')
    await expect.poll(() => started).toBe(true)
    await expect(reload).toBeFocused()
    await expect(history.getByRole('status', { name: '주문 내역을 불러오는 중입니다.', exact: true })).toBeVisible()
    await expect(history.locator('.order-row')).toHaveCount(0)
    await expect(history.getByRole('navigation', { name: 'pagination', exact: true })).toHaveCount(0)
    await expect(history.getByText('총 11건', { exact: true })).toHaveCount(0)
    await expect(history.getByRole('heading', { name: '아직 주문 내역이 없습니다', exact: true })).toHaveCount(0)
    release()
    await expect(history.locator('.order-row')).toHaveCount(10)
    await expect(history.getByText('총 10건', { exact: true })).toBeVisible()
    await expect(history.getByRole('link', { name: '주문 911 상세 보기', exact: true })).toHaveCount(0)
    await expect(history.getByRole('link', { name: '주문 901 상세 보기', exact: true })).toBeVisible()
    await expect(reload).toBeFocused()
    expect(fixture.calls.slice(before).filter((call) => call.path === '/users/member/orders').map((call) => call.query.page)).toEqual(['2', '1'])
    await expect(page).toHaveURL('/profile?from=history')
  } finally { release() }
})

for (const status of [401, 503, 200]) test(`마지막 주문 페이지 ${status === 200 ? 'total0' : status} 응답은 다른 페이지로 숨기지 않음`, async ({ page, fixture }) => {
  fixture.orders = Array.from({ length: 11 }, (_, index) => ({ ...initialOrder, oId: 901 + index }))
  await page.goto('/profile')
  const history = page.locator('.profile-order-history')
  await history.getByRole('button', { name: '다음', exact: true }).click()
  await expect(history.getByRole('link', { name: '주문 911 상세 보기', exact: true })).toBeVisible()
  if (status === 200) fixture.orders = []
  else fixture.responses.set('/users/member/orders', { status })
  const before = fixture.calls.length
  await page.getByRole('button', { name: '새로고침', exact: true }).press('Enter')
  await expect(page.getByRole('heading', { name: status === 401 ? '다시 로그인해 주세요' : status === 503 ? '주문 내역을 불러오지 못했습니다' : '아직 주문 내역이 없습니다', exact: true })).toBeVisible()
  await expect(history.locator('.order-row')).toHaveCount(0)
  expect(fixture.calls.slice(before).filter((call) => call.path === '/users/member/orders').map((call) => call.query.page)).toEqual(['2'])
  await expect(page).toHaveURL('/profile')
})

for (const width of [1280, 390]) {
  test(`profile link/current state refresh/reload/Back and persistent keyboard at${width}`, async ({ page, fixture }) => {
    fixture.user = { ...users[0], stamps: 37 }
    await page.setViewportSize({ width, height: 900 }); await page.goto('/profile')
    await expect(page.getByRole('heading', { name: '회원A님의 취향 기록', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: '내 취향 설정', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: '내 찜 목록', exact: true })).toBeVisible()
    await expect(page.getByRole('progressbar', { name: /등급 진행도/ })).toHaveCount(0)
    await expect(page.getByRole('main')).not.toContainText(/스탬프|씨앗|다음 등급/)
    const link = page.getByRole('link', { name: '주문 901 상세 보기', exact: true }); await link.focus(); await link.press('Enter'); await facts(page)
    await expect(view(page)).toContainText('실제 결제·배송·예약 없이 접수한 시연 주문입니다.')
    await expect(view(page)).toContainText('단가 7,777원'); await expect(page.locator('.order-detail-total')).toHaveText('15,554원')
    fixture.orders[0].completed = 'Y'
    const gate = fixture.hold('/orders/901', { status: 200, data: fixture.orders[0] })
    await refresh(page).focus(); await refresh(page).press('Enter'); await expect.poll(() => gate.started).toBe(true)
    await expect(page.locator('.order-item-line')).toHaveCount(0); await expect(refresh(page)).toBeFocused(); await expect(refresh(page)).toHaveAttribute('aria-disabled', 'true')
    const count = fixture.orderReads(901); await refresh(page).press('Enter'); expect(fixture.orderReads(901)).toBe(count)
    gate.release(); await facts(page, 901, '데모 처리 완료'); await expect(refresh(page)).toBeFocused()
    await page.getByRole('link', { name: '내 주문 내역', exact: true }).click()
    await expect(page).toHaveURL('/profile#order-history')
    await expect(page.getByRole('heading', { name: '주문 내역', exact: true })).toBeFocused()
    await expect(link).toBeVisible()
    await page.goBack(); await facts(page, 901, '데모 처리 완료')
    await page.reload(); await facts(page, 901, '데모 처리 완료')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  })
  test(`full100name/request20 and snapshot0/unknown amount fit${width}`, async ({ page, fixture }, info) => {
    const name = 'N'.repeat(100); fixture.orders[0] = { ...initialOrder, orderTable: 'R'.repeat(20), totalPrice: 0, details: [{ ...initialOrder.details[0], name, quantity: 99, unitPrice: 0, sumPrice: 0, productId: null }] }
    await page.setViewportSize({ width, height: 900 }); await page.goto('/orders/901'); await facts(page)
    await expect(page.locator('.order-detail-total')).toHaveText('0원'); await expect(view(page)).toContainText('삭제된 상품'); await expect(view(page)).toContainText('단가 0원'); await expect(view(page)).toContainText('주문 당시 금액')
    const geometry = await page.locator('.order-item-line > span').evaluate((node) => { const range = document.createRange(); range.selectNodeContents(node); return { text: node.textContent, width: document.documentElement.scrollWidth, fragments: [...range.getClientRects()].map((r) => ({ left: r.left, right: r.right })) } })
    await info.attach('order-name-geometry.json', { body: JSON.stringify(geometry), contentType: 'application/json' }); expect(geometry.text).toContain(name); expect(geometry.width).toBeLessThanOrEqual(width); expect(geometry.fragments.every((r) => r.left >= 0 && r.right <= width)).toBe(true)
    fixture.orders[0] = { ...fixture.orders[0], totalPrice: null, priceBasis: 'LEGACY_ESTIMATE', completed: '?', details: [{ ...fixture.orders[0].details[0], unitPrice: null, sumPrice: null }] }
    await refresh(page).click(); await facts(page, 901, '상태 미확인'); await expect(page.locator('.order-detail-total')).toHaveText('금액 미확인'); await expect(view(page)).toContainText('단가 금액 미확인'); await expect(view(page)).toContainText('과거 주문 추정 금액')
    expect(fixture.calls.filter((c) => c.path.startsWith('/products'))).toEqual([])
  })
}

for (const width of [390, 1440]) test(`invalid IDs never request order details;guest login preserves path/query/anchor at${width}`, async ({ page, fixture }) => {
  await page.setViewportSize({ width, height: 900 })
  fixture.user = null
  for (const id of ['0', '01', '-1', '+1', '1e0', '2147483648', '1/2']) { await page.goto(`/orders/${id}`); await expect(page.getByRole('heading', { name: id === '1/2' ? '페이지를 찾을 수 없습니다' : '주문 번호를 확인해 주세요', exact: true })).toBeVisible() }
  expect(fixture.calls.filter((c) => /^\/orders\//.test(c.path))).toEqual([])
  const target = '/orders/901?from=demo#main-content'
  await page.goto(target)
  await expect(page.getByRole('heading', { name: '다시 만나 반가워요', exact: true })).toBeVisible()
  expect(new URL(page.url()).searchParams.get('redirect')).toBe(target)
  await page.getByLabel('아이디', { exact: true }).fill('member')
  await page.getByLabel('비밀번호', { exact: true }).fill('fixture')
  await page.locator('form.auth-form').getByRole('button', { name: '로그인', exact: true }).press('Enter')
  await expect(page).toHaveURL(target)
  await facts(page)
  await expect(page.locator('.order-detail-total')).toHaveText('15,554원')
  await expect(page.getByRole('main')).toBeFocused()
  await expect(page.getByRole('heading', { name: '데모 주문 상세', exact: true })).toBeInViewport()
  for (let step = 0; step < 5; step++) {
    await page.keyboard.press('Tab')
    if (await refresh(page).evaluate((element) => element === document.activeElement)) break
  }
  await expect(refresh(page)).toBeFocused()
  expect(fixture.calls.filter((c) => c.method !== 'GET').map((c) => c.path)).toEqual(['/auth/login'])
})
test('admin list link and deleted-account order use fresh ADMIN authority', async ({ page, fixture }) => {
  fixture.user = users[2]; fixture.orders[0].userId = null
  await page.goto('/admin?tab=orders'); await page.getByRole('link', { name: '주문 901 상세 보기', exact: true }).click(); await facts(page)
  await expect(view(page)).toContainText('탈퇴한 회원'); await expect(page.getByRole('link', { name: '관리자 주문 목록', exact: true })).toHaveAttribute('href', '/admin?tab=orders')
  await expect(view(page)).toContainText('포장 주문')
  await page.getByRole('link', { name: '관리자 주문 목록', exact: true }).press('Enter')
  await expect(page).toHaveURL('/admin?tab=orders')
  await expect(page.getByRole('link', { name: '주문 901 상세 보기', exact: true })).toBeVisible()
  await page.goBack(); await facts(page)
  fixture.user = { ...users[2], role: 'USER' }; await refresh(page).click(); await expect(page.getByRole('heading', { name: '주문을 볼 권한이 없습니다', exact: true })).toBeVisible(); await expect(page.locator('.order-item-line')).toHaveCount(0)
})
for (const status of [403, 404, 503]) test(`current${status} hides old facts and retries explicitly without auth/logout writes`, async ({ page, fixture }) => {
  await page.goto('/orders/901'); await facts(page); fixture.responses.set('/orders/901', { status })
  await refresh(page).click(); await expect(page.getByRole('heading', { name: status === 403 ? '주문을 볼 권한이 없습니다' : status === 404 ? '주문을 찾을 수 없습니다' : '주문을 불러오지 못했습니다', exact: true })).toBeVisible(); await expect(page.locator('.order-item-line')).toHaveCount(0)
  const count = fixture.orderReads(901); await page.evaluate(() => { dispatchEvent(new Event('offline')); dispatchEvent(new Event('online')) }); expect(fixture.orderReads(901)).toBe(count)
  fixture.responses.delete('/orders/901'); await refresh(page).click(); await facts(page); expect(fixture.calls.filter((c) => c.method !== 'GET')).toEqual([])
})
for (const width of [390, 1440]) test(`current session401 hides cached order and explicit login preserves query/anchor at${width}`, async ({ page, fixture }) => {
  await page.setViewportSize({ width, height: 900 })
  const target = '/orders/901?from=demo#main-content'
  await page.goto(target); await facts(page); fixture.user = null
  await refresh(page).click(); await expect(page.getByRole('heading', { name: '다시 로그인해 주세요', exact: true })).toBeVisible(); await expect(page.locator('.order-item-line')).toHaveCount(0)
  await page.getByRole('button', { name: '다시 로그인', exact: true }).press('Enter')
  expect(new URL(page.url()).searchParams.get('redirect')).toBe(target)
  await page.getByLabel('아이디', { exact: true }).fill('member')
  await page.getByLabel('비밀번호', { exact: true }).fill('fixture')
  await page.locator('form.auth-form').getByRole('button', { name: '로그인', exact: true }).press('Enter')
  await expect(page).toHaveURL(target)
  await facts(page)
  await expect(page.locator('.order-detail-total')).toHaveText('15,554원')
  await expect(page.getByRole('main')).toBeFocused()
  await expect(page.getByRole('heading', { name: '데모 주문 상세', exact: true })).toBeInViewport()
  for (let step = 0; step < 5; step++) {
    await page.keyboard.press('Tab')
    if (await refresh(page).evaluate((element) => element === document.activeElement)) break
  }
  await expect(refresh(page)).toBeFocused()
  expect(fixture.calls.filter((c) => c.method !== 'GET').map((c) => c.path)).toEqual(['/auth/login'])
})
test('bootstrap503 blocks all order reads and recovers without treating it as guest', async ({ page, fixture }) => {
  fixture.meFailures.push(503); await page.goto('/orders/901'); await expect(page.getByRole('heading', { name: '로그인 상태를 확인하지 못했습니다', exact: true })).toBeVisible(); expect(fixture.orderReads(901)).toBe(0)
  await page.getByRole('button', { name: '로그인 상태 다시 확인', exact: true }).click(); await facts(page)
})
test('wrong responseID or owner200 never renders private order lines', async ({ page, fixture }) => {
  fixture.responses.set('/orders/901', { status: 200, data: { ...initialOrder, oId: 902 } }); await page.goto('/orders/901'); await expect(page.getByRole('heading', { name: '주문을 불러오지 못했습니다', exact: true })).toBeVisible(); await expect(page.locator('.order-item-line')).toHaveCount(0)
  fixture.responses.set('/orders/901', { status: 200, data: { ...initialOrder, userId: 'other' } }); await refresh(page).click(); await expect(page.getByRole('heading', { name: '주문을 볼 권한이 없습니다', exact: true })).toBeVisible(); await expect(page.locator('.order-item-line')).toHaveCount(0)
})
for (const status of [200, 401]) test(`late oldaccount${status} cannot replace another account or sameID ABA`, async ({ page, fixture }) => {
  const gate = fixture.hold('/orders/901', { status, data: initialOrder }); await page.goto('/orders/901'); await expect.poll(() => gate.started).toBe(true)
  await signOut(page); await signIn(page, 'other'); await page.getByRole('link', { name: '주문 902 상세 보기', exact: true }).click(); await facts(page, 902)
  await signOut(page); fixture.orders[0].details[0].name = '현재 재조회 상품'; await signIn(page, 'member'); await page.getByRole('link', { name: '주문 901 상세 보기', exact: true }).click(); await facts(page); await expect(view(page)).toContainText('현재 재조회 상품')
  const settled = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/orders/901'); gate.release(); await (await settled).finished(); await expect(view(page)).toContainText('현재 재조회 상품'); await expect(page).toHaveURL('/orders/901'); expect(fixture.orderReads(901)).toBe(2)
})
test('uncertain logout cannot remount a private view from stale session or prewrite in-flight read', async ({ page, fixture }) => {
  const old = fixture.hold('/orders/901', { status: 200, data: initialOrder }); await page.goto('/orders/901'); await expect.poll(() => old.started).toBe(true)
  fixture.logoutStatus = 503
  const verified = fixture.hold('/auth/me', { status: 401 })
  await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await expect.poll(() => verified.started).toBe(true)
  old.release(); await expect(page.locator('.order-item-line')).toHaveCount(0)
  verified.release(); await expect(page.getByRole('heading', { name: '다시 로그인해 주세요', exact: true })).toBeVisible(); expect(fixture.orderReads(901)).toBe(1)
})
test('cached route reentry offline hides old facts and checks current permission after reconnect', async ({ page, fixture }) => {
  await page.goto('/orders/901'); await facts(page); await page.getByRole('link', { name: '내 주문 내역', exact: true }).click()
  const link = page.getByRole('link', { name: '주문 901 상세 보기', exact: true }); await expect(link).toBeVisible(); await page.context().setOffline(true); await link.click()
  await expect(page.getByRole('heading', { name: '연결 후 주문을 확인해 주세요', exact: true })).toBeVisible(); await expect(page.locator('.order-item-line')).toHaveCount(0)
  fixture.responses.set('/orders/901', { status: 403 }); await page.context().setOffline(false); await expect(page.getByRole('heading', { name: '주문을 볼 권한이 없습니다', exact: true })).toBeVisible(); await expect(page.locator('.order-item-line')).toHaveCount(0)
})
test('storage denial does not block current detail and no order/customer snapshot is persisted', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('denied') } }))
  await page.goto('/orders/901'); await facts(page); await refresh(page).click(); await facts(page)
  await expect(page.getByText('장바구니 보관 제한', { exact: true })).toBeVisible()
})


// Authored consumer fixtures; model quality and real PG acceptance are separate.
