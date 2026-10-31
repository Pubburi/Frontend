import { expect, test as base } from '@playwright/test'

// Self-authored UI fixtures. They are not real products or recommendation data.
const products = [
  { id: 901, name: '시험 탁주', type: '탁주', price: 6000, abv: 6, img: null, orderCount: 0 },
  { id: 902, name: '시험 사케', type: '사케', price: 12000, abv: 14, img: null, orderCount: 0 },
]
const pageOf = (items, size = 12) => ({
  items, page: 1, size, total: items.length, totalPages: items.length ? 1 : 0, hasNext: false,
})
const success = (data) => ({ data, message: 'ok', error: null })
const failure = (code) => ({ data: null, message: null, error: { code, message: code } })

const test = base.extend({
  api: [async ({ page }, use) => {
    const state = {
      user: null, catalogFailures: 0, sessionFailures: 0, orderFailures: 0,
      catalog: products.map((item) => ({ ...item })), markets: [], reviews: [], orders: [],
      users: [
        { id: 'member', name: '시험회원', role: 'USER', stamps: 3 },
        { id: 'other', name: '다른회원', role: 'USER', stamps: 0 },
        { id: 'admin', name: '관리회원', role: 'ADMIN', stamps: 0 },
      ],
      calls: [], unexpected: [], pageErrors: [],
    }
    page.on('pageerror', (error) => state.pageErrors.push(error.message))
    await page.route('**/api/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const path = url.pathname.slice('/api'.length)
      const method = request.method()
      const body = request.postData() ? request.postDataJSON() : null
      state.calls.push({ method, path, query: Object.fromEntries(url.searchParams), body })
      if (method === 'POST' && path === '/auth/login') {
        state.user = state.users.find((user) => user.id === body.id) || null
        await route.fulfill({ status: state.user ? 200 : 401, json: state.user ? success(state.user) : failure('UNAUTHORIZED') })
        return
      }
      if (method === 'POST' && path === '/auth/logout') {
        state.user = null
        await route.fulfill({ json: success(true) })
        return
      }
      if (method === 'GET' && path === '/users/id-available') {
        await route.fulfill({ json: success({ available: !state.users.some((user) => user.id === url.searchParams.get('id')) }) })
        return
      }
      if (method === 'POST' && path === '/users') {
        const user = { id: body.id, name: body.name, role: 'USER', stamps: 0 }
        state.users.push(user)
        await route.fulfill({ json: success(user) })
        return
      }
      if (request.method() === 'GET' && path === '/auth/me') {
        if (state.sessionFailures > 0) {
          state.sessionFailures -= 1
          await route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') })
          return
        }
        await route.fulfill({
          status: state.user ? 200 : 401,
          json: state.user ? success(state.user) : failure('UNAUTHORIZED'),
        })
        return
      }
      if (request.method() === 'GET' && path === '/products') {
        if (state.catalogFailures > 0) {
          state.catalogFailures -= 1
          await route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') })
          return
        }
        const q = url.searchParams.get('q') || ''
        const type = url.searchParams.get('type') || ''
        const items = state.catalog.filter((item) => (!type || item.type === type) && item.name.includes(q))
        await route.fulfill({ json: success(pageOf(items)) })
        return
      }
      if (request.method() === 'GET' && path === '/products/popular') {
        await route.fulfill({ json: success(state.catalog) })
        return
      }
      if (request.method() === 'GET' && path === '/markets') {
        await route.fulfill({ json: success(pageOf(state.markets)) })
        return
      }
      if (request.method() === 'GET' && path === '/products/999/comments') {
        await route.fulfill({ status: 404, json: failure('NOT_FOUND') })
        return
      }
      if (request.method() === 'GET' && state.catalog.some((item) => path === `/products/${item.id}/comments`)) {
        const productId = Number(path.split('/')[2])
        await route.fulfill({ json: success(pageOf(state.reviews.filter((review) => review.productId === productId), 10)) })
        return
      }
      if (request.method() === 'GET' && /^\/products\/\d+$/.test(path)) {
        const product = state.catalog.find((item) => item.id === Number(path.split('/').at(-1)))
        await route.fulfill({ status: product ? 200 : 404, json: product ? success(product) : failure('NOT_FOUND') })
        return
      }
      if (method === 'GET' && /^\/users\/[^/]+\/profile$/.test(path)) {
        const user = state.users.find((item) => item.id === path.split('/')[2]) || state.user
        await route.fulfill({ json: success({ user, grade: { title: '씨앗', to: 7, step: 3, stepMax: 10 } }) })
        return
      }
      if (method === 'GET' && /^\/users\/[^/]+\/orders$/.test(path)) {
        await route.fulfill({ json: success(pageOf(state.orders.filter((order) => order.userId === path.split('/')[2]), 10)) })
        return
      }
      if (method === 'POST' && path === '/orders') {
        if (state.orderFailures > 0) { state.orderFailures -= 1; await route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') }); return }
        const details = body.details.map((detail, i) => {
          const item = state.catalog.find((product) => product.id === detail.productId)
          return { id: i + 1, productId: item.id, name: item.name, type: item.type, quantity: detail.quantity, unitPrice: item.price, sumPrice: item.price * detail.quantity, priceBasis: 'ORDER_SNAPSHOT' }
        })
        const order = { ...body, oId: 500 + state.orders.length, completed: 'N', orderTime: '2026-10-31T10:00:00', details, totalPrice: details.reduce((sum, item) => sum + item.sumPrice, 0), priceBasis: 'ORDER_SNAPSHOT' }
        state.orders.push(order)
        await route.fulfill({ json: success(order) })
        return
      }
      if (method === 'POST' && path === '/comments') {
        const review = { ...body, id: 100 + state.reviews.length, userId: state.user.id }
        state.reviews.push(review)
        await route.fulfill({ json: success(review) })
        return
      }
      if (/^\/comments\/\d+$/.test(path) && ['PUT', 'DELETE'].includes(method)) {
        const id = Number(path.split('/').at(-1))
        if (method === 'PUT') Object.assign(state.reviews.find((review) => review.id === id), body)
        else state.reviews = state.reviews.filter((review) => review.id !== id)
        await route.fulfill({ json: success(true) })
        return
      }
      if (method === 'GET' && ['/admin/orders', '/admin/comments', '/admin/users'].includes(path)) {
        const items = path === '/admin/orders' ? state.orders : path === '/admin/comments' ? state.reviews : state.users
        await route.fulfill({ json: success(pageOf(items, 20)) })
        return
      }
      if (path === '/admin/products' && method === 'POST') {
        state.catalog.push({ ...body, id: 1000 + state.catalog.length })
        await route.fulfill({ json: success(true) })
        return
      }
      if (/^\/admin\/products\/\d+$/.test(path) && ['PUT', 'DELETE'].includes(method)) {
        const id = Number(path.split('/').at(-1))
        if (method === 'PUT') Object.assign(state.catalog.find((product) => product.id === id), body)
        else state.catalog = state.catalog.filter((product) => product.id !== id)
        await route.fulfill({ json: success(true) })
        return
      }
      if (path === '/admin/markets' && method === 'POST') {
        state.markets.push({ ...body, id: 2000 + state.markets.length })
        await route.fulfill({ json: success(true) })
        return
      }
      if (/^\/admin\/markets\/\d+$/.test(path) && ['PUT', 'DELETE'].includes(method)) {
        const id = Number(path.split('/').at(-1))
        if (method === 'PUT') Object.assign(state.markets.find((market) => market.id === id), body)
        else state.markets = state.markets.filter((market) => market.id !== id)
        await route.fulfill({ json: success(true) })
        return
      }
      if (/^\/admin\/users\/[^/]+$/.test(path) && ['PUT', 'DELETE'].includes(method)) {
        const id = path.split('/').at(-1)
        if (method === 'PUT') Object.assign(state.users.find((user) => user.id === id), body)
        else state.users = state.users.filter((user) => user.id !== id)
        await route.fulfill({ json: success(true) })
        return
      }
      if (/^\/admin\/orders\/\d+\/complete$/.test(path) && method === 'PATCH') {
        state.orders.find((order) => order.oId === Number(path.split('/')[3])).completed = 'Y'
        await route.fulfill({ json: success(true) })
        return
      }
      if (/^\/admin\/(orders|comments)\/\d+$/.test(path) && method === 'DELETE') {
        const id = Number(path.split('/').at(-1))
        if (path.includes('/orders/')) state.orders = state.orders.filter((order) => order.oId !== id)
        else state.reviews = state.reviews.filter((review) => review.id !== id)
        await route.fulfill({ json: success(true) })
        return
      }
      state.unexpected.push(`${request.method()} ${url.pathname}${url.search}`)
      await route.fulfill({ status: 501, json: failure('UNEXPECTED_TEST_REQUEST') })
    })
    await use(state)
    expect(state.unexpected, 'Every API request must have an explicit fixture').toEqual([])
    expect(state.pageErrors, 'The production bundle must not throw browser errors').toEqual([])
  }, { auto: true }],
})

test('상품 검색·상세·장바구니 저장과 비회원 주문 안내', async ({ page, api }) => {
  await page.goto('/products')
  await expect(page.getByRole('heading', { name: '전체 주류 둘러보기' })).toBeVisible()
  await page.getByLabel('상품 검색', { exact: true }).fill('시험 탁주')
  await page.getByRole('combobox', { name: /^주종/ }).selectOption('탁주')
  await page.getByRole('button', { name: '검색하기', exact: true }).click()
  await expect(page).toHaveURL((url) => url.searchParams.get('q') === '시험 탁주' && url.searchParams.get('type') === '탁주')
  await expect(page.locator('.product-card')).toHaveCount(1)
  expect(api.calls).toContainEqual(expect.objectContaining({
    path: '/products', query: expect.objectContaining({ q: '시험 탁주', type: '탁주' }),
  }))
  await page.getByRole('heading', { name: '시험 탁주', exact: true }).getByRole('link').click()
  await expect(page.getByRole('heading', { name: '시험 탁주', level: 1 })).toBeVisible()
  await expect.poll(() => page.getByAltText('시험 탁주', { exact: true }).evaluate((img) => img.naturalWidth)).toBeGreaterThan(0)
  await page.getByRole('button', { name: '수량 늘리기' }).click()
  await page.getByRole('button', { name: '2개 장바구니에 담기' }).click()
  await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: /장바구니/ }).click()
  await expect(page.getByRole('heading', { name: '장바구니', exact: true })).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: '시험 탁주 수량' })).toHaveValue('2')
  await page.getByRole('spinbutton', { name: '시험 탁주 수량' }).fill('3')
  await page.getByRole('spinbutton', { name: '시험 탁주 수량' }).press('Tab')
  await expect(page.getByRole('button', { name: '18,000원 주문하기' })).toBeVisible()
  await page.getByRole('spinbutton', { name: '시험 탁주 수량' }).fill('2')
  await page.getByRole('spinbutton', { name: '시험 탁주 수량' }).press('Tab')
  await page.reload()
  await expect(page.getByRole('spinbutton', { name: '시험 탁주 수량' })).toHaveValue('2')
  await page.getByRole('button', { name: '12,000원 주문하기' }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/account' && url.searchParams.get('redirect') === '/cart')
  expect(api.calls.filter((call) => call.method === 'POST')).toEqual([])
})

test('비회원의 보호 경로 진입은 원래 목적지를 보존해 로그인으로 이동', async ({ page }) => {
  await page.goto('/profile?from=browser-check')
  await expect(page).toHaveURL((url) => url.pathname === '/account' && url.searchParams.get('redirect') === '/profile?from=browser-check')
  await expect(page.getByRole('heading', { name: '다시 만나 반가워요' })).toBeVisible()
})

test('일반 회원은 관리자 화면과 관리자 API에 접근하지 않음', async ({ page, api }) => {
  api.user = { id: 'browser-user', name: '검증회원', role: 'USER' }
  await page.goto('/admin')
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: '취향과 순간에 어울리는 한 잔' })).toBeVisible()
  await expect(page.getByRole('link', { name: '관리', exact: true })).toHaveCount(0)
  expect(api.calls.some((call) => call.path.startsWith('/admin/'))).toBe(false)
})

test('상품 API 실패 후 재시도로 목록을 복구', async ({ page, api }) => {
  api.catalogFailures = 1
  await page.goto('/products')
  await expect(page.getByRole('heading', { name: '상품을 불러오지 못했습니다' })).toBeVisible()
  await page.getByRole('button', { name: '다시 시도', exact: true }).click()
  await expect(page.locator('.product-card')).toHaveCount(2)
})

test('존재하지 않는 상품의 직접 링크는 구매 없이 404 복귀 안내를 표시', async ({ page }) => {
  await page.goto('/products/999')
  await expect(page.getByRole('heading', { name: '상품을 찾을 수 없습니다' })).toBeVisible()
  await expect(page.getByRole('button', { name: /장바구니에 담기/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /시험 (탁주|사케)/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '전체 주류 보기', exact: true })).toHaveAttribute('href', '/products')
})

test('진행 중 검색을 해제하면 최신 URL의 상품 요청과 결과를 보존', async ({ page, api }) => {
  let releaseOld
  const oldGate = new Promise((resolve) => { releaseOld = resolve })
  let oldRequested = false
  await page.route('**/api/products?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('q') !== '시험 탁주') return route.fallback()
    oldRequested = true
    await oldGate
    await route.fulfill({ json: success(pageOf([products[0]])) })
  })
  try {
    await page.goto('/products?q=시험%20탁주')
    await expect.poll(() => oldRequested).toBe(true)
    await page.getByRole('button', { name: '전체 해제', exact: true }).click()
    await expect(page).toHaveURL((url) => !url.searchParams.has('q'))
    await expect.poll(() => api.calls.some((call) => call.path === '/products' && !call.query.q)).toBe(true)
    await expect(page.locator('.product-card')).toHaveCount(2)
    const oldResponse = page.waitForResponse((response) => new URL(response.url()).searchParams.get('q') === '시험 탁주')
    releaseOld()
    await (await oldResponse).finished()
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    await expect(page.getByRole('heading', { name: '시험 사케', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '상품을 불러오지 못했습니다' })).toHaveCount(0)
  } finally {
    releaseOld()
  }
})

test('기본 검색 URL에서 미제출 입력을 해제해도 입력과 칩을 초기화', async ({ page }) => {
  await page.goto('/products?sort=popular&page=1')
  await expect(page.locator('.product-card')).toHaveCount(2)
  await page.getByLabel('상품 검색', { exact: true }).fill('아직 제출하지 않은 검색어')
  await expect(page.getByText('검색: 아직 제출하지 않은 검색어', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '전체 해제', exact: true }).click()
  await expect(page).toHaveURL('/products?sort=popular&page=1')
  await expect(page.getByLabel('상품 검색', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('적용된 필터', { exact: true })).toHaveCount(0)
  await expect(page.locator('.product-card')).toHaveCount(2)
})

test('상세 조회 중 다른 상품으로 이동하면 이전 실패를 새 상세에 표시하지 않음', async ({ page }) => {
  let releaseOld
  const oldGate = new Promise((resolve) => { releaseOld = resolve })
  let oldRequested = false
  await page.route('**/api/products/901', async (route) => {
    oldRequested = true
    await oldGate
    await route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') })
  })
  try {
    await page.goto('/products')
    await page.getByRole('heading', { name: '시험 탁주', exact: true }).getByRole('link').click()
    await expect.poll(() => oldRequested).toBe(true)
    await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: '전체 주류', exact: true }).click()
    await page.getByRole('heading', { name: '시험 사케', exact: true }).getByRole('link').click()
    await expect(page.getByRole('heading', { name: '시험 사케', level: 1 })).toBeVisible()
    const oldResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/products/901')
    releaseOld()
    await (await oldResponse).finished()
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    await expect(page.getByRole('heading', { name: '시험 사케', level: 1 })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  } finally {
    releaseOld()
  }
})

test('세션 조회 장애는 비로그인으로 오인하지 않고 재시도로 복원', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  api.sessionFailures = 1
  await page.goto('/profile')
  await expect(page.getByRole('heading', { name: '로그인 상태를 확인하지 못했습니다' })).toBeVisible()
  await expect(page).toHaveURL('/profile')
  await page.getByRole('button', { name: '다시 시도', exact: true }).click()
  await expect(page.getByRole('heading', { name: '시험회원님의 취향 기록' })).toBeVisible()
})

test('가입·중복 확인·로그인 복귀와 계정 전환 시 비공개 캐시 분리', async ({ page, api }) => {
  await page.goto('/account?redirect=/profile')
  await page.locator('.segmented').getByRole('button', { name: '회원가입', exact: true }).click()
  await page.getByLabel(/^아이디/).fill('new-member')
  await page.getByRole('button', { name: '중복 확인', exact: true }).click()
  await expect(page.getByText('사용할 수 있는 아이디입니다.')).toBeVisible()
  await page.getByLabel('이름', { exact: true }).fill('신규회원')
  await page.getByLabel('비밀번호', { exact: true }).fill('fixture-pass')
  await page.locator('.auth-form').getByRole('button', { name: '회원가입', exact: true }).click()
  await expect(page.getByRole('heading', { name: '신규회원님의 취향 기록' })).toBeVisible()
  await page.getByRole('button', { name: '로그아웃', exact: true }).click()
  await page.getByRole('link', { name: '로그인', exact: true }).click()
  await page.getByLabel(/^아이디/).fill('other')
  await page.getByLabel('비밀번호', { exact: true }).fill('fixture-pass')
  await page.locator('.auth-form').getByRole('button', { name: '로그인', exact: true }).click()
  await expect(page.getByRole('heading', { name: '다른회원님의 취향 기록' })).toBeVisible()
  await expect(page.getByText('신규회원님의 취향 기록')).toHaveCount(0)
  expect(api.calls.filter((call) => call.path === '/users').map((call) => call.body.id)).toEqual(['new-member'])
  expect(api.calls.some((call) => call.path === '/users/other/orders')).toBe(true)
})

test('데모 주문 실패는 장바구니를 보존하고 성공 후 서버 스냅샷 금액을 표시', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  api.orderFailures = 1
  await page.goto('/products/901')
  await page.getByRole('button', { name: '1개 장바구니에 담기' }).click()
  await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: /장바구니/ }).click()
  await page.getByLabel('주문 방식').selectOption('OFFLINE')
  await expect(page.getByLabel('테이블·요청 사항')).toHaveAttribute('maxlength', '20')
  await page.getByLabel('테이블·요청 사항').fill('3번 테이블')
  await page.getByRole('button', { name: '6,000원 주문하기' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: '시험 탁주 수량' })).toHaveValue('1')
  await page.getByRole('button', { name: '6,000원 주문하기' }).click()
  await expect(page).toHaveURL('/profile')
  await expect(page.locator('.order-total')).toHaveText('6,000원')
  await expect(page.getByText('주문 당시 금액', { exact: true })).toBeVisible()
  expect(api.orders).toHaveLength(1)
  expect(api.calls.filter((call) => call.path === '/orders' && call.method === 'POST').every((call) => call.body.orderType === 'OFFLINE' && call.body.orderTable === '3번 테이블')).toBe(true)
  await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: /장바구니/ }).click()
  await expect(page.getByRole('heading', { name: '장바구니가 비어 있습니다' })).toBeVisible()
})

test('브라우저 보관이 막혀도 담기와 성공 주문은 유지하고 보관 제약만 안내', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'pubburi-cart') throw new DOMException('blocked test storage', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await page.goto('/products/901')
  await page.getByRole('button', { name: '1개 장바구니에 담기' }).click()
  await expect(page.getByText('장바구니 보관 제한', { exact: true })).toBeVisible()
  await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: /장바구니/ }).click()
  await expect(page.getByRole('spinbutton', { name: '시험 탁주 수량' })).toHaveValue('1')
  await page.getByRole('button', { name: '6,000원 주문하기' }).click()
  await expect(page).toHaveURL('/profile')
  await expect(page.getByText('주문이 접수되었습니다.', { exact: true })).toBeVisible()
  await expect(page.getByText('장바구니 보관 제한', { exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(api.orders).toHaveLength(1)
  expect(api.calls.filter((call) => call.method === 'POST' && call.path === '/orders')).toHaveLength(1)
  await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: /장바구니/ }).click()
  await expect(page.getByRole('heading', { name: '장바구니가 비어 있습니다' })).toBeVisible()
})

test('localStorage 접근 자체가 차단돼도 앱과 메모리 장바구니는 동작', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('denied test storage', 'SecurityError') } })
  })
  await page.goto('/products')
  await expect(page.locator('.product-card')).toHaveCount(2)
  await expect(page.getByText('장바구니 보관 제한', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '빠른 담기', exact: true }).first().click()
  await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: /장바구니/ }).click()
  await expect(page.getByRole('spinbutton', { name: '시험 탁주 수량' })).toHaveValue('1')
})

test('회원 후기를 등록·수정·확인 후 삭제', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  await page.goto('/products/901')
  await page.getByLabel('후기', { exact: true }).fill('처음 남긴 후기')
  await page.getByRole('button', { name: '후기 등록', exact: true }).click()
  await expect(page.locator('.comment-row > p')).toHaveText('처음 남긴 후기')
  await page.getByRole('button', { name: '수정', exact: true }).click()
  await page.getByLabel('후기 내용', { exact: true }).fill('수정한 후기')
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.locator('.comment-row > p')).toHaveText('수정한 후기')
  await page.getByRole('button', { name: '삭제', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '삭제', exact: true }).click()
  await expect(page.getByRole('heading', { name: '아직 등록된 후기가 없습니다' })).toBeVisible()
  expect(api.reviews).toEqual([])
})

test('관리자 상품·매장 등록 편집 삭제와 현재 탭 갱신', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'admin')
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: '상품 관리', exact: true })).toBeVisible()
  await page.getByLabel('상품명', { exact: true }).fill('검증 추가상품')
  await page.locator('.admin-form').getByLabel('주종', { exact: true }).selectOption('탁주')
  await page.getByLabel('가격', { exact: true }).fill('7000')
  await page.getByLabel('이미지 파일명', { exact: true }).fill('takju1.webp')
  await page.getByRole('button', { name: '상품 등록', exact: true }).click()
  const productRow = page.locator('.table-row').filter({ hasText: '검증 추가상품' })
  await expect(productRow).toBeVisible()
  await productRow.getByRole('button', { name: '편집', exact: true }).click()
  await page.getByLabel('가격', { exact: true }).fill('7500')
  await page.getByRole('button', { name: '변경 저장', exact: true }).click()
  await expect(productRow).toContainText('7,500원')
  await productRow.getByRole('button', { name: '삭제', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '삭제', exact: true }).click()
  await expect(productRow).toHaveCount(0)
  await page.getByRole('navigation', { name: '관리 메뉴' }).getByRole('button', { name: '매장', exact: true }).click()
  await page.getByLabel('매장명', { exact: true }).fill('검증 매장')
  await page.getByLabel('위도', { exact: true }).fill('37.5')
  await page.getByLabel('경도', { exact: true }).fill('127.1')
  await page.getByRole('button', { name: '매장 등록', exact: true }).click()
  const marketRow = page.locator('.table-row').filter({ hasText: '검증 매장' })
  await marketRow.getByRole('button', { name: '편집', exact: true }).click()
  await page.getByLabel('매장명', { exact: true }).fill('수정 매장')
  await page.getByRole('button', { name: '변경 저장', exact: true }).click()
  const updated = page.locator('.table-row').filter({ hasText: '수정 매장' })
  await updated.getByRole('button', { name: '삭제', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '삭제', exact: true }).click()
  await expect(updated).toHaveCount(0)
  const before = api.calls.filter((call) => call.method === 'GET' && call.path === '/markets').length
  await page.getByRole('button', { name: '현재 탭 새로고침', exact: true }).click()
  await expect.poll(() => api.calls.filter((call) => call.method === 'GET' && call.path === '/markets').length).toBe(before + 1)
  expect(api.calls.some((call) => call.path === '/admin/orders')).toBe(false)
})

test('관리자 회원 변경·자기 삭제 차단·후기 삭제', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'admin')
  api.reviews = [{ id: 11, productId: 901, userId: 'member', rating: 4, comment: '관리 검증 후기' }]
  await page.goto('/admin?tab=users')
  const current = page.locator('.table-row').filter({ hasText: '관리회원' })
  await expect(current.getByRole('button', { name: '삭제', exact: true })).toBeDisabled()
  await page.locator('.table-row').filter({ hasText: '시험회원' }).getByRole('button', { name: '편집', exact: true }).click()
  await page.getByLabel('이름', { exact: true }).fill('변경회원')
  await page.getByLabel('스탬프', { exact: true }).fill('9')
  await page.getByRole('button', { name: '변경 저장', exact: true }).click()
  const member = page.locator('.table-row').filter({ hasText: '변경회원' })
  await expect(member).toContainText('9개')
  await member.getByRole('button', { name: '삭제', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '삭제', exact: true }).click()
  await expect(member).toHaveCount(0)
  await page.getByRole('navigation', { name: '관리 메뉴' }).getByRole('button', { name: '댓글', exact: true }).click()
  const review = page.locator('.table-row').filter({ hasText: '관리 검증 후기' })
  await expect(review.getByRole('link', { name: '상품 #901' })).toHaveAttribute('href', '/products/901')
  await review.getByRole('button', { name: '삭제', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '삭제', exact: true }).click()
  await expect(review).toHaveCount(0)
})

test('주문 내역은 확정·추정·미확인 금액과 삭제 상품을 구분', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  api.orders = [
    { oId: 101, userId: 'member', orderType: 'TAKEOUT', completed: 'Y', orderTime: '2026-10-31T10:00:00', totalPrice: 6000, priceBasis: 'ORDER_SNAPSHOT', details: [{ id: 1, productId: 901, name: '주문 상품', quantity: 1, unitPrice: 6000, sumPrice: 6000 }] },
    { oId: 102, userId: 'member', orderType: 'ONLINE', completed: 'N', orderTime: '2026-10-31T10:00:00', totalPrice: 7000, priceBasis: 'LEGACY_ESTIMATE', details: [{ id: 2, productId: null, name: '과거 상품', quantity: 1, unitPrice: 7000, sumPrice: 7000 }] },
    { oId: 103, userId: 'member', orderType: 'OFFLINE', completed: 'N', orderTime: '2026-10-31T10:00:00', totalPrice: null, priceBasis: null, details: [{ id: 3, productId: null, name: '미확인 상품', quantity: 1, unitPrice: null, sumPrice: null }] },
  ]
  await page.goto('/profile')
  await expect(page.getByText('주문 당시 금액', { exact: true })).toBeVisible()
  await expect(page.getByText('과거 주문 추정 금액', { exact: true })).toBeVisible()
  const unknown = page.locator('.profile-order-row').filter({ hasText: 'Order #103' })
  await expect(unknown.locator('.order-total')).toHaveText('금액 미확인')
  await expect(unknown).not.toContainText('0원')
  await expect(unknown).toContainText('금액 출처 미확인')
  await expect(unknown).toContainText('삭제된 상품')
  await expect(unknown.locator('a')).toHaveCount(0)
})

test('관리자 주문 완료·삭제와 탈퇴 회원의 보존 이력 표시', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'admin')
  api.orders = [{ oId: 501, userId: null, orderType: 'TAKEOUT', completed: 'N', orderTime: '2026-10-31T10:00:00', totalPrice: 6000, priceBasis: 'ORDER_SNAPSHOT', details: [{ id: 10, productId: null, name: '보존 상품', quantity: 1, unitPrice: 6000, sumPrice: 6000 }] }]
  await page.goto('/admin?tab=orders')
  await expect(page.getByText('탈퇴한 회원', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /#501/ }).click()
  await expect(page.getByText(/보존 상품/)).toContainText('삭제된 상품')
  await page.getByRole('button', { name: '완료', exact: true }).click()
  await expect(page.getByRole('button', { name: '완료', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '삭제', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '삭제', exact: true }).click()
  await expect(page.getByRole('button', { name: /#501/ })).toHaveCount(0)
})
