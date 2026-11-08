import { expect, test as base } from '@playwright/test'

// Consumer fixtures only. Real PG/JPA cart acceptance runs separately with the coordinator.
const product = (id = 7) => ({ id, name: `카트 표본 ${id}`, type: '탁주', price: id === 7 ? 0 : 5000, abv: 6, img: null, orderCount: 0 })
const user = (id = 'member') => ({ id, name: id === 'member' ? '카트 회원' : '다른 회원', role: 'USER', stamps: 0 })
const row = (id = 7, quantity = 1) => ({ productId: id, productName: product(id).name, currentProduct: product(id), quantity })
const ok = (data) => ({ data, error: null }), bad = (code) => ({ data: null, error: { code } })
const emptyPage = (items = []) => ({ items, total: items.length, totalPages: items.length ? 1 : 0, page: 1, size: 12, hasNext: false })
const intentOf = (kind, body) => JSON.stringify({ kind: kind.toLowerCase(), items: body.items, orderType: kind.toLowerCase() === 'merge' ? null : body.orderType, orderTable: kind.toLowerCase() === 'merge' ? null : body.orderTable })
const test = base.extend({ cartApi: [async ({ page }, use) => {
  const s = { user: user(), carts: { member: { version: 0, items: [] }, other: { version: 0, items: [] } }, receipts: new Map(), orders: [], calls: [], errors: [], unexpected: [], readStatus: 0, writeStatus: 0, afterApply401: null, keepUserAfter401: false, lost: null, hold: null, products: [product(7), product(8)] }
  page.on('pageerror', (e) => s.errors.push(e.message))
  await page.route('**/api/**', async (route) => {
    if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/users/me/notifications') return route.fulfill({ status: 404, json: { data: null, error: { code: 'NOTIFICATIONS_NOT_SUPPORTED' } } })
    const r = route.request(), url = new URL(r.url()), path = url.pathname, method = r.method(), body = r.postData() ? r.postDataJSON() : null
    const owner = r.headers()['x-pubburi-account-owner']; s.calls.push({ path, method, body, owner, query: Object.fromEntries(url.searchParams) })
    const reply = (value, status = 200, code = 'REQUEST_FAILED') => route.fulfill({ status, json: status < 400 ? ok(structuredClone(value)) : bad(code) })
    if (path === '/api/auth/me') return reply(s.user, s.user ? 200 : 401, 'UNAUTHORIZED')
    if (path === '/api/auth/logout') { s.user = null; return reply(true) }
    if (path === '/api/auth/login') { s.user = user(body.id); return reply(s.user) }
    if (path.startsWith('/api/users/me/cart')) {
      if (!s.user || owner !== encodeURIComponent(s.user.id)) return reply(null, 401, 'UNAUTHORIZED')
      const id = s.user.id, cart = s.carts[id] ??= { version: 0, items: [] }
      const resolution = path.match(/^\/api\/users\/me\/cart\/operations\/([^/]+)\/resolve$/)
      if (resolution && method === 'POST') {
        const operationId = resolution[1], key = `${id}:${operationId}`, existing = s.receipts.get(key), intent = intentOf(body.kind, body)
        if (existing && existing.intent !== intent) return reply(null, 409)
        if (!existing) { s.receipts.set(key, { intent, status: 'RETIRED', orderId: null }); cart.version++ }
        const receipt = s.receipts.get(key)
        if (s.lost === 'resolve') { s.lost = null; return route.abort('failed') }
        return reply({ operationId, replayed: !!existing, status: receipt.status, cart, orderId: receipt.orderId })
      }
      if (path.startsWith('/api/users/me/cart/operations/') && method === 'GET') {
        const operationId = path.split('/').at(-1), receipt = s.receipts.get(`${id}:${operationId}`)
        if (s.readStatus) return reply(null, s.readStatus)
        return receipt ? reply({ operationId, replayed: true, status: receipt.status, cart, orderId: receipt.orderId }) : reply(null, 404)
      }
      if (method === 'GET') return reply(cart, s.readStatus || 200)
      if (s.writeStatus) return reply(null, s.writeStatus)
      const kind = path.split('/').at(-1), receiptKey = `${id}:${body?.operationId}`
      const intent = body && intentOf(kind, body)
      if (['merge', 'checkout'].includes(kind) && s.receipts.has(receiptKey)) {
        const receipt = s.receipts.get(receiptKey)
        if (receipt.intent !== intent) return reply(null, 409)
        if (receipt.status === 'RETIRED') return reply(null, 409, 'CART_OPERATION_RETIRED')
        return reply({ operationId: body.operationId, replayed: true, status: receipt.status, cart, orderId: receipt.orderId })
      }
      const revision = method === 'DELETE' ? Number(url.searchParams.get('expectedVersion')) : body.expectedVersion
      if (revision !== cart.version) return reply(null, 409)
      let orderId = null
      if (kind === 'merge' || kind === 'checkout') {
        const next = structuredClone(cart.items)
        for (const item of body.items) {
          const current = next.find((line) => line.productId === item.productId)
          const actual = s.products.find((p) => p.id === item.productId)
          if (!actual || kind === 'merge' && (current?.quantity ?? 0) + item.quantity > 99 || kind === 'checkout' && (!current || current.quantity < item.quantity)) return reply(null, 409)
          if (kind === 'merge') { if (current) current.quantity += item.quantity; else next.push(row(item.productId, item.quantity)) }
          else current.quantity -= item.quantity
        }
        if (next.filter((item) => item.quantity).length > 100) return reply(null, 409)
        if (kind === 'checkout') {
          orderId = s.orders.length + 90
          s.orders.push({ oId: orderId, userId: id, orderType: body.orderType, orderTable: body.orderTable, orderTime: '2026-11-08T00:00:00', completed: 'N', priceBasis: 'SNAPSHOT', totalPrice: body.items.reduce((sum, item) => sum + product(item.productId).price * item.quantity, 0), details: body.items.map((item, index) => ({ id: index, productId: item.productId, name: product(item.productId).name, quantity: item.quantity, unitPrice: product(item.productId).price, sumPrice: product(item.productId).price * item.quantity, priceBasis: 'SNAPSHOT' })) })
        }
        cart.items = next.filter((item) => item.quantity); cart.version++
        s.receipts.set(receiptKey, { intent, status: 'APPLIED', orderId })
        if (s.afterApply401 === kind) { s.afterApply401 = null; if (!s.keepUserAfter401) s.user = null; return reply(null, 401, 'UNAUTHORIZED') }
        if (s.lost === kind) { s.lost = null; return route.abort('failed') }
        if (s.hold) await s.hold.promise
        return reply({ operationId: body.operationId, replayed: false, status: 'APPLIED', cart, orderId })
      }
      const productId = Number(path.split('/').at(-1))
      if (method === 'PUT') {
        let current = cart.items.find((item) => item.productId === productId)
        if (current) current.quantity = body.quantity; else cart.items.push(row(productId, body.quantity))
      } else cart.items = path.endsWith('/cart') ? [] : cart.items.filter((item) => item.productId !== productId)
      cart.version++; return reply(cart)
    }
    if (path === '/api/products') return reply(emptyPage(s.products))
    if (path === '/api/products/popular') return reply(s.products)
    if (path === '/api/markets') return reply(emptyPage())
    if (/^\/api\/products\/\d+$/.test(path)) return reply(s.products.find((p) => p.id === Number(path.split('/').at(-1))))
    if (path.endsWith('/features')) return reply({ productId: Number(path.split('/').at(-2)), volumeMl: null, description: null, tasteTags: null, aromaTags: null, sourceName: null, sourceUrl: null, sourceNote: null })
    if (path.endsWith('/comments')) return reply(emptyPage())
    if (path.endsWith('/similar')) return reply({ items: [] })
    if (path.startsWith('/api/users/me/favorites/')) return reply({ productId: Number(path.split('/').at(-1)), favorited: false })
    if (/^\/api\/orders\/\d+$/.test(path)) return reply(s.orders.find((order) => order.oId === Number(path.split('/').at(-1))))
    if (/^\/api\/users\/[^/]+\/profile$/.test(path)) return reply({ user: s.user, grade: {} })
    if (/^\/api\/users\/[^/]+\/orders$/.test(path)) return reply(emptyPage(s.orders.filter((order) => order.userId === s.user?.id)))
    s.unexpected.push(`${method} ${path}`); return reply(null, 503)
  })
  await use(s); s.hold?.release(); expect(s.errors).toEqual([]); expect(s.unexpected).toEqual([])
}, { auto: true }] })
const own = (page) => page.getByRole('region', { name: '내 계정 장바구니', exact: true })
const guest = (page) => page.getByRole('region', { name: '이 기기에 담은 상품', exact: true })
async function localCart(page, quantity = 2) { await page.addInitScript(({ p, quantity }) => localStorage.setItem('pubburi-cart', JSON.stringify([{ product: p, quantity }])), { p: product(7), quantity }) }
async function nav(page, name) { const link = name === '로그인' ? page.getByRole('link', { name, exact: true }) : page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name }); const menu = page.getByRole('button', { name: '메뉴 열기', exact: true }); if (!await link.isVisible() && await menu.isVisible()) await menu.click(); await link.click() }
function gate() { let release; const promise = new Promise((resolve) => { release = resolve }); return { promise, release } }
async function signIn(page, id) { await nav(page, '로그인'); await page.getByLabel('아이디', { exact: true }).fill(id); await page.getByLabel('비밀번호', { exact: true }).fill('fixture'); await page.locator('.auth-form').getByRole('button', { name: '로그인', exact: true }).click(); await expect(page.locator('.user-name')).toHaveText(`${user(id).name}님`) }
const badge = (page) => page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: /장바구니/ }).locator('.cart-count')

for (const path of ['/', '/products']) test(`헤더 수량 ${path} cold/reload는 저장된수량을 카트 방문없이 표시`, async ({ page, cartApi: s }, info) => {
  s.carts.member = { version: 3, items: [row(7, 4)] }; await page.goto(path); await expect(page.locator('.user-name')).toBeVisible()
  await expect(badge(page)).toHaveText('4')
  await info.attach('cold-header-count.json', { body: JSON.stringify({ path, serverQuantity: 4, visibleBadges: await badge(page).count(), cartReads: s.calls.filter((call) => call.path === '/api/users/me/cart').length }), contentType: 'application/json' })
  expect(s.calls.filter((call) => call.path === '/api/users/me/cart')).toHaveLength(1)
  s.carts.member = { version: 4, items: [row(7, 6)] }; await page.reload(); await expect(badge(page)).toHaveText('6')
  expect(s.calls.filter((call) => call.path === '/api/users/me/cart')).toHaveLength(2)
  expect(s.calls.filter((call) => call.path === '/api/users/me/cart').every((call) => call.owner === 'member')).toBe(true)
})
for (const path of ['/', '/products']) test(`헤더 수량 ${path} cold 로그인 직후에도 계정 카트를 읽음`, async ({ page, cartApi: s }) => {
  s.user = null; s.carts.member = { version: 3, items: [row(7, 4)] }; await page.goto('/account?' + new URLSearchParams({ redirect: path }))
  expect(s.calls.filter((call) => call.path === '/api/users/me/cart')).toHaveLength(0)
  await page.getByLabel('아이디', { exact: true }).fill('member'); await page.getByLabel('비밀번호', { exact: true }).fill('fixture'); await page.locator('.auth-form').getByRole('button', { name: '로그인', exact: true }).click()
  await expect(page).toHaveURL(path); await expect(badge(page)).toHaveText('4')
  expect(s.calls.filter((call) => call.path.startsWith('/api/users/me/cart') && call.method !== 'GET')).toEqual([])
})
test('헤더 수량은 초기 인증 권위 확인 전에는 조회하거나 표시하지 않음', async ({ page, cartApi: s }) => {
  s.carts.member = { version: 3, items: [row(7, 4)] }; const g = gate(); let started = false
  await page.route('**/api/auth/me', async (route) => { started = true; await g.promise; await route.fallback() })
  try {
    await page.goto('/'); await expect.poll(() => started).toBe(true); await expect(badge(page)).toHaveCount(0); expect(s.calls.filter((call) => call.path === '/api/users/me/cart')).toHaveLength(0)
    g.release(); await expect(badge(page)).toHaveText('4')
  } finally { g.release() }
})
for (const path of ['/', '/products']) for (const status of [401, 503]) test(`헤더 수량 ${path} cartGET${status}는 개인수를 표시하거나 기기로 대체하지 않음`, async ({ page, cartApi: s }) => {
  s.carts.member = { version: 3, items: [row(7, 4)] }; s.readStatus = status
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/users/me/cart')
  await page.goto(path); expect((await response).status()).toBe(status); await expect(badge(page)).toHaveCount(0)
  expect(s.calls.filter((call) => call.path.startsWith('/api/users/me/cart') && call.method !== 'GET')).toEqual([])
  expect(await page.evaluate(() => localStorage.getItem('pubburi-cart'))).toBeNull()
})
test('헤더 수량은 A→B 로그인 전환 중 A 수를 차폐하고 B 결과만 표시', async ({ page, cartApi: s }) => {
  s.carts.member = { version: 3, items: [row(7, 4)] }; s.carts.other = { version: 1, items: [row(8, 2)] }; await page.goto('/'); await expect(badge(page)).toHaveText('4')
  const logout = gate(), next = gate(); let started = false
  await page.route('**/api/auth/logout', async (route) => { started = true; await logout.promise; await route.fallback() })
  await page.route('**/api/users/me/cart', async (route) => { if (route.request().headers()['x-pubburi-account-owner'] === 'other') await next.promise; await route.fallback() })
  try {
    await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await expect.poll(() => started).toBe(true); await expect(badge(page)).toHaveCount(0)
    logout.release(); await signIn(page, 'other'); await expect(badge(page)).toHaveCount(0); next.release(); await expect(badge(page)).toHaveText('2')
  } finally { logout.release(); next.release() }
})
for (const status of [200, 401]) test(`헤더의 이전 A cartGET${status}는 현재 B 수량을 덮지 않음`, async ({ page, cartApi: s }) => {
  s.carts.member = { version: 3, items: [row(7, 4)] }; s.carts.other = { version: 1, items: [row(8, 2)] }; const g = gate(); let started = false
  await page.route('**/api/users/me/cart', async (route) => {
    if (route.request().headers()['x-pubburi-account-owner'] !== 'member') return route.fallback()
    started = true; await g.promise; await route.fulfill({ status, json: status === 200 ? ok({ version: 3, items: [row(7, 4)] }) : bad('UNAUTHORIZED') })
  })
  try {
    await page.goto('/'); await expect.poll(() => started).toBe(true); await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await signIn(page, 'other'); await expect(badge(page)).toHaveText('2')
    const settled = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/users/me/cart' && r.request().headers()['x-pubburi-account-owner'] === 'member')
    g.release(); await (await settled).finished(); await expect(badge(page)).toHaveText('2'); await expect(page.getByText('로그인 상태가 바뀌어 계정 장바구니를 표시하지 않았습니다.', { exact: true })).toHaveCount(0)
  } finally { g.release() }
})

for (const width of [1280, 390]) test(`F10 ${width}px 명시 병합·현재0원·수량키보드·데모주문과 계정격리`, async ({ page, cartApi: s }) => {
  await page.setViewportSize({ width, height: 900 }); await localCart(page)
  s.carts.member = { version: 1, items: [row(7, 1)] }
  await page.goto('/cart'); await expect(own(page)).toContainText('현재 병당 0원'); await expect(guest(page)).toContainText('2개')
  expect(s.calls.filter((c) => c.path.endsWith('/merge'))).toHaveLength(0)
  await page.getByRole('button', { name: '기기 상품을 계정에 합치기', exact: true }).focus(); await page.keyboard.press('Enter')
  await expect(guest(page)).toHaveCount(0); await expect(own(page).getByRole('spinbutton')).toHaveValue('3')
  await own(page).getByRole('spinbutton').fill('4'); await own(page).getByRole('spinbutton').press('Enter'); await expect(own(page)).toContainText('저장 수량 4개')
  await page.getByLabel('테이블·요청 사항', { exact: true }).fill('  원문 요청  '); await page.getByRole('button', { name: '0원 주문하기', exact: true }).click()
  await expect(page.getByRole('heading', { name: '데모 주문 상세', exact: true })).toBeVisible(); expect(s.orders).toHaveLength(1); expect(s.orders[0].orderTable).toBe('  원문 요청  ')
  await nav(page, /장바구니/); await expect(page.getByRole('heading', { name: '계정 장바구니가 비어 있습니다', exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('pubburi-cart'))).toBe('[]')
  expect(s.calls.filter((c) => c.path.startsWith('/api/users/me/cart')).every((c) => c.owner === 'member')).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
})
test('병합 응답유실은 같은UUID로 현재결과만 확인하고 clear뒤에도 부활·중복합산 없음', async ({ page, cartApi: s }) => {
  await localCart(page); s.lost = 'merge'; await page.goto('/cart'); await page.getByRole('button', { name: '기기 상품을 계정에 합치기', exact: true }).click()
  await expect(page.getByRole('button', { name: '같은 작업 결과 확인', exact: true })).toBeVisible(); await expect(guest(page)).toContainText('2개'); expect(s.carts.member.items[0].quantity).toBe(2)
  s.carts.member.items = []; s.carts.member.version++
  await page.getByRole('button', { name: '같은 작업 결과 확인', exact: true }).click(); await expect(guest(page)).toHaveCount(0); await expect(page.getByRole('heading', { name: '계정 장바구니가 비어 있습니다', exact: true })).toBeVisible()
  const merges = s.calls.filter((c) => c.path.endsWith('/merge')); expect(merges).toHaveLength(2); expect(merges[1].body).toEqual(merges[0].body); expect(s.carts.member.items).toEqual([])
})
test('합산99 초과409와 서버읽기503은 양쪽원본·수량초안·요청을 보존하고 명시 복구', async ({ page, cartApi: s }) => {
  await localCart(page, 2); s.carts.member = { version: 1, items: [row(7, 98)] }; await page.goto('/cart'); await own(page).getByRole('spinbutton').fill('97'); await page.getByLabel('테이블·요청 사항', { exact: true }).fill('남을 요청')
  await page.getByRole('button', { name: '기기 상품을 계정에 합치기', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('반영하지 못했습니다'); expect(s.carts.member.items[0].quantity).toBe(98); await expect(guest(page)).toContainText('2개')
  s.readStatus = 503; await page.getByRole('button', { name: '계정 장바구니 새로고침', exact: true }).click(); await expect(own(page)).toHaveCount(0)
  s.readStatus = 0; await page.getByRole('button', { name: '계정 장바구니 새로고침', exact: true }).click(); await expect(own(page).getByRole('spinbutton')).toHaveValue('97'); await expect(page.getByLabel('테이블·요청 사항', { exact: true })).toHaveValue('남을 요청')
})
test('삭제 상품은 금액미확인·주문차단 뒤 명시제거, 실제0원과 구분', async ({ page, cartApi: s }) => {
  s.carts.member = { version: 1, items: [{ ...row(), currentProduct: null }] }; await page.goto('/cart'); await expect(own(page)).toContainText('금액 미확인'); await expect(page.getByRole('button', { name: '금액 미확인 · 주문할 수 없음', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '카트 표본 7 계정에서 삭제', exact: true }).click(); await expect(page.getByRole('heading', { name: '계정 장바구니가 비어 있습니다', exact: true })).toBeVisible()
})
test('checkout 응답유실은 동일 주문만 재생하고 대기중 다음 요청은 유지', async ({ page, cartApi: s }) => {
  s.carts.member = { version: 1, items: [row(8, 2)] }; s.lost = 'checkout'; await page.goto('/cart'); await page.getByLabel('테이블·요청 사항', { exact: true }).fill('제출요청'); await page.getByRole('button', { name: '10,000원 주문하기', exact: true }).click()
  await expect(page.getByRole('button', { name: '같은 작업 결과 확인', exact: true })).toBeVisible(); await page.getByRole('button', { name: '계정 장바구니 새로고침', exact: true }).click()
  // A different session can add the next order while the first result is unresolved.
  s.carts.member.items = [row(7, 1)]; s.carts.member.version++
  await page.getByRole('button', { name: '같은 작업 결과 확인', exact: true }).click(); await expect(page.getByRole('heading', { name: '주문 #90', exact: true })).toBeVisible(); expect(s.orders).toHaveLength(1)
  await nav(page, /장바구니/); await expect(own(page).getByRole('spinbutton')).toHaveValue('1'); expect(s.calls.filter((c) => c.path.endsWith('/checkout')).map((c) => c.body.operationId).every((id, _, all) => id === all[0])).toBe(true)
})
test('다른세션 CAS충돌과 현재401은 개인DOM차폐·기기원본유지, 옛응답은 새계정에 침범하지 않음', async ({ page, cartApi: s }) => {
  await localCart(page); s.carts.member = { version: 1, items: [row(7, 3)] }; await page.goto('/cart'); await own(page).getByRole('spinbutton').fill('4'); s.carts.member.version++
  await own(page).getByRole('button', { name: '수량 저장', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('다른 곳'); await page.getByRole('button', { name: '계정 장바구니 새로고침', exact: true }).click(); await expect(own(page).getByRole('spinbutton')).toHaveValue('4')
  s.user = null; await own(page).getByRole('button', { name: '수량 저장', exact: true }).click(); await expect(own(page)).toHaveCount(0); await expect(guest(page)).toContainText('2개'); await expect(page.getByRole('button', { name: '장바구니 로그인 상태 다시 확인', exact: true })).toBeVisible()
})
test('상품담기는 최신서버수량CAS를쓰고 계정자료를기기에복사하지 않음', async ({ page, cartApi: s }) => {
  s.carts.member = { version: 3, items: [row(7, 2)] }; await page.goto('/products/7'); await page.getByRole('button', { name: '1개 장바구니에 담기', exact: true }).click(); await expect.poll(() => s.carts.member.items[0].quantity).toBe(3)
  expect(s.calls.find((c) => c.method === 'PUT' && c.path.endsWith('/items/7')).body).toEqual({ quantity: 3, expectedVersion: 3 }); expect(await page.evaluate(() => localStorage.getItem('pubburi-cart'))).toBeNull()
  await nav(page, /장바구니/); await expect(own(page).getByRole('spinbutton')).toHaveValue('3')
})
test('지연 주문 성공은 다음 요청·다른세션 새수량과 이동한 경로를 보존', async ({ page, cartApi: s }) => {
  s.carts.member = { version: 1, items: [row(8, 2)] }; const g = gate(); s.hold = g
  try {
    await page.goto('/cart'); await page.getByLabel('테이블·요청 사항', { exact: true }).fill('처음 요청'); await page.getByRole('button', { name: '10,000원 주문하기', exact: true }).click()
    await expect.poll(() => s.orders.length).toBe(1); await expect(own(page).getByRole('spinbutton')).toBeDisabled(); await expect(own(page).getByRole('button', { name: '카트 표본 8 계정에서 삭제', exact: true })).toBeDisabled()
    await page.getByLabel('테이블·요청 사항', { exact: true }).fill('다음 요청'); s.carts.member.items = [row(7, 1)]; s.carts.member.version++
    await nav(page, '전체 주류'); await expect(page.getByRole('button', { name: '빠른 담기', exact: true }).first()).toBeDisabled(); g.release(); await expect(page.getByText('주문이 접수되었습니다.', { exact: true })).toBeVisible(); await expect(page).toHaveURL('/products')
    await nav(page, /장바구니/); await expect(own(page).getByRole('spinbutton')).toHaveValue('1'); await expect(page.getByLabel('테이블·요청 사항', { exact: true })).toHaveValue('다음 요청'); expect(s.orders).toHaveLength(1); expect(s.orders[0].orderTable).toBe('처음 요청')
  } finally { g.release() }
})
for (const outcome of ['success', '401']) test(`지연병합 ${outcome}는 로그아웃/다른계정 복귀뒤 guest·알림·경로를 바꾸지 않음`, async ({ page, cartApi: s }) => {
  await localCart(page); await page.goto('/cart'); const g = gate(); s.hold = g
  if (outcome === '401') await page.route('**/api/users/me/cart/merge', async (r) => { await g.promise; await r.fulfill({ status: 401, json: bad('UNAUTHORIZED') }) })
  try {
    await page.getByRole('button', { name: '기기 상품을 계정에 합치기', exact: true }).click(); await nav(page, '홈'); await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await nav(page, '로그인')
    await page.getByLabel('아이디', { exact: true }).fill('other'); await page.getByLabel('비밀번호', { exact: true }).fill('fixture'); await page.locator('.auth-form').getByRole('button', { name: '로그인', exact: true }).click(); await nav(page, /장바구니/)
    await expect(page.getByRole('heading', { name: '계정 장바구니가 비어 있습니다', exact: true })).toBeVisible(); g.release(); await expect(guest(page)).toContainText('2개'); await expect(page).toHaveURL('/cart'); await expect(page.getByText('기기 장바구니를 계정에 합쳤습니다.', { exact: true })).toHaveCount(0)
  } finally { g.release() }
})

test('ABA 복귀의 읽기전용 receipt는 적용된 병합을 다시 합산하지 않음', async ({ page, cartApi: s }, info) => {
  await localCart(page); s.lost = 'merge'; await page.goto('/cart'); await page.getByRole('button', { name: '기기 상품을 계정에 합치기', exact: true }).click()
  await expect(page.getByRole('button', { name: '같은 작업 결과 확인', exact: true })).toBeVisible(); expect(s.carts.member.items[0].quantity).toBe(2)
  await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await signIn(page, 'other'); await nav(page, /장바구니/); await expect(guest(page)).toContainText('2개')
  await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await signIn(page, 'member'); await nav(page, /장바구니/); await expect(own(page).getByRole('spinbutton')).toHaveValue('2')
  await expect(page.getByRole('button', { name: '기기 상품을 계정에 합치기', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '이전 작업 결과 조회', exact: true }).click(); await expect(guest(page)).toHaveCount(0)
  await info.attach('aba-merge-once.json', { body: JSON.stringify({ appliedBeforeTransition: 2, afterReceiptRead: s.carts.member.items[0].quantity, merges: s.calls.filter((c) => c.path.endsWith('/merge')).map((c) => c.body) }), contentType: 'application/json' })
  expect(s.carts.member.items[0].quantity).toBe(2)
  expect(s.calls.filter((c) => c.path.endsWith('/merge'))).toHaveLength(1); expect(s.calls.filter((c) => c.path.includes('/operations/'))).toHaveLength(1)
})
for (const receiptExists of [true, false]) test(`다시 로그인한 주문 receipt ${receiptExists ? '있음' : '없음·재가입'}은 자동POST/이동 없이 확인하고 새폼 보존`, async ({ page, cartApi: s }) => {
  s.carts.member = { version: 1, items: [row(8, 2)] }; s.lost = 'checkout'
  await page.goto('/cart'); await page.getByLabel('테이블·요청 사항', { exact: true }).fill('이전 요청'); await page.getByRole('button', { name: '10,000원 주문하기', exact: true }).click(); await expect(page.getByRole('button', { name: '같은 작업 결과 확인', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '로그아웃', exact: true }).click()
  if (!receiptExists) { s.receipts.clear(); s.carts.member = { version: 0, items: [row(7, 1)] } }
  else { s.carts.member.items = [row(7, 1)]; s.carts.member.version++ }
  await signIn(page, 'member')
  await nav(page, /장바구니/); await expect(page.getByRole('button', { name: '이전 작업 결과 조회', exact: true })).toBeVisible(); await page.getByLabel('테이블·요청 사항', { exact: true }).fill('새 로그인 요청')
  await page.getByRole('button', { name: '이전 작업 결과 조회', exact: true }).click(); await expect(page.getByRole('button', { name: '이전 작업 결과 조회', exact: true })).toHaveCount(0)
  if (!receiptExists) {
    await expect(page.getByRole('button', { name: '0원 주문하기', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: '이전 작업 안전 종료·결과 확인', exact: true }).click()
  }
  await expect(page).toHaveURL('/cart'); await expect(page.getByLabel('테이블·요청 사항', { exact: true })).toHaveValue('새 로그인 요청'); expect(s.orders).toHaveLength(1); expect(s.calls.filter((c) => c.path.endsWith('/checkout'))).toHaveLength(1)
  if (receiptExists) await expect(page.getByRole('link', { name: '확인한 주문 보기', exact: true })).toHaveAttribute('href', '/orders/90')
  else await expect(page.getByText(/이전 작업을 안전하게 종료했습니다/)).toBeVisible()
})
test('세대간 receipt500/지연401은 미확정descriptor와 원본을 유지하고 다른계정에 침범하지 않음', async ({ page, cartApi: s }) => {
  await localCart(page); s.lost = 'merge'; await page.goto('/cart'); await page.getByRole('button', { name: '기기 상품을 계정에 합치기', exact: true }).click(); await expect(page.getByRole('button', { name: '같은 작업 결과 확인', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await signIn(page, 'member'); await nav(page, /장바구니/)
  s.readStatus = 500; await page.getByRole('button', { name: '이전 작업 결과 조회', exact: true }).click(); await expect(page.getByRole('alert')).toBeVisible(); await expect(guest(page)).toContainText('2개'); expect(s.calls.filter((c) => c.path.endsWith('/merge'))).toHaveLength(1)
  s.readStatus = 0; const g = gate(); let started = false
  await page.route('**/api/users/me/cart/operations/*', async (r) => { started = true; await g.promise; await r.fulfill({ status: 401, json: bad('UNAUTHORIZED') }) })
  try {
    await page.getByRole('button', { name: '이전 작업 결과 조회', exact: true }).click(); await expect.poll(() => started).toBe(true)
    await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await signIn(page, 'other'); await nav(page, /장바구니/); g.release()
    await expect(own(page)).toBeVisible(); await expect(page.getByRole('button', { name: '이전 작업 결과 조회', exact: true })).toHaveCount(0); await expect(guest(page)).toContainText('2개'); await expect(page.getByText('로그인 상태가 바뀌어 계정 장바구니를 표시하지 않았습니다.', { exact: true })).toHaveCount(0)
  } finally { g.release() }
})
test('미저장 수량이 있는 주문은 버튼과 다른submit 경로 모두 전송하지 않고 초안을 보존', async ({ page, cartApi: s }) => {
  s.carts.member = { version: 1, items: [row(8, 2)] }; await page.goto('/cart'); await own(page).getByRole('spinbutton').fill('3')
  await expect(page.getByRole('button', { name: '10,000원 주문하기', exact: true })).toBeDisabled(); await expect(page.getByText(/바꾼 수량을 먼저 저장한 뒤 주문해 주세요/)).toBeVisible()
  await page.locator('.checkout-form').evaluate((form) => form.requestSubmit()); expect(s.orders).toHaveLength(0); await expect(own(page).getByRole('spinbutton')).toHaveValue('3')
  await own(page).getByRole('button', { name: '수량 저장', exact: true }).click(); await expect(page.getByRole('button', { name: '15,000원 주문하기', exact: true })).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0); await expect(page.getByText(/바꾼 수량을 먼저 저장한 뒤 주문해 주세요/)).toHaveCount(0)
})

for (const kind of ['merge', 'checkout']) for (const winner of ['original', 'resolve']) test(`receipt404 ${kind}의 ${winner} 먼저: 미확정 nonce를 안전하게 끝낸 뒤에만 새작업 허용`, async ({ page, cartApi: s }, info) => {
  let oldIntent
  if (kind === 'merge') await localCart(page)
  else s.carts.member = { version: 0, items: [row(7, 2)] }
  await page.route(`**/api/users/me/cart/${kind}`, async (route) => {
    if (oldIntent) return route.fallback()
    oldIntent = route.request().postDataJSON(); await route.abort('failed')
  })
  await page.goto('/cart'); await page.getByRole('button', { name: kind === 'merge' ? '기기 상품을 계정에 합치기' : '0원 주문하기', exact: true }).click(); await expect(page.getByRole('button', { name: '같은 작업 결과 확인', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await signIn(page, 'other'); await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await signIn(page, 'member'); await nav(page, /장바구니/)
  await page.getByRole('button', { name: '이전 작업 결과 조회', exact: true }).click(); await expect(page.getByRole('button', { name: '이전 작업 안전 종료·결과 확인', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: kind === 'merge' ? '기기 상품을 계정에 합치기' : '0원 주문하기', exact: true })).toBeDisabled()
  if (winner === 'original') {
    // Release the admitted original POST only after the pure GET404. The real
    // provider independently verifies that its user lock orders these stages.
    s.carts.member = { version: 1, items: kind === 'merge' ? [row(7, 2)] : [] }
    if (kind === 'checkout') s.orders.push({ oId: 90, userId: 'member', orderType: 'TAKEOUT', orderTable: '', details: [], totalPrice: 0, completed: 'N', orderTime: '2026-11-08T00:00:00' })
    s.receipts.set(`member:${oldIntent.operationId}`, { intent: intentOf(kind, oldIntent), status: 'APPLIED', orderId: kind === 'checkout' ? 90 : null })
  }
  await page.getByRole('button', { name: '이전 작업 안전 종료·결과 확인', exact: true }).click(); await expect(page.getByRole('button', { name: '이전 작업 안전 종료·결과 확인', exact: true })).toHaveCount(0); await expect(page).toHaveURL('/cart')
  if (winner === 'resolve') {
    const late = await page.evaluate(async ({ kind, body }) => { const response = await fetch(`/api/users/me/cart/${kind}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Pubburi-Account-Owner': 'member' }, body: JSON.stringify(body) }); return { status: response.status, body: await response.json() } }, { kind, body: oldIntent })
    expect(late.status).toBe(409); expect(late.body.error.code).toBe('CART_OPERATION_RETIRED'); expect(s.orders).toHaveLength(0)
    if (kind === 'merge') { await expect(guest(page)).toContainText('2개'); await page.getByRole('button', { name: '기기 상품을 계정에 합치기', exact: true }).click(); await expect(guest(page)).toHaveCount(0) }
    else { await page.getByRole('button', { name: '0원 주문하기', exact: true }).click(); await expect(page.getByRole('heading', { name: '주문 #90', exact: true })).toBeVisible() }
  }
  expect(s.orders).toHaveLength(kind === 'checkout' ? 1 : 0)
  expect(s.carts.member.items.reduce((sum, item) => sum + item.quantity, 0)).toBe(kind === 'merge' ? 2 : 0)
  await info.attach('resolve-once.json', { body: JSON.stringify({ kind, winner, quantity: s.carts.member.items.reduce((sum, item) => sum + item.quantity, 0), orders: s.orders.length }), contentType: 'application/json' })
})
test('resolve 응답유실·동일nonce재확인은 revision과비즈니스를 반복하지 않고 원본을 유지', async ({ page, cartApi: s }) => {
  await localCart(page); let oldIntent
  await page.route('**/api/users/me/cart/merge', async (route) => { if (oldIntent) return route.fallback(); oldIntent = route.request().postDataJSON(); return route.abort('failed') })
  await page.goto('/cart'); await page.getByRole('button', { name: '기기 상품을 계정에 합치기', exact: true }).click(); await expect(page.getByRole('button', { name: '같은 작업 결과 확인', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await signIn(page, 'member'); await nav(page, /장바구니/); await page.getByRole('button', { name: '이전 작업 결과 조회', exact: true }).click()
  s.lost = 'resolve'; await page.getByRole('button', { name: '이전 작업 안전 종료·결과 확인', exact: true }).click(); await expect(page.getByRole('alert')).toBeVisible(); await expect(guest(page)).toContainText('2개'); expect(s.carts.member.version).toBe(1)
  await page.getByRole('button', { name: '이전 작업 안전 종료·결과 확인', exact: true }).click(); await expect(page.getByRole('button', { name: '이전 작업 안전 종료·결과 확인', exact: true })).toHaveCount(0); expect(s.carts.member.version).toBe(1); expect(s.carts.member.items).toEqual([]); await expect(guest(page)).toContainText('2개')
  const resolves = s.calls.filter((call) => call.path.endsWith('/resolve')); expect(resolves).toHaveLength(2); expect(resolves[1].body).toEqual(resolves[0].body)
})
for (const kind of ['merge', 'checkout']) for (const recovery of ['relogin', 'same-query-recheck']) test(`postcommit401 ${kind}/${recovery}은 비공개DOM만 차폐하고 원POST없이 원래접수를 확인`, async ({ page, cartApi: s }, info) => {
  if (kind === 'merge') await localCart(page)
  else s.carts.member = { version: 0, items: [row(7, 2)] }
  s.afterApply401 = kind; s.keepUserAfter401 = recovery === 'same-query-recheck'; await page.goto('/cart'); await page.getByRole('button', { name: kind === 'merge' ? '기기 상품을 계정에 합치기' : '0원 주문하기', exact: true }).click()
  await expect(own(page)).toHaveCount(0); await page.getByRole('button', { name: '장바구니 로그인 상태 다시 확인', exact: true }).click()
  if (recovery === 'relogin') { await signIn(page, 'member'); await nav(page, /장바구니/) }
  await expect(own(page)).toBeVisible()
  await info.attach('postcommit401.json', { body: JSON.stringify({ kind, responseStatus: 401, backendQuantity: s.carts.member.items.reduce((sum, item) => sum + item.quantity, 0), backendOrders: s.orders.length, receipts: s.receipts.size, recoveryControls: await page.getByRole('button', { name: '이전 작업 결과 조회', exact: true }).count() }), contentType: 'application/json' })
  await expect(page.getByRole('button', { name: '이전 작업 결과 조회', exact: true })).toBeVisible(); await page.getByRole('button', { name: '이전 작업 결과 조회', exact: true }).click(); await expect(page.getByRole('button', { name: '이전 작업 결과 조회', exact: true })).toHaveCount(0)
  expect(s.carts.member.items.reduce((sum, item) => sum + item.quantity, 0)).toBe(kind === 'merge' ? 2 : 0); expect(s.orders).toHaveLength(kind === 'checkout' ? 1 : 0)
  expect(s.calls.filter((call) => call.path.endsWith(`/${kind}`) && call.method === 'POST')).toHaveLength(1)
  if (kind === 'merge') await expect(guest(page)).toHaveCount(0)
  else await expect(page.getByRole('link', { name: '확인한 주문 보기', exact: true })).toHaveAttribute('href', '/orders/90')
  await expect(page).toHaveURL('/cart')
})
