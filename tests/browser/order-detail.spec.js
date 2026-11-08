import { test as base, expect } from '@playwright/test'

const users = [{ id: 'member', name: '회원A', role: 'USER', stamps: 0 }, { id: 'other', name: '회원B', role: 'USER', stamps: 0 }, { id: 'admin', name: '관리자', role: 'ADMIN', stamps: 0 }]
const initialOrder = { oId: 901, userId: 'member', orderType: 'TAKEOUT', orderTable: '원래 요청', completed: 'N', orderTime: '2026-11-04T00:00:00Z', totalPrice: 15554, priceBasis: 'ORDER_SNAPSHOT', details: [{ id: 1, productId: 7, name: '주문 당시 상품', type: '탁주', quantity: 2, unitPrice: 7777, sumPrice: 15554 }] }
const ok = (data) => ({ data, message: 'ok', error: null })
const bad = (status) => ({ data: null, message: null, error: { code: ({ 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND' })[status] || 'SERVICE_UNAVAILABLE' } })
const pageOf = (items) => ({ items, page: 1, size: 10, total: items.length, totalPages: items.length ? 1 : 0, hasNext: false })
const test = base.extend({
  fixture: [async ({ page }, use) => {
    const s = { user: users[0], orders: structuredClone([initialOrder, { ...initialOrder, oId: 902, userId: 'other', orderTable: '다른 회원 요청' }]), responses: new Map(), gates: new Map(), allGates: [], meFailures: [], calls: [], unexpected: [], errors: [], logoutStatus: 200 }
    s.hold = (path, response) => { let release; const wait = new Promise((r) => { release = r }); const gate = { response, wait, release, started: false }; s.gates.set(path, gate); s.allGates.push(gate); return gate }
    s.orderReads = (id) => s.calls.filter((c) => c.path === `/orders/${id}`).length
    page.on('pageerror', (e) => s.errors.push(e.message))
    await page.route('**/api/**', async (route) => {
      if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/users/me/cart') return route.fulfill({ status: 404, json: { data: null, error: { code: 'CART_NOT_SUPPORTED' } } })
      const path = new URL(route.request().url()).pathname.slice(4), method = route.request().method()
      s.calls.push({ path, method })
      if (method === 'POST' && path === '/auth/login') { const id = route.request().postDataJSON().id; s.user = users.find((u) => u.id === id); return route.fulfill({ json: ok(s.user) }) }
      if (method === 'POST' && path === '/auth/logout') { if (s.logoutStatus === 200) s.user = null; return route.fulfill({ status: s.logoutStatus, json: s.logoutStatus === 200 ? ok(true) : bad(s.logoutStatus) }) }
      let response
      if (method === 'GET' && path === '/auth/me') response = s.meFailures.length ? { status: s.meFailures.shift() } : { status: s.user ? 200 : 401, data: s.user }
      else if (method === 'GET' && /^\/orders\/\d+$/.test(path)) {
        const order = s.orders.find((o) => o.oId === Number(path.split('/').at(-1)))
        response = s.responses.get(path) ?? { status: !s.user ? 401 : !order ? 404 : s.user.role === 'ADMIN' || order.userId === s.user.id ? 200 : 403, data: order }
      } else if (method === 'GET' && /^\/users\/[^/]+\/profile$/.test(path)) response = { status: 200, data: { user: s.user, grade: { title: '씨앗', step: 0, stepMax: 10, to: 10 } } }
      else if (method === 'GET' && /^\/users\/[^/]+\/orders$/.test(path)) response = { status: 200, data: pageOf(s.orders.filter((o) => o.userId === s.user?.id)) }
      else if (method === 'GET' && path === '/admin/orders') response = { status: 200, data: pageOf(s.orders) }
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
async function facts(page, id = 901, status = '데모 접수') { await expect(view(page)).toHaveAttribute('data-order-id', String(id)); await expect(page.locator('.order-item-line')).toBeVisible(); await expect(page.locator('[data-order-field="status"]')).toHaveText(status) }
async function signOut(page) { await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await expect(page.locator('.user-name')).toHaveCount(0) }
async function signIn(page, id) { await page.locator('.user-pill').getByRole('link', { name: '로그인', exact: true }).click(); await page.getByLabel('아이디', { exact: true }).fill(id); await page.getByLabel('비밀번호', { exact: true }).fill('fixture'); await page.locator('form.auth-form').getByRole('button', { name: '로그인', exact: true }).click(); await expect(page).toHaveURL('/profile') }

for (const width of [1280, 390]) {
  test(`profile link/current state refresh/reload/Back and persistent keyboard at${width}`, async ({ page, fixture }) => {
    await page.setViewportSize({ width, height: 900 }); await page.goto('/profile')
    const link = page.getByRole('link', { name: '주문 901 상세 보기', exact: true }); await link.focus(); await link.press('Enter'); await facts(page)
    await expect(view(page)).toContainText('실제 결제·배송·예약 없이 접수한 시연 주문입니다.')
    await expect(view(page)).toContainText('단가 7,777원'); await expect(page.locator('.order-detail-total')).toHaveText('15,554원')
    fixture.orders[0].completed = 'Y'
    const gate = fixture.hold('/orders/901', { status: 200, data: fixture.orders[0] })
    await refresh(page).focus(); await refresh(page).press('Enter'); await expect.poll(() => gate.started).toBe(true)
    await expect(page.locator('.order-item-line')).toHaveCount(0); await expect(refresh(page)).toBeFocused(); await expect(refresh(page)).toHaveAttribute('aria-disabled', 'true')
    const count = fixture.orderReads(901); await refresh(page).press('Enter'); expect(fixture.orderReads(901)).toBe(count)
    gate.release(); await facts(page, 901, '데모 처리 완료'); await expect(refresh(page)).toBeFocused()
    await page.getByRole('link', { name: '내 주문 내역', exact: true }).click(); await expect(link).toBeVisible(); await page.goBack(); await facts(page, 901, '데모 처리 완료')
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

test('invalid IDs never request order details;guest valid link preserves path/query', async ({ page, fixture }) => {
  fixture.user = null
  for (const id of ['0', '01', '-1', '+1', '1e0', '2147483648', '1/2']) { await page.goto(`/orders/${id}`); await expect(page.getByRole('heading', { name: id === '1/2' ? '페이지를 찾을 수 없습니다' : '주문 번호를 확인해 주세요', exact: true })).toBeVisible() }
  expect(fixture.calls.filter((c) => /^\/orders\//.test(c.path))).toEqual([])
  await page.goto('/orders/901?from=demo'); await expect(page.getByRole('heading', { name: '다시 만나 반가워요', exact: true })).toBeVisible(); expect(new URL(page.url()).searchParams.get('redirect')).toBe('/orders/901?from=demo')
})
test('admin list link and deleted-account order use fresh ADMIN authority', async ({ page, fixture }) => {
  fixture.user = users[2]; fixture.orders[0].userId = null
  await page.goto('/admin?tab=orders'); await page.getByRole('link', { name: '주문 901 상세 보기', exact: true }).click(); await facts(page)
  await expect(view(page)).toContainText('탈퇴한 회원'); await expect(page.getByRole('link', { name: '관리자 주문 목록', exact: true })).toHaveAttribute('href', '/admin?tab=orders')
  fixture.user = { ...users[2], role: 'USER' }; await refresh(page).click(); await expect(page.getByRole('heading', { name: '주문을 볼 권한이 없습니다', exact: true })).toBeVisible(); await expect(page.locator('.order-item-line')).toHaveCount(0)
})
for (const status of [403, 404, 503]) test(`current${status} hides old facts and retries explicitly without auth/logout writes`, async ({ page, fixture }) => {
  await page.goto('/orders/901'); await facts(page); fixture.responses.set('/orders/901', { status })
  await refresh(page).click(); await expect(page.getByRole('heading', { name: status === 403 ? '주문을 볼 권한이 없습니다' : status === 404 ? '주문을 찾을 수 없습니다' : '주문을 불러오지 못했습니다', exact: true })).toBeVisible(); await expect(page.locator('.order-item-line')).toHaveCount(0)
  const count = fixture.orderReads(901); await page.evaluate(() => { dispatchEvent(new Event('offline')); dispatchEvent(new Event('online')) }); expect(fixture.orderReads(901)).toBe(count)
  fixture.responses.delete('/orders/901'); await refresh(page).click(); await facts(page); expect(fixture.calls.filter((c) => c.method !== 'GET')).toEqual([])
})
test('current session401 hides cached order and explicit login returns to original query', async ({ page, fixture }) => {
  await page.goto('/orders/901?from=demo'); await facts(page); fixture.user = null
  await refresh(page).click(); await expect(page.getByRole('heading', { name: '다시 로그인해 주세요', exact: true })).toBeVisible(); await expect(page.locator('.order-item-line')).toHaveCount(0)
  await page.getByRole('button', { name: '다시 로그인', exact: true }).click(); expect(new URL(page.url()).searchParams.get('redirect')).toBe('/orders/901?from=demo')
  await page.getByLabel('아이디', { exact: true }).fill('member'); await page.getByLabel('비밀번호', { exact: true }).fill('fixture'); await page.locator('form.auth-form').getByRole('button', { name: '로그인', exact: true }).click(); await facts(page)
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
