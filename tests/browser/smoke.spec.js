import { expect, test as base } from '@playwright/test'

// Self-authored UI fixtures. They are not real products or recommendation data.
const products = [
  { id: 901, name: '시험 탁주', type: '탁주', price: 6000, abv: 6, img: null, orderCount: 0 },
  { id: 902, name: '시험 사케', type: '사케', price: 12000, abv: 14, img: null, orderCount: 0 },
]
const pageOf = (items, size = 12, page = 1) => ({
  items: items.slice((page - 1) * size, page * size), page, size, total: items.length, totalPages: Math.ceil(items.length / size), hasNext: page * size < items.length,
})
const success = (data) => ({ data, message: 'ok', error: null })
const failure = (code) => ({ data: null, message: null, error: { code, message: code } })
const unknownFeatures = (productId) => ({ productId, volumeMl: null, description: null, tasteTags: null, aromaTags: null, sourceName: null, sourceUrl: null, sourceNote: null })
const emptyPreference = (surveyStatus = 'NOT_STARTED') => ({ surveyStatus, softPreferences: { categories: null, tasteTags: null, aromaTags: null, targetAbvPercent: null }, hardConstraints: { minPriceKrw: null, maxPriceKrw: null, minAbvPercent: null, maxAbvPercent: null } })

const test = base.extend({
  api: [async ({ page }, use) => {
    const state = {
      user: null, catalogFailures: 0, sessionFailures: 0, orderFailures: 0, defaultSource: 'BASELINE', defaultFailures: 0,
      catalog: products.map((item) => ({ ...item })), markets: [], reviews: [], orders: [], features: {}, preferences: {}, favorites: {},
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
        if (state.users.some((user) => user.id === body.id)) { await route.fulfill({ status: 400, json: failure('BAD_REQUEST') }); return }
        const user = { id: body.id, name: body.name, role: 'USER', stamps: 0 }
        state.users.push(user)
        await route.fulfill({ status: 201, json: success(true) })
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
      if (path === '/users/me/preferences' && ['GET', 'PUT'].includes(method)) {
        if (!state.user) { await route.fulfill({ status: 401, json: failure('UNAUTHORIZED') }); return }
        if (method === 'PUT') {
          const normalize = (tags) => tags === null ? null : tags.map((tag) => tag.trim().toLowerCase()).sort()
          state.preferences[state.user.id] = { ...body, softPreferences: { ...body.softPreferences, categories: body.softPreferences.categories?.toSorted() ?? null, tasteTags: normalize(body.softPreferences.tasteTags), aromaTags: normalize(body.softPreferences.aromaTags) } }
        }
        await route.fulfill({ json: success(state.preferences[state.user.id] ?? emptyPreference()) })
        return
      }
      if (path === '/users/me/favorites' && method === 'GET') {
        if (!state.user) { await route.fulfill({ status: 401, json: failure('UNAUTHORIZED') }); return }
        const ids = state.favorites[state.user.id] ?? []
        const items = ids.map((id) => state.catalog.find((item) => item.id === id)).filter(Boolean)
        const page = Number(url.searchParams.get('page') || 1)
        const size = Number(url.searchParams.get('size') || 20)
        await route.fulfill({ json: success({ items: items.slice((page - 1) * size, page * size), page, size, total: items.length, totalPages: Math.ceil(items.length / size), hasNext: page * size < items.length }) })
        return
      }
      if (/^\/users\/me\/favorites\/\d+$/.test(path) && ['GET', 'PUT', 'DELETE'].includes(method)) {
        if (!state.user) { await route.fulfill({ status: 401, json: failure('UNAUTHORIZED') }); return }
        const productId = Number(path.split('/').at(-1))
        if (method === 'GET') {
          await route.fulfill({ json: success({ productId, favorited: state.catalog.some((item) => item.id === productId) && (state.favorites[state.user.id] ?? []).includes(productId) }) })
          return
        }
        if (method === 'PUT' && !state.catalog.some((item) => item.id === productId)) { await route.fulfill({ status: 404, json: failure('NOT_FOUND') }); return }
        const ids = state.favorites[state.user.id] ?? []
        if (method === 'PUT') state.favorites[state.user.id] = ids.includes(productId) ? ids : [productId, ...ids]
        else state.favorites[state.user.id] = ids.filter((id) => id !== productId)
        await route.fulfill({ json: success({ productId, favorited: method === 'PUT' }) })
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
        await route.fulfill({ json: success(pageOf(items, Number(url.searchParams.get('size') || 12), Number(url.searchParams.get('page') || 1))) })
        return
      }
      if (method === 'GET' && path === '/recommendations/default') {
        if (state.defaultFailures > 0) {
          state.defaultFailures -= 1
          await route.fulfill({ status: 500, json: failure('INTERNAL_ERROR') })
          return
        }
        await route.fulfill({ json: success({ items: state.catalog.toSorted((a, b) => a.id - b.id).slice(0, Number(url.searchParams.get('size') || 4)), source: state.defaultSource }) })
        return
      }
      if (request.method() === 'GET' && path === '/products/popular') {
        await route.fulfill({ json: success(state.catalog) })
        return
      }
      if (/^\/(admin\/)?products\/\d+\/features$/.test(path)) {
        const productId = Number(path.split('/').at(-2))
        if (!state.catalog.some((item) => item.id === productId)) {
          await route.fulfill({ status: 404, json: failure('NOT_FOUND') })
          return
        }
        if (method === 'GET' && !path.startsWith('/admin/')) {
          await route.fulfill({ json: success(state.features[productId] ?? unknownFeatures(productId)) })
          return
        }
        if (method === 'PUT' && path.startsWith('/admin/')) {
          if (state.user?.role !== 'ADMIN') {
            await route.fulfill({ status: state.user ? 403 : 401, json: failure(state.user ? 'FORBIDDEN' : 'UNAUTHORIZED') })
            return
          }
          const normalizeTags = (tags) => tags === null ? null : tags.map((tag) => tag.trim().toLowerCase()).sort()
          state.features[productId] = { ...body, productId, tasteTags: normalizeTags(body.tasteTags), aromaTags: normalizeTags(body.aromaTags) }
          await route.fulfill({ json: success(state.features[productId]) })
          return
        }
      }
      if (request.method() === 'GET' && path === '/markets') {
        await route.fulfill({ json: success(pageOf(state.markets, Number(url.searchParams.get('size') || 12), Number(url.searchParams.get('page') || 1))) })
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
        await route.fulfill({ json: success(pageOf(items, Number(url.searchParams.get('size') || 20), Number(url.searchParams.get('page') || 1))) })
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
  await expect(page.getByLabel('후기', { exact: true })).toHaveValue('')
  await page.getByRole('button', { name: '수정', exact: true }).click()
  await page.getByLabel('후기 내용', { exact: true }).fill('수정한 후기')
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.locator('.comment-row > p')).toHaveText('수정한 후기')
  await page.getByRole('button', { name: '삭제', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '삭제', exact: true }).click()
  await expect(page.getByRole('heading', { name: '아직 등록된 후기가 없습니다' })).toBeVisible()
  expect(api.reviews).toEqual([])
})

test('후기 등록 응답은 제출 뒤 새로 입력한 초안을 지우지 않음', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const submissions = []
  await page.route('**/api/comments', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    submissions.push(route.request().postDataJSON())
    await gate
    await route.fallback()
  })
  try {
    await page.goto('/products/901')
    const form = page.locator('.comment-form')
    await form.getByLabel('후기', { exact: true }).fill('먼저 제출한 후기')
    await form.getByRole('button', { name: '후기 등록', exact: true }).click()
    await expect.poll(() => submissions.length).toBe(1)
    await expect(form.getByRole('button', { name: '후기 등록', exact: true })).toBeDisabled()
    await form.getByLabel('후기', { exact: true }).fill('다음 후기 초안')
    await form.getByRole('combobox', { name: /^평점/ }).selectOption('2')
    release()
    await expect(page.getByRole('status')).toContainText('후기가 등록되었습니다.')
    await expect(form.getByLabel('후기', { exact: true })).toHaveValue('다음 후기 초안')
    await expect(form.getByRole('combobox', { name: /^평점/ })).toHaveValue('2')
    await expect(page.locator('.comment-row > p')).toHaveText('먼저 제출한 후기')
    expect(submissions).toEqual([{ productId: 901, rating: 5, comment: '먼저 제출한 후기' }])
  } finally {
    release()
  }
})

for (const nextReview of [{ name: '같은', id: 11 }, { name: '다른', id: 12 }]) {
  test(`이전 저장 완료는 취소 뒤 다시 연 ${nextReview.name} 후기 편집을 닫지 않음`, async ({ page, api }) => {
    api.user = api.users.find((user) => user.id === 'member')
    api.reviews = [
      { id: 11, productId: 901, userId: 'member', rating: 4, comment: '첫 번째 원문' },
      { id: 12, productId: 901, userId: 'member', rating: 3, comment: '두 번째 원문' },
    ]
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const submissions = []
    await page.route('**/api/comments/11', async (route) => {
      if (route.request().method() !== 'PUT') return route.fallback()
      submissions.push(route.request().postDataJSON())
      await gate
      await route.fallback()
    })
    try {
      await page.goto('/products/901')
      await page.locator('.comment-row').filter({ hasText: '첫 번째 원문' }).getByRole('button', { name: '수정', exact: true }).click()
      await page.getByLabel('후기 내용', { exact: true }).fill('저장할 수정 본문')
      await page.getByRole('button', { name: '저장', exact: true }).click()
      await expect.poll(() => submissions.length).toBe(1)
      await page.locator('.comment-edit-form').getByRole('button', { name: '취소', exact: true }).click()
      const nextOriginal = nextReview.id === 11 ? '첫 번째 원문' : '두 번째 원문'
      await page.locator('.comment-row').filter({ hasText: nextOriginal }).getByRole('button', { name: '수정', exact: true }).click()
      // Re-entering identical content is still a new editing session.
      await page.getByLabel('후기 내용', { exact: true }).fill('저장할 수정 본문')
      await page.locator('.comment-edit-form').getByRole('combobox', { name: /^평점/ }).selectOption('4')
      release()
      await expect(page.getByRole('status')).toContainText('후기가 수정되었습니다.')
      await expect(page.getByLabel('후기 내용', { exact: true })).toHaveValue('저장할 수정 본문')
      await expect(page.locator('.comment-edit-form').getByRole('combobox', { name: /^평점/ })).toHaveValue('4')
      await expect(page.getByRole('button', { name: '저장', exact: true })).toBeEnabled()
      expect(api.reviews.find((review) => review.id === 11).comment).toBe('저장할 수정 본문')
      expect(api.reviews.find((review) => review.id === 12).comment).toBe('두 번째 원문')
      expect(submissions).toEqual([{ rating: 4, comment: '저장할 수정 본문' }])
    } finally {
      release()
    }
  })
}

test('후기 수정 응답은 저장 대기 중 계속 편집한 내용을 지우지 않음', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  api.reviews = [{ id: 11, productId: 901, userId: 'member', rating: 4, comment: '원래 후기' }]
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const submissions = []
  await page.route('**/api/comments/11', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    submissions.push(route.request().postDataJSON())
    await gate
    await route.fallback()
  })
  try {
    await page.goto('/products/901')
    await page.getByRole('button', { name: '수정', exact: true }).click()
    await page.getByLabel('후기 내용', { exact: true }).fill('먼저 저장할 본문')
    await page.getByRole('button', { name: '저장', exact: true }).click()
    await expect.poll(() => submissions.length).toBe(1)
    await page.getByLabel('후기 내용', { exact: true }).fill('아직 저장하지 않은 수정')
    release()
    await expect(page.getByRole('status')).toContainText('후기가 수정되었습니다.')
    await expect(page.getByLabel('후기 내용', { exact: true })).toHaveValue('아직 저장하지 않은 수정')
    await expect(page.getByRole('button', { name: '저장', exact: true })).toBeEnabled()
    expect(api.reviews[0].comment).toBe('먼저 저장할 본문')
    expect(submissions).toEqual([{ rating: 4, comment: '먼저 저장할 본문' }])
  } finally {
    release()
  }
})

test('후기 등록 거절 뒤 초안을 유지하고 명시적 재제출만 전송', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const submissions = []
  await page.route('**/api/comments', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    submissions.push(route.request().postDataJSON())
    if (submissions.length !== 1) return route.fallback()
    await gate
    await route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') })
  })
  try {
    await page.goto('/products/901')
    const form = page.locator('.comment-form')
    await form.getByLabel('후기', { exact: true }).fill('처음 제출한 본문')
    await form.getByRole('button', { name: '후기 등록', exact: true }).click()
    await expect.poll(() => submissions.length).toBe(1)
    await form.getByLabel('후기', { exact: true }).fill('다시 제출할 초안')
    release()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(form.getByLabel('후기', { exact: true })).toHaveValue('다시 제출할 초안')
    await expect(form.getByRole('button', { name: '후기 등록', exact: true })).toBeEnabled()
    expect(api.reviews).toEqual([])
    expect(submissions).toHaveLength(1)
    await form.getByRole('button', { name: '후기 등록', exact: true }).click()
    await expect(page.locator('.comment-row > p')).toHaveText('다시 제출할 초안')
    await expect(form.getByLabel('후기', { exact: true })).toHaveValue('')
    expect(submissions.map((body) => body.comment)).toEqual(['처음 제출한 본문', '다시 제출할 초안'])
    expect(api.reviews).toHaveLength(1)
  } finally {
    release()
  }
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

test('관리자가 미확인·빈 태그·출처를 구분해 상품 특성을 저장하고 모두 지움', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'admin')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin')
  expect(api.calls.some((call) => call.path.endsWith('/features'))).toBe(false)
  const trigger = page.locator('.table-row').filter({ hasText: '시험 탁주' }).getByRole('button', { name: '특성 편집', exact: true })
  await trigger.click()
  let form = page.getByRole('form', { name: '시험 탁주 상품 특성' })
  await expect(form.getByLabel('용량 (mL)', { exact: true })).toHaveValue('')
  await expect(form.getByLabel('맛 태그 확인 상태')).toHaveValue('unknown')
  await expect(form.getByLabel('향 태그 확인 상태')).toHaveValue('unknown')
  await form.getByLabel('맛 태그 확인 상태').selectOption('empty')
  await form.getByRole('button', { name: '특성 저장', exact: true }).click()
  expect(await form.getByLabel('출처명', { exact: true }).evaluate((input) => input.validity.valueMissing)).toBe(true)
  expect(api.calls.filter((call) => call.method === 'PUT')).toHaveLength(0)
  await form.getByLabel('용량 (mL)', { exact: true }).fill('750')
  await form.getByLabel('상품 설명', { exact: true }).fill('직접 작성한 기술 검증 설명')
  await form.getByLabel('향 태그 확인 상태').selectOption('tags')
  await form.getByLabel('향 태그 1', { exact: true }).fill('SWEET')
  await form.getByRole('button', { name: '향 태그 추가', exact: true }).click()
  await form.getByLabel('향 태그 2', { exact: true }).fill('Floral')
  await form.getByRole('button', { name: '향 태그 추가', exact: true }).click()
  await form.getByRole('button', { name: '향 태그 3 삭제', exact: true }).click()
  await form.getByLabel('출처명', { exact: true }).fill('자체 작성 검증 표본')
  await form.getByLabel('출처 URL', { exact: true }).fill('https://example.com/fixture')
  await form.getByLabel('공개 검수 메모', { exact: true }).fill('기술 검증값이며 실제 주류 속성 아님')
  await expect(form.getByText(/공개되는 내용이므로/)).toBeVisible()
  await form.getByRole('button', { name: '특성 저장', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('시험 탁주 특성이 저장되었습니다.')
  await expect(form.getByLabel('향 태그 1', { exact: true })).toHaveValue('floral')
  await expect(form.getByLabel('향 태그 2', { exact: true })).toHaveValue('sweet')
  expect(api.features[901]).toEqual({ productId: 901, volumeMl: 750, description: '직접 작성한 기술 검증 설명', tasteTags: [], aromaTags: ['floral', 'sweet'], sourceName: '자체 작성 검증 표본', sourceUrl: 'https://example.com/fixture', sourceNote: '기술 검증값이며 실제 주류 속성 아님' })
  expect(api.catalog).toEqual(products)
  const writes = api.calls.filter((call) => call.method === 'PUT')
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({ path: '/admin/products/901/features', body: { volumeMl: 750, tasteTags: [], aromaTags: ['SWEET', 'Floral'] } })
  expect(Object.keys(writes[0].body)).toHaveLength(7)
  await page.getByRole('button', { name: '특성 편집 닫기', exact: true }).click()
  await expect(trigger).toBeFocused()
  await trigger.click()
  form = page.getByRole('form', { name: '시험 탁주 상품 특성' })
  await expect(form.getByLabel('맛 태그 확인 상태')).toHaveValue('empty')
  await expect(form.getByLabel('향 태그 확인 상태')).toHaveValue('tags')
  await form.getByRole('button', { name: '모두 미확인으로', exact: true }).click()
  expect(api.features[901].volumeMl).toBe(750)
  await form.getByRole('button', { name: '특성 저장', exact: true }).click()
  await expect.poll(() => api.features[901]).toEqual(unknownFeatures(901))
  expect(api.calls.filter((call) => call.method === 'PUT')).toHaveLength(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('특성 조회·권한·필드 오류는 빈 저장으로 숨기지 않고 초안을 유지', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'admin')
  let reads = 0
  let writes = 0
  await page.route('**/api/products/901/features', async (route) => {
    reads += 1
    if (reads === 1) return route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') })
    await route.fallback()
  })
  await page.route('**/api/admin/products/901/features', async (route) => {
    writes += 1
    if (writes === 1) return route.fulfill({ status: 403, json: failure('FORBIDDEN') })
    if (writes === 2) return route.fulfill({ status: 400, json: { data: null, message: null, error: { code: 'VALIDATION_FAILED', message: 'invalid', fields: { sourceName: '출처를 다시 확인해 주세요.' } } } })
    await route.fallback()
  })
  await page.goto('/admin')
  await page.locator('.table-row').filter({ hasText: '시험 탁주' }).getByRole('button', { name: '특성 편집', exact: true }).click()
  await expect(page.getByRole('heading', { name: '상품 특성을 불러오지 못했습니다' })).toBeVisible()
  await expect(page.getByRole('button', { name: '특성 저장', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '특성 다시 불러오기', exact: true }).click()
  const form = page.getByRole('form', { name: '시험 탁주 상품 특성' })
  await form.getByLabel('상품 설명', { exact: true }).fill('오류 뒤에도 보존할 설명')
  await form.getByLabel('출처명', { exact: true }).fill('직접 검증 표본')
  for (const message of ['이 작업을 수행할 권한이 없습니다.', '출처를 다시 확인해 주세요.']) {
    await form.getByRole('button', { name: '특성 저장', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText(message)
    await expect(form.getByLabel('상품 설명', { exact: true })).toHaveValue('오류 뒤에도 보존할 설명')
    await expect(form.getByLabel('출처명', { exact: true })).toHaveValue('직접 검증 표본')
    expect(api.features[901]).toBeUndefined()
  }
  await form.getByRole('button', { name: '특성 저장', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('시험 탁주 특성이 저장되었습니다.')
  expect(writes).toBe(3)
})

test('특성 조회 중 다른 상품을 열면 이전 오류가 새 초안을 덮지 않음', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'admin')
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let received = 0
  await page.route('**/api/products/901/features', async (route) => {
    received += 1
    await gate
    await route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') })
  })
  try {
    await page.goto('/admin')
    await page.locator('.table-row').filter({ hasText: '시험 탁주' }).getByRole('button', { name: '특성 편집', exact: true }).click()
    await expect.poll(() => received).toBe(1)
    await page.locator('.table-row').filter({ hasText: '시험 사케' }).getByRole('button', { name: '특성 편집', exact: true }).click()
    const form = page.getByRole('form', { name: '시험 사케 상품 특성' })
    await form.getByLabel('상품 설명', { exact: true }).fill('다른 상품 초안')
    const response = page.waitForResponse((result) => new URL(result.url()).pathname === '/api/products/901/features')
    release()
    await (await response).finished()
    await expect(form.getByLabel('상품 설명', { exact: true })).toHaveValue('다른 상품 초안')
    await expect(page.getByRole('heading', { name: '상품 특성을 불러오지 못했습니다' })).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
  } finally {
    release()
  }
})

test('편집 중 네트워크가 다시 연결돼도 상품 특성 초안을 유지', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'admin')
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let featureReads = 0
  await page.route('**/api/products/901/features', async (route) => {
    featureReads += 1
    if (featureReads > 1) await gate
    await route.fallback()
  })
  try {
    await page.goto('/admin')
    await page.locator('.table-row').filter({ hasText: '시험 탁주' }).getByRole('button', { name: '특성 편집', exact: true }).click()
    const form = page.getByRole('form', { name: '시험 탁주 상품 특성' })
    await form.getByLabel('상품 설명', { exact: true }).fill('연결이 바뀌어도 남을 초안')
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    const listResponse = page.waitForResponse((result) => new URL(result.url()).pathname === '/api/products' && result.request().method() === 'GET')
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await (await listResponse).finished()
    await expect(form.getByLabel('상품 설명', { exact: true })).toHaveValue('연결이 바뀌어도 남을 초안')
    expect(featureReads).toBe(1)
    expect(api.calls.filter((call) => call.method === 'PUT')).toHaveLength(0)
  } finally {
    release()
  }
})

test('기존 단일 태그의 내부 개행은 설명만 수정해도 그대로 보존', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'admin')
  api.features[901] = { ...unknownFeatures(901), tasteTags: ['owned\nfixture'], aromaTags: [], sourceName: '직접 작성한 검증 표본' }
  await page.goto('/admin')
  await page.locator('.table-row').filter({ hasText: '시험 탁주' }).getByRole('button', { name: '특성 편집', exact: true }).click()
  const form = page.getByRole('form', { name: '시험 탁주 상품 특성' })
  await form.getByLabel('상품 설명', { exact: true }).fill('태그를 바꾸지 않고 설명만 수정')
  await form.getByRole('button', { name: '특성 저장', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('시험 탁주 특성이 저장되었습니다.')
  expect(api.features[901].tasteTags).toEqual(['owned\nfixture'])
  expect(api.features[901].aromaTags).toEqual([])
})

for (const switchProduct of [false, true]) {
  test(`특성 저장 대기 중 ${switchProduct ? '다른 상품' : '현재 상품의 새'} 초안은 이전 성공과 분리`, async ({ page, api }) => {
    api.user = api.users.find((user) => user.id === 'admin')
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const submissions = []
    await page.route('**/api/admin/products/901/features', async (route) => {
      submissions.push(route.request().postDataJSON())
      await gate
      await route.fallback()
    })
    try {
      await page.goto('/admin')
      const firstTrigger = page.locator('.table-row').filter({ hasText: '시험 탁주' }).getByRole('button', { name: '특성 편집', exact: true })
      await firstTrigger.click()
      const first = page.getByRole('form', { name: '시험 탁주 상품 특성' })
      await first.getByLabel('상품 설명', { exact: true }).fill('먼저 저장할 설명')
      await first.getByLabel('출처명', { exact: true }).fill('자체 검증 근거')
      await first.getByRole('button', { name: '특성 저장', exact: true }).click()
      await expect.poll(() => submissions.length).toBe(1)
      await expect(firstTrigger).toBeDisabled()
      if (switchProduct)
        await page.locator('.table-row').filter({ hasText: '시험 사케' }).getByRole('button', { name: '특성 편집', exact: true }).click()
      const current = page.getByRole('form', { name: `${switchProduct ? '시험 사케' : '시험 탁주'} 상품 특성` })
      await current.getByLabel('상품 설명', { exact: true }).fill('아직 저장하지 않은 초안')
      release()
      await expect(page.getByRole('status')).toContainText('시험 탁주 특성이 저장되었습니다.')
      await expect(current.getByLabel('상품 설명', { exact: true })).toHaveValue('아직 저장하지 않은 초안')
      await expect(firstTrigger).toBeEnabled()
      expect(submissions).toHaveLength(1)
      expect(api.features[901].description).toBe('먼저 저장할 설명')
      expect(api.features[902]).toBeUndefined()
    } finally {
      release()
    }
  })
}

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

test('마이페이지에서 명시취향을 저장·재편집하고 건너뛰기와 초기화를 구분', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  await page.goto('/profile')
  await page.getByRole('link', { name: '내 취향 설정', exact: true }).click()
  await expect(page).toHaveURL('/preferences')
  const form = page.getByRole('form', { name: '내 취향 설정' })
  await expect(page.getByText('아직 입력하지 않음', { exact: true })).toBeVisible()
  await expect(form.getByLabel('최대 가격 (원)', { exact: true })).toHaveValue('')
  await form.getByLabel('주종 선호 상태').selectOption('tags')
  await form.getByRole('checkbox', { name: '탁주', exact: true }).check()
  await form.getByRole('checkbox', { name: '약 · 청주', exact: true }).check()
  await form.getByLabel('맛 태그 확인 상태').selectOption('tags')
  await form.getByLabel('맛 태그 1', { exact: true }).fill('OWNED\nFIXTURE')
  await form.getByLabel('향 태그 확인 상태').selectOption('empty')
  await form.getByLabel('선호 도수 (%)', { exact: true }).fill('80.25')
  await form.getByLabel('최소 가격 (원)', { exact: true }).fill('0')
  await form.getByLabel('최대 가격 (원)', { exact: true }).fill('0')
  await form.getByLabel('최소 도수 (%)', { exact: true }).fill('0')
  await form.getByLabel('최대 도수 (%)', { exact: true }).fill('10.5')
  await form.getByRole('button', { name: '취향 저장', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('취향이 저장되었습니다.')
  expect(api.preferences.member).toEqual({ surveyStatus: 'COMPLETED', softPreferences: { categories: ['약 · 청주', '탁주'], tasteTags: ['owned\nfixture'], aromaTags: [], targetAbvPercent: 80.25 }, hardConstraints: { minPriceKrw: 0, maxPriceKrw: 0, minAbvPercent: 0, maxAbvPercent: 10.5 } })
  const saved = api.calls.find((call) => call.method === 'PUT' && call.path === '/users/me/preferences')
  expect(Object.keys(saved.body)).toEqual(['surveyStatus', 'softPreferences', 'hardConstraints'])
  await page.reload()
  await expect(form.getByLabel('선호 도수 (%)', { exact: true })).toHaveValue('80.25')
  await expect(form.getByLabel('맛 태그 1', { exact: true })).toHaveValue('owned\nfixture')
  await expect(form.getByLabel('최대 가격 (원)', { exact: true })).toHaveValue('0')
  await form.getByLabel('최소 가격 (원)', { exact: true }).fill('100')
  await form.getByRole('button', { name: '이번에는 건너뛰기', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '취소', exact: true }).click()
  await expect(form.getByLabel('최소 가격 (원)', { exact: true })).toHaveValue('100')
  await form.getByRole('button', { name: '이번에는 건너뛰기', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '건너뛰기', exact: true }).click()
  await expect(page.getByText('건너뜀', { exact: true })).toBeVisible()
  expect(api.preferences.member).toEqual(emptyPreference('SKIPPED'))
  await expect(form.getByLabel('최대 가격 (원)', { exact: true })).toHaveValue('')
  await form.getByRole('button', { name: '저장값 초기화', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '초기화', exact: true }).click()
  await expect(page.getByText('아직 입력하지 않음', { exact: true })).toBeVisible()
  expect(api.preferences.member).toEqual(emptyPreference())
  await form.getByLabel('주종 선호 상태').selectOption('empty')
  await form.getByRole('button', { name: '취향 저장', exact: true }).click()
  await expect(page.getByText('입력 완료', { exact: true })).toBeVisible()
  expect(api.preferences.member.softPreferences.categories).toEqual([])
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('취향 읽기 실패에는 저장을 열지 않고 쓰기 오류 뒤에도 입력을 보존', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  let reads = 0
  let writes = 0
  await page.route('**/api/users/me/preferences', async (route) => {
    if (route.request().method() === 'GET' && ++reads === 1) return route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') })
    if (route.request().method() === 'PUT' && ++writes === 1) return route.fulfill({ status: 400, json: { data: null, message: null, error: { code: 'VALIDATION_FAILED', message: 'invalid', fields: { targetAbvPercent: '선호 도수를 다시 확인해 주세요.' } } } })
    await route.fallback()
  })
  await page.goto('/preferences')
  await expect(page.getByRole('heading', { name: '취향을 불러오지 못했습니다' })).toBeVisible()
  await expect(page.getByRole('button', { name: '취향 저장', exact: true })).toHaveCount(0)
  expect(writes).toBe(0)
  await page.getByRole('button', { name: '취향 다시 불러오기', exact: true }).click()
  const form = page.getByRole('form', { name: '내 취향 설정' })
  await form.getByLabel('선호 도수 (%)', { exact: true }).fill('35.25')
  await form.getByRole('button', { name: '취향 저장', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('선호 도수를 다시 확인해 주세요.')
  await expect(form.getByLabel('선호 도수 (%)', { exact: true })).toHaveValue('35.25')
  expect(api.preferences.member).toBeUndefined()
  await form.getByRole('button', { name: '취향 저장', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('취향이 저장되었습니다.')
  expect(writes).toBe(2)
})

test('취향 저장 대기 중 새 입력과 재연결은 현재 초안을 바꾸지 않음', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const submissions = []
  await page.route('**/api/users/me/preferences', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    submissions.push(route.request().postDataJSON())
    await gate
    await route.fallback()
  })
  try {
    await page.goto('/preferences')
    const form = page.getByRole('form', { name: '내 취향 설정' })
    await form.getByLabel('선호 도수 (%)', { exact: true }).fill('10')
    await form.getByRole('button', { name: '취향 저장', exact: true }).click()
    await expect.poll(() => submissions.length).toBe(1)
    await expect(form.getByRole('button', { name: '취향 저장', exact: true })).toBeDisabled()
    await form.getByLabel('선호 도수 (%)', { exact: true }).fill('20')
    await page.evaluate(() => { window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online')) })
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expect(form.getByLabel('선호 도수 (%)', { exact: true })).toHaveValue('20')
    release()
    await expect(page.getByRole('status')).toContainText('취향이 저장되었습니다.')
    await expect(form.getByLabel('선호 도수 (%)', { exact: true })).toHaveValue('20')
    expect(api.preferences.member.softPreferences.targetAbvPercent).toBe(10)
    expect(submissions).toHaveLength(1)
    expect(api.calls.filter((call) => call.method === 'GET' && call.path === '/users/me/preferences')).toHaveLength(1)
  } finally { release() }
})

for (const { method, status } of [{ method: 'GET', status: 200 }, { method: 'PUT', status: 200 }, { method: 'PUT', status: 401 }]) {
  test(`이전 계정의 늦은 취향 ${method} ${status} 결과가 새 계정에 섞이지 않음`, async ({ page, api }) => {
    api.user = api.users.find((user) => user.id === 'member')
    const old = emptyPreference('COMPLETED')
    old.softPreferences.tasteTags = ['old-account-private-fixture']
    let release
    const gate = new Promise((resolve) => { release = resolve })
    let held = false
    await page.route('**/api/users/me/preferences', async (route) => {
      if (route.request().method() !== method || held) return route.fallback()
      held = true
      await gate
      if (method === 'PUT' && status === 200) api.preferences.member = old
      await route.fulfill({ status, json: status === 200 ? success(old) : failure('UNAUTHORIZED') })
    })
    try {
      await page.goto('/preferences')
      if (method === 'PUT') {
        await page.getByLabel('선호 도수 (%)', { exact: true }).fill('10')
        await page.getByRole('button', { name: '취향 저장', exact: true }).click()
      }
      await expect.poll(() => held).toBe(true)
      await page.getByRole('link', { name: '마이페이지', exact: true }).click()
      await page.getByRole('button', { name: '로그아웃', exact: true }).click()
      await page.getByRole('link', { name: '로그인', exact: true }).click()
      await page.getByLabel('아이디', { exact: true }).fill('other')
      await page.getByLabel('비밀번호', { exact: true }).fill('fixture-password')
      await page.locator('.auth-form').getByRole('button', { name: '로그인', exact: true }).click()
      await page.getByRole('link', { name: '내 취향 설정', exact: true }).click()
      const form = page.getByRole('form', { name: '내 취향 설정' })
      await form.getByLabel('선호 도수 (%)', { exact: true }).fill('25')
      const response = page.waitForResponse((result) => new URL(result.url()).pathname === '/api/users/me/preferences' && result.request().method() === method)
      release()
      await (await response).finished()
      await expect(form.getByLabel('선호 도수 (%)', { exact: true })).toHaveValue('25')
      await expect(page.getByText('old-account-private-fixture')).toHaveCount(0)
      await expect(page.getByRole('status').filter({ hasText: '취향이 저장되었습니다.' })).toHaveCount(0)
      await expect(page.getByRole('alert')).toHaveCount(0)
      expect(api.preferences.other).toBeUndefined()
      await expect(page.getByText('아직 입력하지 않음', { exact: true })).toBeVisible()
    } finally { release() }
  })
}

test('취향 저장 중 같은 경로에 재진입하면 완료 뒤 최신값을 읽고 편집', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let writes = 0
  await page.route('**/api/users/me/preferences', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    writes += 1
    await gate
    await route.fallback()
  })
  try {
    await page.goto('/preferences')
    await page.getByLabel('선호 도수 (%)', { exact: true }).fill('12.5')
    await page.getByRole('button', { name: '취향 저장', exact: true }).click()
    await expect.poll(() => writes).toBe(1)
    await page.getByRole('link', { name: '마이페이지', exact: true }).click()
    await page.getByRole('link', { name: '내 취향 설정', exact: true }).click()
    await expect(page.getByRole('form', { name: '내 취향 설정' })).toHaveCount(0)
    expect(api.calls.filter((call) => call.method === 'GET' && call.path === '/users/me/preferences')).toHaveLength(1)
    release()
    await expect(page.getByLabel('선호 도수 (%)', { exact: true })).toHaveValue('12.5')
    expect(writes).toBe(1)
    expect(api.calls.filter((call) => call.method === 'GET' && call.path === '/users/me/preferences')).toHaveLength(2)
  } finally { release() }
})

test('취향 저장 중 같은 계정으로 다시 로그인해도 완료 뒤 최신값으로 편집', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let writes = 0
  await page.route('**/api/users/me/preferences', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    writes += 1
    await gate
    await route.fallback()
  })
  try {
    await page.goto('/preferences')
    await page.getByLabel('선호 도수 (%)', { exact: true }).fill('12.5')
    await page.getByRole('button', { name: '취향 저장', exact: true }).click()
    await expect.poll(() => writes).toBe(1)
    await page.getByRole('link', { name: '마이페이지', exact: true }).click()
    await page.getByRole('button', { name: '로그아웃', exact: true }).click()
    await page.getByRole('link', { name: '로그인', exact: true }).click()
    await page.getByLabel('아이디', { exact: true }).fill('member')
    await page.getByLabel('비밀번호', { exact: true }).fill('fixture-password')
    await page.locator('.auth-form').getByRole('button', { name: '로그인', exact: true }).click()
    await page.getByRole('link', { name: '내 취향 설정', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('form[aria-label="내 취향 설정"]') || document.querySelector('[role="status"][aria-label="진행 중인 취향 저장을 기다리는 중입니다."]'))
    const premature = await page.getByRole('form', { name: '내 취향 설정' }).isVisible()
    if (premature) await expect(page.getByLabel('선호 도수 (%)', { exact: true })).toHaveValue('')
    const response = page.waitForResponse((result) => new URL(result.url()).pathname === '/api/users/me/preferences' && result.request().method() === 'PUT')
    release()
    await (await response).finished()
    await expect.poll(() => api.preferences.member?.softPreferences.targetAbvPercent).toBe(12.5)
    await expect(page.getByLabel('선호 도수 (%)', { exact: true })).toHaveValue('12.5')
    expect(premature).toBe(false)
    expect(writes).toBe(1)
    expect(api.calls.filter((call) => call.method === 'GET' && call.path === '/users/me/preferences')).toHaveLength(2)
    await expect(page.getByRole('status').filter({ hasText: '취향이 저장되었습니다.' })).toHaveCount(0)
  } finally { release() }
})

test('비회원은 취향 API를 읽지 않고 원래 취향 경로로 로그인 복귀', async ({ page, api }) => {
  await page.goto('/preferences')
  await expect(page).toHaveURL((url) => url.pathname === '/account' && url.searchParams.get('redirect') === '/preferences')
  expect(api.calls.some((call) => call.path === '/users/me/preferences')).toBe(false)
})

test('취향 API의 만료 응답은 기본값으로 저장하지 않고 다시 로그인으로 연결', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  await page.route('**/api/users/me/preferences', (route) => route.fulfill({ status: 401, json: failure('UNAUTHORIZED') }))
  await page.goto('/preferences')
  await expect(page).toHaveURL((url) => url.pathname === '/account' && url.searchParams.get('redirect') === '/preferences')
  await expect(page.getByRole('button', { name: '취향 저장', exact: true })).toHaveCount(0)
  expect(api.calls.filter((call) => call.method === 'PUT')).toHaveLength(0)
})

test('외부 연결 상태와 무관하게 로컬 취향 API의 실제 전송 결과로 복구', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  let writes = 0
  await page.route('**/api/users/me/preferences', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    writes += 1
    await route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') })
  })
  await page.goto('/preferences')
  await page.getByLabel('선호 도수 (%)', { exact: true }).fill('12.5')
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await page.getByRole('button', { name: '취향 저장', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: '취향 저장', exact: true })).toBeEnabled()
  await expect(page.getByLabel('선호 도수 (%)', { exact: true })).toHaveValue('12.5')
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(writes).toBe(1)
  expect(api.preferences.member).toBeUndefined()
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

for (const viewport of [{ name: '일반', width: 1280, height: 900 }, { name: '좁은 웹', width: 390, height: 844 }]) {
  test(`${viewport.name} 화면의 삭제 처리 중에도 키보드 포커스는 확인창 안에 유지`, async ({ page, api }) => {
    api.user = api.users.find((user) => user.id === 'admin')
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    let release
    const gate = new Promise((resolve) => { release = resolve })
    let attempts = 0
    await page.route('**/api/admin/products/901', async (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback()
      attempts += 1
      await gate
      await route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') })
    })
    try {
      await page.goto('/admin')
      const trigger = page.locator('.table-row').filter({ hasText: '시험 탁주' }).getByRole('button', { name: '삭제', exact: true })
      await trigger.click()
      const dialog = page.getByRole('alertdialog')
      await expect(dialog).toBeFocused()
      await page.keyboard.press('Shift+Tab')
      await expect(dialog.getByRole('button', { name: '삭제', exact: true })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect.poll(() => attempts).toBe(1)
      await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeDisabled()
      await page.keyboard.press('Tab')
      await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
      await page.keyboard.press('Shift+Tab')
      await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
      await page.keyboard.press('Escape')
      await expect(dialog).toBeVisible()
      const response = page.waitForResponse((result) => new URL(result.url()).pathname === '/api/admin/products/901')
      release()
      await (await response).finished()
      await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeEnabled()
      await page.keyboard.press('Tab')
      await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeFocused()
      await page.keyboard.press('Shift+Tab')
      await expect(dialog.getByRole('button', { name: '삭제', exact: true })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await expect(trigger).toBeFocused()
      expect(attempts).toBe(1)
      expect(api.catalog.some((product) => product.id === 901)).toBe(true)
    } finally {
      release()
    }
  })
}

async function loginFavoriteAccount(page, id) {
  await page.getByRole('link', { name: '로그인', exact: true }).click()
  await page.getByLabel('아이디', { exact: true }).fill(id)
  await page.getByLabel('비밀번호', { exact: true }).fill('fixture-password')
  await page.locator('.auth-form').getByRole('button', { name: '로그인', exact: true }).click()
  await page.getByRole('link', { name: '내 찜 목록', exact: true }).click()
}

test('본인 찜 목록은 최근 담은 순서·현재 상품 정보와 링크를 표시하고 해제 뒤 빈 목록으로 복구', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  api.favorites.member = [902, 901]
  api.catalog[1].price = 13000
  await page.goto('/profile')
  await page.getByRole('link', { name: '내 찜 목록', exact: true }).click()
  await expect(page.getByRole('heading', { name: '내 찜 목록', exact: true })).toBeVisible()
  await expect(page.locator('.favorite-item h2')).toHaveText(['시험 사케', '시험 탁주'])
  await expect(page.locator('.favorite-item').first()).toContainText('13,000원')
  await page.locator('.favorite-item').first().getByRole('heading').getByRole('link').click()
  await expect(page).toHaveURL('/products/902')
  await expect(page.getByRole('heading', { name: '시험 사케', level: 1, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '시험 사케 찜 해제', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.goBack()
  await page.getByRole('button', { name: '시험 사케 찜 해제', exact: true }).click()
  await expect(page.locator('.favorite-item')).toHaveCount(1)
  await page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true }).click()
  await expect(page.getByRole('heading', { name: '아직 찜한 상품이 없습니다' })).toBeVisible()
  await expect(page.getByRole('link', { name: '주류 둘러보기', exact: true })).toHaveAttribute('href', '/products')
  expect(api.favorites.member).toEqual([])
  const listGets = api.calls.filter((call) => call.path === '/users/me/favorites' && call.method === 'GET')
  expect(listGets.length).toBeGreaterThan(0)
  expect(listGets.every((call) => call.query.size === '12')).toBe(true)
  expect(api.calls).toContainEqual(expect.objectContaining({ method: 'GET', path: '/users/me/favorites/902', query: {} }))
})

test('찜 페이지는 필요한 열두 상품만 읽고 마지막 항목 해제·상품 삭제 뒤 유효한 페이지로 이동', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  api.catalog = Array.from({ length: 14 }, (_, index) => ({ ...products[0], id: 1000 + index, name: `찜 시연 ${index}` }))
  api.favorites.member = api.catalog.map((item) => item.id).reverse()
  await page.goto('/favorites?page=2')
  await expect(page.locator('.favorite-item')).toHaveCount(2)
  await expect(page.locator('.favorite-item h2')).toHaveText(['찜 시연 1', '찜 시연 0'])
  expect(api.calls.filter((call) => call.path === '/users/me/favorites')).toEqual([expect.objectContaining({ query: { page: '2', size: '12' } })])
  api.catalog = api.catalog.filter((item) => item.id !== 1001)
  await page.getByRole('button', { name: '찜 시연 1 찜 해제', exact: true }).click()
  await expect(page.locator('.favorite-item')).toHaveCount(1)
  await page.getByRole('button', { name: '찜 시연 0 찜 해제', exact: true }).click()
  await expect(page).toHaveURL('/favorites?page=1')
  await expect(page.locator('.favorite-item')).toHaveCount(12)
  await expect(page.getByRole('heading', { name: '아직 찜한 상품이 없습니다' })).toHaveCount(0)
  expect(api.calls.filter((call) => call.path === '/users/me/favorites').every((call) => call.query.size === '12')).toBe(true)
})

test('비회원 찜 목록은 API를 읽지 않고 목적지를 보존하며 조회 실패는 빈 목록으로 표시하지 않음', async ({ page, api }) => {
  await page.goto('/favorites?page=2')
  await expect(page).toHaveURL((url) => url.pathname === '/account' && url.searchParams.get('redirect') === '/favorites?page=2')
  expect(api.calls.some((call) => call.path === '/users/me/favorites')).toBe(false)
  api.user = api.users.find((user) => user.id === 'member')
  let failed = true
  await page.route('**/api/users/me/favorites?*', (route) => failed ? route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') }) : route.fallback())
  await page.goto('/favorites')
  await expect(page.getByRole('heading', { name: '찜 목록을 불러오지 못했습니다' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '아직 찜한 상품이 없습니다' })).toHaveCount(0)
  failed = false
  await page.getByRole('button', { name: '찜 다시 불러오기' }).click()
  await expect(page.getByRole('heading', { name: '아직 찜한 상품이 없습니다' })).toBeVisible()
})

for (const status of [200, 401]) {
  test(`이전 계정의 늦은 찜 해제 ${status}가 새 계정의 목록·세션을 바꾸지 않음`, async ({ page, api }) => {
    api.user = api.users.find((user) => user.id === 'member')
    api.favorites.member = [901]
    api.favorites.other = [902]
    let release
    const gate = new Promise((resolve) => { release = resolve })
    let attempts = 0
    await page.route('**/api/users/me/favorites/901', async (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback()
      attempts += 1
      await gate
      if (status === 200) api.favorites.member = []
      await route.fulfill({ status, json: status === 200 ? success({ productId: 901, favorited: false }) : failure('UNAUTHORIZED') })
    })
    try {
      await page.goto('/favorites')
      await page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true }).click()
      await expect.poll(() => attempts).toBe(1)
      await expect(page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true })).toBeDisabled()
      await page.getByRole('button', { name: '로그아웃', exact: true }).click()
      await loginFavoriteAccount(page, 'other')
      await expect(page.locator('.favorite-item h2')).toHaveText(['시험 사케'])
      const response = page.waitForResponse((result) => new URL(result.url()).pathname === '/api/users/me/favorites/901' && result.request().method() === 'DELETE')
      release()
      await (await response).finished()
      // A subsequent visible user operation also crosses the old response callback boundary.
      await page.getByRole('button', { name: '찜 목록 새로고침' }).click()
      await expect(page.locator('.favorite-item h2')).toHaveText(['시험 사케'])
      await expect(page.getByText('다른회원님', { exact: true })).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(0)
      await expect(page.getByRole('status').filter({ hasText: '찜을 해제했습니다.' })).toHaveCount(0)
      expect(api.favorites.other).toEqual([902])
      expect(attempts).toBe(1)
    } finally { release() }
  })
}

test('진행 중 찜 해제는 중복 전송을 막고 같은 계정 재로그인 뒤 새 읽기까지 기다림', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  api.favorites.member = [901]
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let attempts = 0
  await page.route('**/api/users/me/favorites/901', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    attempts += 1
    await gate
    api.favorites.member = []
    await route.fulfill({ json: success({ productId: 901, favorited: false }) })
  })
  try {
    await page.goto('/favorites')
    const remove = page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true })
    await remove.focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => attempts).toBe(1)
    await expect(remove).toBeDisabled()
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: '로그아웃', exact: true }).click()
    await loginFavoriteAccount(page, 'member')
    await expect(page.getByRole('status', { name: '진행 중인 찜 저장을 기다리는 중입니다.' })).toBeVisible()
    await expect(page.locator('.favorite-item')).toHaveCount(0)
    expect(api.calls.filter((call) => call.path === '/users/me/favorites')).toHaveLength(1)
    const response = page.waitForResponse((result) => new URL(result.url()).pathname === '/api/users/me/favorites/901' && result.request().method() === 'DELETE')
    release()
    await (await response).finished()
    await expect(page.getByRole('heading', { name: '아직 찜한 상품이 없습니다' })).toBeVisible()
    expect(api.calls.filter((call) => call.path === '/users/me/favorites')).toHaveLength(2)
    expect(attempts).toBe(1)
    await expect(page.getByRole('status').filter({ hasText: '찜을 해제했습니다.' })).toHaveCount(0)
  } finally { release() }
})

test('찜 해제 뒤 늦은 이전 목록 GET이 삭제 상품을 되살리지 않음', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  api.favorites.member = [901, 902]
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let armed = false
  let held = false
  await page.route('**/api/users/me/favorites?*', async (route) => {
    if (!armed || held) return route.fallback()
    held = true
    const snapshot = products.map((item) => ({ ...item }))
    await gate
    await route.fulfill({ json: success(pageOf(snapshot)) })
  })
  try {
    await page.goto('/favorites')
    await expect(page.locator('.favorite-item')).toHaveCount(2)
    armed = true
    await page.getByRole('button', { name: '찜 목록 새로고침' }).click()
    await expect.poll(() => held).toBe(true)
    await page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true }).click()
    await expect(page.locator('.favorite-item h2')).toHaveText(['시험 사케'])
    const response = page.waitForResponse((result) => new URL(result.url()).pathname === '/api/users/me/favorites' && result.request().method() === 'GET')
    release()
    await (await response).finished()
    await expect(page.locator('.favorite-item h2')).toHaveText(['시험 사케'])
    await expect(page.getByText('총 1개', { exact: true })).toBeVisible()
  } finally { release() }
})

test('찜 해제 실패는 항목을 보존하고 재연결 재전송 없이 명시적 재시도만 허용', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  api.favorites.member = [901]
  let attempts = 0
  let failed = true
  await page.route('**/api/users/me/favorites/901', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    attempts += 1
    if (failed) await route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') })
    else await route.fallback()
  })
  await page.goto('/favorites')
  // 초기 읽기가 끝난 항목의 쓰기 실패를 검증하므로 로드 전에 offline을 주입하지 않는다.
  const remove = page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true })
  await expect(remove).toBeVisible()
  await expect(remove).toBeEnabled()
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await remove.click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '찜 목록 새로고침' }).click()
  await expect(page.locator('.favorite-item')).toHaveCount(1)
  expect(attempts).toBe(1)
  failed = false
  await page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true }).click()
  await expect(page.getByRole('heading', { name: '아직 찜한 상품이 없습니다' })).toBeVisible()
  expect(attempts).toBe(2)
})

test('본인 찜 조회 401은 목록을 숨기고 현재 목적지로 다시 로그인하게 함', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  await page.route('**/api/users/me/favorites?*', (route) => route.fulfill({ status: 401, json: failure('UNAUTHORIZED') }))
  await page.goto('/favorites?page=2')
  await expect(page).toHaveURL((url) => url.pathname === '/account' && url.searchParams.get('redirect') === '/favorites?page=2')
  await expect(page.locator('.favorite-item')).toHaveCount(0)
})

test('상세의 단건 찜 토글은 목록 전체 조회 없이 저장·해제하고 새로고침과 좁은 화면에서도 보존', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  await page.goto('/products')
  await expect(page.locator('.product-card')).toHaveCount(2)
  expect(api.calls.some((call) => call.path.startsWith('/users/me/favorites'))).toBe(false)
  await page.getByRole('heading', { name: '시험 탁주', exact: true }).getByRole('link').click()
  const add = page.getByRole('button', { name: '시험 탁주 찜하기', exact: true })
  await expect(add).toHaveAttribute('aria-pressed', 'false')
  await add.focus()
  await page.keyboard.press('Enter')
  const remove = page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true })
  await expect(remove).toHaveAttribute('aria-pressed', 'true')
  expect(api.favorites.member).toEqual([901])
  expect(api.calls.some((call) => call.path === '/users/me/favorites')).toBe(false)
  await page.reload()
  await expect(remove).toHaveAttribute('aria-pressed', 'true')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await remove.click()
  await expect(add).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('link', { name: '내 찜 목록', exact: true }).click()
  await expect(page.getByRole('heading', { name: '아직 찜한 상품이 없습니다' })).toBeVisible()
  expect(api.calls.filter((call) => ['PUT', 'DELETE'].includes(call.method) && call.path === '/users/me/favorites/901').map((call) => [call.method, call.body])).toEqual([['PUT', null], ['DELETE', null]])
})

test('상세 찜 상태는 첫 페이지 밖에 있는 상품도 단건 GET으로 확인하고 조회 실패를 미등록으로 추정하지 않음', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  api.catalog.push(...Array.from({ length: 13 }, (_, index) => ({ ...products[1], id: 1000 + index, name: `추가 시연 ${index}` })))
  api.favorites.member = [...api.catalog.filter((item) => item.id !== 901).map((item) => item.id), 901]
  let failed = true
  await page.route('**/api/users/me/favorites/901', (route) => route.request().method() === 'GET' && failed ? route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') }) : route.fallback())
  await page.goto('/products/901')
  await expect(page.getByText('찜 상태를 확인하지 못했습니다.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '시험 탁주 찜하기', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true })).toHaveCount(0)
  failed = false
  await page.getByRole('button', { name: '찜 상태 다시 확인', exact: true }).click()
  await expect(page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(api.calls.some((call) => call.path === '/users/me/favorites')).toBe(false)
  expect(api.calls.some((call) => call.method === 'PUT')).toBe(false)
})

test('찜 저장 중 반대 의도·중복 전송을 차단하고 동일 계정 재로그인 후 서버 확정을 다시 읽음', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let attempts = 0
  await page.route('**/api/users/me/favorites/901', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    attempts += 1
    await gate
    api.favorites.member = [901]
    await route.fulfill({ json: success({ productId: 901, favorited: true }) })
  })
  try {
    await page.goto('/products/901')
    const add = page.getByRole('button', { name: '시험 탁주 찜하기', exact: true })
    await add.click()
    await expect.poll(() => attempts).toBe(1)
    await expect(add).toBeDisabled()
    await expect(page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true })).toHaveCount(0)
    await add.evaluate((button) => button.click())
    await page.getByRole('button', { name: '로그아웃', exact: true }).click()
    await loginFavoriteAccount(page, 'member')
    await expect(page.getByRole('status', { name: '진행 중인 찜 저장을 기다리는 중입니다.' })).toBeVisible()
    await expect(page.locator('.favorite-item')).toHaveCount(0)
    expect(api.calls.some((call) => call.path === '/users/me/favorites')).toBe(false)
    const response = page.waitForResponse((result) => new URL(result.url()).pathname === '/api/users/me/favorites/901' && result.request().method() === 'PUT')
    release()
    await (await response).finished()
    await expect(page.locator('.favorite-item h2')).toHaveText(['시험 탁주'])
    expect(attempts).toBe(1)
    await expect(page.getByRole('status').filter({ hasText: '찜에 저장했습니다.' })).toHaveCount(0)
    await page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true }).click()
    await expect(page.getByRole('heading', { name: '아직 찜한 상품이 없습니다' })).toBeVisible()
    expect(api.favorites.member).toEqual([])
  } finally { release() }
})

test('비회원 상세는 찜 API를 호출하지 않고 상세 목적지를 가진 로그인 진입만 제공', async ({ page, api }) => {
  await page.goto('/products/901')
  await expect(page.getByRole('link', { name: '로그인하고 찜하기', exact: true })).toHaveAttribute('href', '/account?redirect=%2Fproducts%2F901')
  expect(api.calls.some((call) => call.path.startsWith('/users/me/favorites'))).toBe(false)
  await page.getByRole('link', { name: '로그인하고 찜하기', exact: true }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/account' && url.searchParams.get('redirect') === '/products/901')
})

for (const status of [200, 401]) {
  test(`이전 계정의 늦은 찜 상태 GET ${status}가 새 계정 상세에 섞이지 않음`, async ({ page, api }) => {
    api.user = api.users.find((user) => user.id === 'member')
    let release
    const gate = new Promise((resolve) => { release = resolve })
    let held = false
    await page.route('**/api/users/me/favorites/901', async (route) => {
      if (route.request().method() !== 'GET' || held) return route.fallback()
      held = true
      await gate
      await route.fulfill({ status, json: status === 200 ? success({ productId: 901, favorited: true }) : failure('UNAUTHORIZED') })
    })
    try {
      await page.goto('/products/901')
      await expect.poll(() => held).toBe(true)
      await page.getByRole('button', { name: '로그아웃', exact: true }).click()
      await loginFavoriteAccount(page, 'other')
      await page.getByRole('link', { name: '주류 둘러보기', exact: true }).click()
      await page.getByRole('heading', { name: '시험 탁주', exact: true }).getByRole('link').click()
      await expect(page.getByRole('button', { name: '시험 탁주 찜하기', exact: true })).toHaveAttribute('aria-pressed', 'false')
      const response = page.waitForResponse((result) => new URL(result.url()).pathname === '/api/users/me/favorites/901' && result.request().method() === 'GET')
      release()
      await (await response).finished()
      await page.getByRole('link', { name: '내 찜 목록', exact: true }).click()
      await expect(page.getByRole('heading', { name: '아직 찜한 상품이 없습니다' })).toBeVisible()
      await expect(page.getByText('다른회원님', { exact: true })).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(0)
    } finally { release() }
  })
}

test('찜 저장 응답이 실패해도 실제 서버 상태를 다시 읽고 중복 PUT을 자동 재전송하지 않음', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  let writes = 0
  await page.route('**/api/users/me/favorites/901', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    writes += 1
    api.favorites.member = [901]
    await route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') })
  })
  await page.goto('/products/901')
  await page.getByRole('button', { name: '시험 탁주 찜하기', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.evaluate(() => { window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online')) })
  await page.getByRole('link', { name: '내 찜 목록', exact: true }).click()
  await expect(page.locator('.favorite-item h2')).toHaveText(['시험 탁주'])
  expect(writes).toBe(1)
})

test('삭제된 상품의 찜 PUT 거절은 저장 성공으로 표시하지 않고 관리자도 자기 계정만 사용', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'admin')
  api.favorites.member = [901]
  await page.route('**/api/users/me/favorites/901', (route) => route.request().method() === 'PUT' ? route.fulfill({ status: 404, json: failure('NOT_FOUND') }) : route.fallback())
  await page.goto('/products/901')
  await expect(page.getByRole('button', { name: '시험 탁주 찜하기', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: '시험 탁주 찜하기', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: '시험 탁주 찜하기', exact: true })).toBeEnabled()
  await expect(page.getByRole('status').filter({ hasText: '찜에 저장했습니다.' })).toHaveCount(0)
  expect(api.favorites.admin).toBeUndefined()
  expect(api.favorites.member).toEqual([901])
})

for (const width of [1280, 390]) {
  test(`찜 해제 이후 ${width}px 목록에서 다음 상품 해제로 키보드 포커스를 이어감`, async ({ page, api }) => {
    api.user = api.users.find((user) => user.id === 'member')
    api.favorites.member = [901, 902]
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/favorites')
    await page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.favorite-item h2')).toHaveText(['시험 사케'])
    await expect(page.getByRole('button', { name: '시험 사케 찜 해제', exact: true })).toBeFocused()
  })
}

test('찜 해제 이후 마지막 상품이 없어지면 둘러보기로 키보드 포커스를 이어감', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  api.favorites.member = [901]
  await page.goto('/favorites')
  await page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: '아직 찜한 상품이 없습니다' })).toBeVisible()
  await expect(page.getByRole('link', { name: '주류 둘러보기', exact: true })).toBeFocused()
})

test('찜 해제 이후 마지막 페이지 보정에서도 남은 상품으로 키보드 포커스를 이어감', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  api.catalog = Array.from({ length: 13 }, (_, index) => ({ ...products[0], id: 1000 + index, name: `포커스 시연 ${index}` }))
  api.favorites.member = api.catalog.map((item) => item.id).reverse()
  await page.goto('/favorites?page=2')
  await page.getByRole('button', { name: '포커스 시연 0 찜 해제', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/favorites?page=1')
  await expect(page.locator('.favorite-item')).toHaveCount(12)
  await expect(page.getByRole('button', { name: '포커스 시연 12 찜 해제', exact: true })).toBeFocused()
})

test('찜 해제 이후 권위 조회가 실패하면 재조회 버튼으로 키보드 포커스를 이어감', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  api.favorites.member = [901]
  let reads = 0
  await page.route('**/api/users/me/favorites?*', (route) => ++reads === 1 ? route.fallback() : route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') }))
  await page.goto('/favorites')
  await page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: '찜 목록을 불러오지 못했습니다' })).toBeVisible()
  await expect(page.getByRole('button', { name: '찜 다시 불러오기', exact: true })).toBeFocused()
})

test('찜 해제 이후 쓰기가 거절되면 보존된 같은 상품으로 키보드 포커스를 이어감', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  api.favorites.member = [901]
  await page.route('**/api/users/me/favorites/901', (route) => route.request().method() === 'DELETE' ? route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') }) : route.fallback())
  await page.goto('/favorites')
  await page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('alert')).toBeVisible()
  const retry = page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true })
  await expect(retry).toBeEnabled()
  await expect(retry).toBeFocused()
})

test('찜 목록 마지막 행 해제 후에는 이전 행으로 포커스를 이어감', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  api.favorites.member = [901, 902]
  await page.goto('/favorites')
  await page.getByRole('button', { name: '시험 사케 찜 해제', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.favorite-item h2')).toHaveText(['시험 탁주'])
  await expect(page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true })).toBeFocused()
})

test('찜 응답을 기다리다 Tab으로 이동한 사용자의 포커스를 돌려 빼앗지 않음', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  api.favorites.member = [901, 902]
  let release
  const gate = new Promise((resolve) => { release = resolve })
  await page.route('**/api/users/me/favorites/901', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    await gate
    api.favorites.member = [902]
    await route.fulfill({ json: success({ productId: 901, favorited: false }) })
  })
  try {
    await page.goto('/favorites')
    await page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: '내 찜 목록', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    const profile = page.getByRole('link', { name: '마이페이지', exact: true })
    await expect(profile).toBeFocused()
    release()
    await expect(page.locator('.favorite-item h2')).toHaveText(['시험 사케'])
    await expect(profile).toBeFocused()
    await expect(page.getByRole('button', { name: '시험 사케 찜 해제', exact: true })).not.toBeFocused()
  } finally { release() }
})

test('찜 해제 중 화면을 떠나 새로 진입하면 이전 화면의 포커스 의도를 가져오지 않음', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  api.favorites.member = [901, 902]
  let release
  const gate = new Promise((resolve) => { release = resolve })
  await page.route('**/api/users/me/favorites/901', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    await gate
    api.favorites.member = [902]
    await route.fulfill({ json: success({ productId: 901, favorited: false }) })
  })
  try {
    await page.goto('/favorites')
    await page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: '내 찜 목록', exact: true })).toBeFocused()
    await page.getByRole('link', { name: '마이페이지', exact: true }).click()
    await page.getByRole('link', { name: '내 찜 목록', exact: true }).click()
    await expect(page.getByRole('button', { name: '시험 탁주 찜 해제', exact: true })).toBeDisabled()
    release()
    await expect(page.locator('.favorite-item h2')).toHaveText(['시험 사케'])
    await expect(page.getByRole('button', { name: '시험 사케 찜 해제', exact: true })).not.toBeFocused()
  } finally { release() }
})

test('목록 아래에서 찜 해제를 시작해도 임시 포커스가 화면을 위로 끌어올리지 않음', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  api.catalog = Array.from({ length: 12 }, (_, index) => ({ ...products[0], id: 1000 + index, name: `스크롤 시연 ${index}` }))
  api.favorites.member = api.catalog.map((item) => item.id)
  let release
  const gate = new Promise((resolve) => { release = resolve })
  await page.route('**/api/users/me/favorites/1011', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    await gate
    api.favorites.member = api.favorites.member.filter((id) => id !== 1011)
    await route.fulfill({ json: success({ productId: 1011, favorited: false }) })
  })
  try {
    await page.setViewportSize({ width: 1280, height: 600 })
    await page.goto('/favorites')
    const remove = page.getByRole('button', { name: '스크롤 시연 11 찜 해제', exact: true })
    await remove.scrollIntoViewIfNeeded()
    await remove.focus()
    const before = await page.evaluate(() => scrollY)
    expect(before).toBeGreaterThan(0)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: '내 찜 목록', exact: true })).toBeFocused()
    expect(await page.evaluate(() => scrollY)).toBe(before)
    release()
    await expect(page.getByRole('button', { name: '스크롤 시연 10 찜 해제', exact: true })).toBeFocused()
  } finally { release() }
})

for (const source of ['BASELINE', 'FALLBACK']) {
  test(`공개 기본 목록은 ${source} 성공에서 현재 상품을 보여주며 출처 코드를 제품화하지 않음`, async ({ page, api }) => {
    api.defaultSource = source
    await page.goto('/discover')
    await expect(page.getByRole('heading', { name: '기본 주류 둘러보기', exact: true })).toBeVisible()
    await expect(page.locator('.product-card h2')).toHaveText(['시험 탁주', '시험 사케'])
    await expect(page.getByText('취향 설정과 관계없이 둘러볼 수 있는 주류예요.', { exact: false })).toBeVisible()
    await expect(page.getByText(source, { exact: true })).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(api.calls.filter((call) => call.path === '/recommendations/default')).toEqual([expect.objectContaining({ method: 'GET', query: { size: '4' }, body: null })])
    expect(api.calls.some((call) => call.path === '/users/me/preferences' || call.path.startsWith('/users/me/favorites'))).toBe(false)
    await page.getByRole('heading', { name: '시험 탁주', exact: true }).getByRole('link').click()
    await expect(page).toHaveURL('/products/901')
    await expect(page.getByRole('heading', { name: '시험 탁주', level: 1 })).toBeVisible()
  })
}

test('설문 건너뛰기 저장 후 기본 목록에 도달하고 SKIPPED 값을 유지', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  await page.goto('/preferences')
  await page.getByLabel('선호 도수 (%)', { exact: true }).fill('12.5')
  await page.getByRole('button', { name: '이번에는 건너뛰기', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '건너뛰기', exact: true }).click()
  await expect(page.getByText('건너뜀', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '기본 주류 둘러보기', exact: true }).click()
  await expect(page).toHaveURL('/discover')
  await expect(page.locator('.product-card')).toHaveCount(2)
  expect(api.preferences.member).toEqual(emptyPreference('SKIPPED'))
  expect(api.calls.filter((call) => call.method === 'PUT' && call.path === '/users/me/preferences')).toHaveLength(1)
  await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: '마이', exact: true }).click()
  await page.getByRole('link', { name: '내 취향 설정', exact: true }).click()
  await expect(page.getByText('건너뜀', { exact: true })).toBeVisible()
  await expect(page.getByLabel('선호 도수 (%)', { exact: true })).toHaveValue('')
})

test('아직 입력하지 않은 신규 계정은 취향 쓰기 없이 기본 목록을 둘러볼 수 있음', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  await page.goto('/preferences')
  await expect(page.getByText('아직 입력하지 않음', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '기본 주류 둘러보기', exact: true }).click()
  await expect(page.locator('.product-card')).toHaveCount(2)
  expect(api.preferences.member).toBeUndefined()
  expect(api.calls.some((call) => call.path === '/users/me/preferences' && call.method === 'PUT')).toBe(false)
})

test('저장 완료한 취향과 필수 조건은 프로필의 기본 목록을 보고 돌아와도 보존', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  const stored = emptyPreference('COMPLETED')
  stored.softPreferences.tasteTags = ['owned\nfixture']
  stored.softPreferences.targetAbvPercent = 80.25
  stored.hardConstraints.maxPriceKrw = 0
  stored.hardConstraints.maxAbvPercent = 10
  api.preferences.member = stored
  await page.goto('/profile')
  await page.getByRole('link', { name: '기본 주류 둘러보기', exact: true }).click()
  await expect(page.locator('.product-card')).toHaveCount(2)
  await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: '마이', exact: true }).click()
  await page.getByRole('link', { name: '내 취향 설정', exact: true }).click()
  await expect(page.getByText('입력 완료', { exact: true })).toBeVisible()
  await expect(page.getByLabel('맛 태그 1', { exact: true })).toHaveValue('owned\nfixture')
  await expect(page.getByLabel('선호 도수 (%)', { exact: true })).toHaveValue('80.25')
  await expect(page.getByLabel('최대 가격 (원)', { exact: true })).toHaveValue('0')
  expect(api.preferences.member).toEqual(stored)
  expect(api.calls.some((call) => call.path === '/users/me/preferences' && call.method === 'PUT')).toBe(false)
})

test('기본 목록의 조회 실패와 빈 목록을 구분하고 명시적 재조회로 복구', async ({ page, api }) => {
  api.defaultFailures = 1
  await page.goto('/discover')
  await expect(page.getByRole('heading', { name: '기본 주류를 불러오지 못했습니다', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '지금 둘러볼 기본 주류가 없습니다', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '기본 목록 다시 불러오기', exact: true }).click()
  await expect(page.locator('.product-card')).toHaveCount(2)
  api.catalog = []
  api.defaultSource = 'FALLBACK'
  await page.getByRole('button', { name: '기본 목록 새로고침', exact: true }).click()
  await expect(page.getByRole('heading', { name: '지금 둘러볼 기본 주류가 없습니다', exact: true })).toBeVisible()
  api.catalog = products.map((item) => ({ ...item, price: item.price + 1000 }))
  await page.getByRole('button', { name: '기본 목록 새로고침', exact: true }).click()
  await expect(page.locator('.product-card')).toHaveCount(2)
  await expect(page.locator('.product-card').first()).toContainText('7,000원')
})

for (const status of [200, 500]) {
  test(`기본 목록 대기·이탈 뒤 늦은 ${status} 결과가 새 취향 초안을 덮지 않음`, async ({ page, api }) => {
    api.user = api.users.find((user) => user.id === 'member')
    let release
    const gate = new Promise((resolve) => { release = resolve })
    let held = false
    await page.route('**/api/recommendations/default?*', async (route) => {
      held = true
      await gate
      await route.fulfill({ status, json: status === 200 ? success({ items: products, source: 'BASELINE' }) : failure('INTERNAL_ERROR') })
    })
    try {
      await page.goto('/discover')
      await expect.poll(() => held).toBe(true)
      await expect(page.getByRole('status', { name: '기본 주류를 불러오는 중입니다.' })).toBeVisible()
      await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: '마이', exact: true }).click()
      await page.getByRole('link', { name: '내 취향 설정', exact: true }).click()
      await page.getByLabel('선호 도수 (%)', { exact: true }).fill('25')
      const response = page.waitForResponse((result) => new URL(result.url()).pathname === '/api/recommendations/default')
      release()
      await (await response).finished()
      await expect(page.getByLabel('선호 도수 (%)', { exact: true })).toHaveValue('25')
      await expect(page.getByRole('alert')).toHaveCount(0)
      expect(api.preferences.member).toBeUndefined()
      expect(api.calls.some((call) => call.path === '/users/me/preferences' && call.method === 'PUT')).toBe(false)
    } finally { release() }
  })
}

test('기본 목록의 늦은 이전 계정 조회는 다른 계정 취향·세션에 영향을 주지 않음', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let held = false
  await page.route('**/api/recommendations/default?*', async (route) => {
    held = true
    await gate
    await route.fulfill({ status: 500, json: failure('INTERNAL_ERROR') })
  })
  try {
    await page.goto('/discover')
    await expect.poll(() => held).toBe(true)
    await page.getByRole('button', { name: '로그아웃', exact: true }).click()
    await page.getByRole('link', { name: '로그인', exact: true }).click()
    await page.getByLabel('아이디', { exact: true }).fill('other')
    await page.getByLabel('비밀번호', { exact: true }).fill('fixture-password')
    await page.locator('.auth-form').getByRole('button', { name: '로그인', exact: true }).click()
    await page.getByRole('link', { name: '내 취향 설정', exact: true }).click()
    await page.getByLabel('선호 도수 (%)', { exact: true }).fill('30')
    const response = page.waitForResponse((result) => new URL(result.url()).pathname === '/api/recommendations/default')
    release()
    await (await response).finished()
    await expect(page.getByText('다른회원님', { exact: true })).toBeVisible()
    await expect(page.getByLabel('선호 도수 (%)', { exact: true })).toHaveValue('30')
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(api.preferences.other).toBeUndefined()
  } finally { release() }
})

test('390px 기본 주류 목록의 카드·재조회·전체 목록 링크에 가로 넘침이 없음', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  api.defaultSource = 'FALLBACK'
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/profile')
  await expect(page.getByRole('link', { name: '기본 주류 둘러보기', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('link', { name: '내 취향 설정', exact: true }).click()
  await expect(page.getByRole('form', { name: '내 취향 설정' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('link', { name: '기본 주류 둘러보기', exact: true }).click()
  await expect(page.locator('.product-card')).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: '기본 목록 새로고침', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.product-card')).toHaveCount(2)
  await page.getByRole('link', { name: '전체 주류 보기', exact: true }).click()
  await expect(page.getByRole('heading', { name: '전체 주류 둘러보기' })).toBeVisible()
})

for (const nextEdit of ['same', 'other', 'new', 'reopen']) {
  test(`관리자 상품 저장 완료는 ${nextEdit} 편집의 새 초안을 지우지 않음`, async ({ page, api }) => {
    api.user = api.users.find((user) => user.id === 'admin')
    api.catalog[0].img = 'takju1.webp'
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const submissions = []
    await page.route('**/api/admin/products/901', async (route) => {
      if (route.request().method() !== 'PUT') return route.fallback()
      submissions.push(route.request().postDataJSON())
      await gate
      await route.fallback()
    })
    try {
      await page.goto('/admin')
      await page.locator('.table-row').filter({ hasText: '시험 탁주' }).getByRole('button', { name: '편집', exact: true }).click()
      await page.getByLabel('가격', { exact: true }).fill('7000')
      await page.getByRole('button', { name: '변경 저장', exact: true }).click()
      await expect.poll(() => submissions.length).toBe(1)
      if (nextEdit === 'other') await page.locator('.table-row').filter({ hasText: '시험 사케' }).getByRole('button', { name: '편집', exact: true }).click()
      if (nextEdit === 'new' || nextEdit === 'reopen') await page.getByRole('button', { name: '편집 취소', exact: true }).click()
      if (nextEdit === 'reopen') await page.locator('.table-row').filter({ hasText: '시험 탁주' }).getByRole('button', { name: '편집', exact: true }).click()
      const nextName = nextEdit === 'reopen' ? '시험 탁주' : '보존할 새 상품 초안'
      const nextPrice = nextEdit === 'reopen' ? '7000' : '8000'
      await page.getByLabel('상품명', { exact: true }).fill(nextName)
      await page.getByLabel('가격', { exact: true }).fill(nextPrice)
      release()
      await expect(page.getByRole('status').filter({ hasText: '상품 정보가 저장되었습니다.' })).toBeVisible()
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      await expect(page.getByLabel('상품명', { exact: true })).toHaveValue(nextName)
      await expect(page.getByLabel('가격', { exact: true })).toHaveValue(nextPrice)
      await expect(page.getByRole('button', { name: nextEdit === 'new' ? '상품 등록' : '변경 저장', exact: true })).toBeEnabled()
      expect(submissions).toHaveLength(1)
      expect(submissions[0].price).toBe(7000)
      expect(api.catalog.find((item) => item.id === 901).price).toBe(7000)
      expect(api.catalog.find((item) => item.id === 902).price).toBe(12000)
    } finally { release() }
  })
}

test('관리자 매장 저장 완료는 다른 매장의 새 초안을 지우지 않음', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'admin')
  api.markets = [{ id: 201, name: '시연 첫 매장', latitude: 37, longitude: 127 }, { id: 202, name: '시연 둘째 매장', latitude: 38, longitude: 128 }]
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let attempts = 0
  await page.route('**/api/admin/markets/201', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    attempts += 1
    await gate
    await route.fallback()
  })
  try {
    await page.goto('/admin?tab=markets')
    await page.locator('.table-row').filter({ hasText: '시연 첫 매장' }).getByRole('button', { name: '편집', exact: true }).click()
    await page.getByLabel('위도', { exact: true }).fill('37.5')
    await page.getByRole('button', { name: '변경 저장', exact: true }).click()
    await expect.poll(() => attempts).toBe(1)
    await page.locator('.table-row').filter({ hasText: '시연 둘째 매장' }).getByRole('button', { name: '편집', exact: true }).click()
    await page.getByLabel('매장명', { exact: true }).fill('보존할 매장 초안')
    release()
    await expect(page.getByRole('status').filter({ hasText: '매장 정보가 저장되었습니다.' })).toBeVisible()
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expect(page.getByLabel('매장명', { exact: true })).toHaveValue('보존할 매장 초안')
    expect(api.markets.find((item) => item.id === 201).latitude).toBe(37.5)
    expect(api.markets.find((item) => item.id === 202).name).toBe('시연 둘째 매장')
  } finally { release() }
})

test('관리자 회원 저장 완료는 다른 회원의 새 초안을 닫지 않음', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'admin')
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let attempts = 0
  await page.route('**/api/admin/users/member', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    attempts += 1
    await gate
    await route.fallback()
  })
  try {
    await page.goto('/admin?tab=users')
    await page.locator('.table-row').filter({ hasText: '시험회원' }).getByRole('button', { name: '편집', exact: true }).click()
    await page.getByLabel('이름', { exact: true }).fill('저장할 회원 이름')
    await page.getByRole('button', { name: '변경 저장', exact: true }).click()
    await expect.poll(() => attempts).toBe(1)
    await page.locator('.table-row').filter({ hasText: '다른회원' }).getByRole('button', { name: '편집', exact: true }).click()
    await page.getByLabel('이름', { exact: true }).fill('보존할 회원 초안')
    release()
    await expect(page.getByRole('status').filter({ hasText: '회원 정보가 저장되었습니다.' })).toBeVisible()
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expect(page.getByLabel('이름', { exact: true })).toHaveValue('보존할 회원 초안')
    await expect(page.getByText('other 회원', { exact: true })).toBeVisible()
    expect(api.users.find((item) => item.id === 'member').name).toBe('저장할 회원 이름')
    expect(api.users.find((item) => item.id === 'other').name).toBe('다른회원')
  } finally { release() }
})

test('관리자 신규 상품 등록 완료도 제출 뒤 작성한 다음 초안을 보존', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'admin')
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const submissions = []
  await page.route('**/api/admin/products', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    submissions.push(route.request().postDataJSON())
    await gate
    await route.fallback()
  })
  try {
    await page.goto('/admin')
    await page.getByLabel('상품명', { exact: true }).fill('제출한 신규 상품')
    await page.locator('.admin-form').getByLabel('주종', { exact: true }).selectOption('탁주')
    await page.getByLabel('가격', { exact: true }).fill('7000')
    await page.getByLabel('이미지 파일명', { exact: true }).fill('takju1.webp')
    await page.getByRole('button', { name: '상품 등록', exact: true }).click()
    await expect.poll(() => submissions.length).toBe(1)
    await page.getByLabel('상품명', { exact: true }).fill('아직 제출하지 않은 다음 상품')
    release()
    await expect(page.getByRole('status').filter({ hasText: '상품 정보가 저장되었습니다.' })).toBeVisible()
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expect(page.getByLabel('상품명', { exact: true })).toHaveValue('아직 제출하지 않은 다음 상품')
    expect(api.catalog.some((item) => item.name === '제출한 신규 상품')).toBe(true)
    expect(api.catalog.some((item) => item.name === '아직 제출하지 않은 다음 상품')).toBe(false)
    expect(submissions).toHaveLength(1)
  } finally { release() }
})

test('관리자 저장 거절 뒤 새 대상 초안을 유지하고 명시적 다음 저장은 그 대상만 변경', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'admin')
  api.catalog.forEach((item) => { item.img = 'takju1.webp' })
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let attempts = 0
  await page.route('**/api/admin/products/901', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    attempts += 1
    await gate
    await route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') })
  })
  try {
    await page.goto('/admin')
    await page.locator('.table-row').filter({ hasText: '시험 탁주' }).getByRole('button', { name: '편집', exact: true }).click()
    await page.getByLabel('가격', { exact: true }).fill('7000')
    await page.getByRole('button', { name: '변경 저장', exact: true }).click()
    await expect.poll(() => attempts).toBe(1)
    await page.locator('.table-row').filter({ hasText: '시험 사케' }).getByRole('button', { name: '편집', exact: true }).click()
    await page.getByLabel('상품명', { exact: true }).fill('다음 대상 상품')
    await page.getByLabel('가격', { exact: true }).fill('15000')
    release()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('button', { name: '변경 저장', exact: true })).toBeEnabled()
    await expect(page.getByLabel('상품명', { exact: true })).toHaveValue('다음 대상 상품')
    await page.getByRole('button', { name: '변경 저장', exact: true }).click()
    await expect(page.locator('.table-row').filter({ hasText: '다음 대상 상품' })).toContainText('15,000원')
    expect(api.catalog.find((item) => item.id === 901).price).toBe(6000)
    expect(api.catalog.find((item) => item.id === 902).name).toBe('다음 대상 상품')
    expect(attempts).toBe(1)
  } finally { release() }
})

test('관리자 제출 후 새 편집을 하지 않으면 성공 뒤 기존처럼 폼을 초기화', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'admin')
  api.catalog[0].img = 'takju1.webp'
  await page.goto('/admin')
  await page.locator('.table-row').filter({ hasText: '시험 탁주' }).getByRole('button', { name: '편집', exact: true }).click()
  await page.getByLabel('가격', { exact: true }).fill('7000')
  await page.getByRole('button', { name: '변경 저장', exact: true }).click()
  await expect(page.locator('.table-row').filter({ hasText: '시험 탁주' })).toContainText('7,000원')
  await expect(page.getByRole('button', { name: '상품 등록', exact: true })).toBeEnabled()
  await expect(page.getByLabel('상품명', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('가격', { exact: true })).toHaveValue('0')
})

for (const tab of ['products', 'markets', 'users', 'comments', 'orders']) {
  test(`관리자 ${tab} 마지막 페이지 삭제 뒤 남은 목록 페이지로 복귀`, async ({ page, api }) => {
    const admin = api.users.find((user) => user.id === 'admin')
    api.user = admin
    let target
    if (tab === 'products') {
      api.catalog = Array.from({ length: 21 }, (_, index) => ({ ...products[0], id: 3000 + index, name: `페이지 상품 ${index}` }))
      target = '페이지 상품 20'
    } else if (tab === 'markets') {
      api.markets = Array.from({ length: 21 }, (_, index) => ({ id: 4000 + index, name: `페이지 매장 ${index}`, latitude: 37, longitude: 127 }))
      target = '페이지 매장 20'
    } else if (tab === 'users') {
      api.users = [admin, ...Array.from({ length: 20 }, (_, index) => ({ id: `page-member-${index + 1}`, name: `페이지 회원 ${index + 1}`, role: 'USER', stamps: 0 }))]
      target = '페이지 회원 20'
    } else if (tab === 'comments') {
      api.reviews = Array.from({ length: 21 }, (_, index) => ({ id: 5000 + index, userId: 'member', productId: 901, rating: 5, comment: `페이지 후기 ${index}` }))
      target = '페이지 후기 20'
    } else {
      api.orders = Array.from({ length: 21 }, (_, index) => ({ oId: 6000 + index, userId: 'member', orderType: 'TAKEOUT', completed: 'N', orderTime: '2026-11-01T07:00:00', totalPrice: 6000, priceBasis: 'ORDER_SNAPSHOT', details: [] }))
      target = '#6020'
    }
    await page.goto(`/admin?tab=${tab}&page=2`)
    await expect(page.locator('.table-row:not(.table-head)')).toHaveCount(1)
    await page.locator('.table-row').filter({ hasText: target }).getByRole('button', { name: '삭제', exact: true }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: '삭제', exact: true }).click()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    const stored = tab === 'products' ? api.catalog : tab === 'markets' ? api.markets : tab === 'users' ? api.users : tab === 'comments' ? api.reviews : api.orders
    expect(stored).toHaveLength(20)
    await expect(page).toHaveURL((url) => url.pathname === '/admin' && url.searchParams.get('tab') === tab && url.searchParams.get('page') === '1')
    await expect(page.locator('.table-row:not(.table-head)')).toHaveCount(20)
    await expect(page.locator('.state-panel')).toHaveCount(0)
  })
}

const adminPageProducts = (count) => Array.from({ length: count }, (_, index) => ({ ...products[0], id: 7000 + index, name: `경계 상품 ${index}` }))

test('관리자 범위 밖 직접 링크는 성공 조회 후 마지막 페이지로 replace 보정하고 정상 빈 목록은 유지', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'admin')
  api.catalog = adminPageProducts(21)
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let requested = false
  await page.route('**/api/products?**', async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('page') !== '99') return route.fallback()
    requested = true
    await gate
    await route.fallback()
  })
  try {
    await page.goto('/profile')
    await page.getByRole('link', { name: '관리', exact: true }).click()
    await expect(page.locator('.table-row:not(.table-head)')).toHaveCount(20)
    await page.evaluate(() => { window.history.pushState({}, '', '/admin?tab=products&page=99'); window.dispatchEvent(new PopStateEvent('popstate')) })
    await expect.poll(() => requested).toBe(true)
    await expect(page).toHaveURL(/page=99$/)
    await expect(page.getByText('등록된 상품 정보가 없습니다', { exact: true })).toHaveCount(0)
    release()
    await expect(page).toHaveURL(/page=2$/)
    await expect(page.locator('.table-row:not(.table-head)')).toHaveCount(1)
    await page.goBack()
    await expect(page).toHaveURL(/\/admin$/)
    api.catalog = []
    await page.getByRole('button', { name: '현재 탭 새로고침', exact: true }).click()
    await expect(page.getByText('등록된 상품 정보가 없습니다', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\/admin$/)
  } finally { release() }
})

test('관리자 외부 삭제 후 권위 재조회로 페이지를 보정하면서 작성 중 초안을 보존', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'admin')
  api.catalog = adminPageProducts(41)
  await page.goto('/admin?tab=products&page=3')
  await expect(page.locator('.table-row:not(.table-head)')).toHaveCount(1)
  await page.getByLabel('상품명', { exact: true }).fill('아직 저장하지 않은 상품')
  api.catalog = api.catalog.slice(0, 20)
  await page.getByRole('button', { name: '현재 탭 새로고침', exact: true }).click()
  await expect(page).toHaveURL(/page=1$/)
  await expect(page.locator('.table-row:not(.table-head)')).toHaveCount(20)
  await expect(page.getByLabel('상품명', { exact: true })).toHaveValue('아직 저장하지 않은 상품')
  expect(api.calls.filter((call) => call.method !== 'GET')).toHaveLength(0)
})

test('관리자 마지막 행 삭제 거절은 페이지와 항목을 유지하고 명시적 재시도만 삭제', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'admin')
  api.catalog = adminPageProducts(21)
  let attempts = 0
  await page.route('**/api/admin/products/7020', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    attempts += 1
    if (attempts === 1) return route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') })
    await route.fallback()
  })
  await page.goto('/admin?tab=products&page=2')
  await page.locator('.table-row').filter({ hasText: '경계 상품 20' }).getByRole('button', { name: '삭제', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '삭제', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('alertdialog').getByRole('button', { name: '삭제', exact: true })).toBeEnabled()
  await expect(page).toHaveURL(/page=2$/)
  await expect(page.locator('.table-row:not(.table-head)')).toHaveCount(1)
  expect(api.catalog).toHaveLength(21)
  expect(attempts).toBe(1)
  await page.getByRole('alertdialog').getByRole('button', { name: '삭제', exact: true }).click()
  await expect(page).toHaveURL(/page=1$/)
  await expect(page.locator('.table-row:not(.table-head)')).toHaveCount(20)
  expect(attempts).toBe(2)
})

test('관리자 범위 밖 읽기 실패를 빈 목록이나 페이지 보정으로 숨기지 않고 재시도', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'admin')
  api.catalog = adminPageProducts(21)
  api.catalogFailures = 1
  await page.goto('/admin?tab=products&page=9')
  await expect(page.getByText('상품 정보를 불러오지 못했습니다', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/page=9$/)
  await expect(page.getByText('등록된 상품 정보가 없습니다', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '다시 시도', exact: true }).click()
  await expect(page).toHaveURL(/page=2$/)
  await expect(page.locator('.table-row:not(.table-head)')).toHaveCount(1)
})

for (const leave of ['page', 'tab']) {
  test(`관리자 늦은 이전 페이지 결과는 사용자의 ${leave} 이동을 되돌리지 않음`, async ({ page, api }) => {
    api.user = api.users.find((user) => user.id === 'admin')
    api.catalog = adminPageProducts(41)
    let release
    const gate = new Promise((resolve) => { release = resolve })
    let held = false
    let delivered = false
    let reads = 0
    await page.route('**/api/products?**', async (route) => {
      const url = new URL(route.request().url())
      if (url.searchParams.get('page') !== '3') return route.fallback()
      reads += 1
      if (reads !== 2) return route.fallback()
      held = true
      await gate
      await route.fulfill({ json: success(pageOf(api.catalog.slice(0, 20), 20, 3)) })
      delivered = true
    })
    try {
      await page.goto('/admin?tab=products&page=3')
      await expect(page.locator('.table-row:not(.table-head)')).toHaveCount(1)
      await page.getByRole('button', { name: '현재 탭 새로고침', exact: true }).click()
      await expect.poll(() => held).toBe(true)
      if (leave === 'page') await page.getByRole('navigation', { name: 'pagination', exact: true }).getByRole('button', { name: '이전', exact: true }).click()
      else await page.getByRole('navigation', { name: '관리 메뉴', exact: true }).getByRole('button', { name: '매장', exact: true }).click()
      const current = leave === 'page' ? /tab=products&page=2$/ : /tab=markets&page=1$/
      await expect(page).toHaveURL(current)
      release()
      await expect.poll(() => delivered).toBe(true)
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      await expect(page).toHaveURL(current)
      if (leave === 'page') {
        await expect(page.locator('.table-row:not(.table-head)')).toHaveCount(20)
        await page.getByRole('navigation', { name: 'pagination', exact: true }).getByRole('button', { name: '다음', exact: true }).click()
        await expect.poll(() => reads).toBe(3)
        await expect(page.locator('.table-row:not(.table-head)')).toHaveCount(1)
        await expect(page).toHaveURL(/tab=products&page=3$/)
      } else await expect(page.getByText('등록된 매장 정보가 없습니다', { exact: true })).toBeVisible()
    } finally { release() }
  })
}

for (const change of ['new-product', 'new-note']) {
  test(`데모 주문 완료는 전송 뒤 ${change} 다음 주문 입력을 지우지 않음`, async ({ page, api }) => {
    api.user = api.users.find((user) => user.id === 'member')
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const submissions = []
    await page.route('**/api/orders', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      submissions.push(route.request().postDataJSON())
      await gate
      await route.fallback()
    })
    try {
      await page.goto('/products/901')
      await page.getByRole('button', { name: '1개 장바구니에 담기', exact: true }).click()
      await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: /장바구니/ }).click()
      await page.getByLabel('테이블·요청 사항', { exact: true }).fill('제출한 요청')
      await page.getByRole('button', { name: '6,000원 주문하기', exact: true }).click()
      await expect.poll(() => submissions.length).toBe(1)
      if (change === 'new-product') {
        await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: '전체 주류', exact: true }).click()
        await page.locator('.product-card').filter({ hasText: '시험 사케' }).getByRole('button', { name: '빠른 담기', exact: true }).click()
      } else await page.getByLabel('테이블·요청 사항', { exact: true }).fill('다음 주문 요청')
      release()
      await expect(page.getByText('주문이 접수되었습니다.', { exact: true })).toBeVisible()
      await expect.poll(() => api.orders.length).toBe(1)
      expect(api.orders[0].details.map((item) => ({ productId: item.productId, quantity: item.quantity }))).toEqual([{ productId: 901, quantity: 1 }])
      expect(api.orders[0].orderTable).toBe('제출한 요청')
      if (change === 'new-product') await expect(page).toHaveURL('/products')
      if (change === 'new-note') {
        await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: '전체 주류', exact: true }).click()
        await page.locator('.product-card').filter({ hasText: '시험 사케' }).getByRole('button', { name: '빠른 담기', exact: true }).click()
      }
      await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: /장바구니/ }).click()
      await expect(page.getByRole('spinbutton', { name: '시험 사케 수량', exact: true })).toHaveValue('1')
      await expect(page.getByRole('spinbutton', { name: '시험 탁주 수량', exact: true })).toHaveCount(0)
      await expect(page.getByLabel('테이블·요청 사항', { exact: true })).toHaveValue(change === 'new-note' ? '다음 주문 요청' : '')
      expect(submissions).toHaveLength(1)
    } finally { release() }
  })
}

for (const change of ['additional-quantity', 're-added-line', 'decreased-quantity', 'rejected-order']) {
  test(`접수 중 장바구니 ${change} 경계는 제출량과 다음 입력을 구분`, async ({ page, api }) => {
    api.user = api.users.find((user) => user.id === 'member')
    if (change === 'rejected-order') api.orderFailures = 1
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const submissions = []
    await page.route('**/api/orders', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      submissions.push(route.request().postDataJSON())
      await gate
      await route.fallback()
    })
    const cartLink = () => page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: /장바구니/ })
    try {
      await page.goto('/products/901')
      await page.getByRole('spinbutton', { name: '시험 탁주 수량', exact: true }).fill('2')
      await page.getByRole('spinbutton', { name: '시험 탁주 수량', exact: true }).press('Enter')
      await page.getByRole('button', { name: '2개 장바구니에 담기', exact: true }).click()
      await cartLink().click()
      await page.getByLabel('테이블·요청 사항', { exact: true }).fill('처음 요청')
      await page.getByRole('button', { name: '12,000원 주문하기', exact: true }).click()
      await expect.poll(() => submissions.length).toBe(1)
      await expect(page.getByText(/이미 전송한 상품과 수량은 변경되지 않습니다/)).toBeVisible()
      await page.locator('.checkout-form').evaluate((form) => form.requestSubmit())
      expect(submissions).toHaveLength(1)
      if (change === 're-added-line') {
        await page.getByRole('button', { name: '시험 탁주 삭제', exact: true }).click()
        await page.getByRole('link', { name: '전체 주류 보기', exact: true }).click()
        await page.locator('.product-card').filter({ hasText: '시험 탁주' }).getByRole('button', { name: '빠른 담기', exact: true }).click()
        await cartLink().click()
        await page.getByLabel('테이블·요청 사항', { exact: true }).fill('다시 연 화면의 요청')
      } else {
        await page.getByRole('spinbutton', { name: '시험 탁주 수량', exact: true }).fill(change === 'decreased-quantity' ? '1' : '3')
        await page.getByRole('spinbutton', { name: '시험 탁주 수량', exact: true }).press('Enter')
        await page.getByLabel('테이블·요청 사항', { exact: true }).fill('다음 요청')
        if (change === 'decreased-quantity') {
          await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: '전체 주류', exact: true }).click()
          await page.locator('.product-card').filter({ hasText: '시험 사케' }).getByRole('button', { name: '빠른 담기', exact: true }).click()
        }
      }
      release()
      if (change === 'rejected-order') {
        await expect(page.getByRole('alert')).toBeVisible()
        await expect(page.getByRole('button', { name: '18,000원 주문하기', exact: true })).toBeEnabled()
        await expect(page.getByRole('spinbutton', { name: '시험 탁주 수량', exact: true })).toHaveValue('3')
        await expect(page.getByLabel('테이블·요청 사항', { exact: true })).toHaveValue('다음 요청')
        expect(api.orders).toHaveLength(0)
        expect(submissions).toHaveLength(1)
        await page.getByRole('button', { name: '18,000원 주문하기', exact: true }).click()
        await expect(page).toHaveURL('/profile')
        expect(api.orders[0].details[0].quantity).toBe(3)
        expect(api.orders[0].orderTable).toBe('다음 요청')
        expect(submissions).toHaveLength(2)
      } else {
        await expect(page.getByText('주문이 접수되었습니다.', { exact: true })).toBeVisible()
        if (change === 're-added-line') await expect(page).toHaveURL('/cart')
        else if (change === 'decreased-quantity') await expect(page).toHaveURL('/products')
        else { await expect(page).toHaveURL('/profile'); await cartLink().click() }
        if (change === 'decreased-quantity') await cartLink().click()
        const name = change === 'decreased-quantity' ? '시험 사케' : '시험 탁주'
        await expect(page.getByRole('spinbutton', { name: `${name} 수량`, exact: true })).toHaveValue('1')
        await expect(page.getByLabel('테이블·요청 사항', { exact: true })).toHaveValue(change === 're-added-line' ? '다시 연 화면의 요청' : '다음 요청')
        expect(api.orders).toHaveLength(1)
        expect(api.orders[0].details.map((item) => item.quantity)).toEqual([2])
        expect(api.orders[0].orderTable).toBe('처음 요청')
        expect(submissions).toHaveLength(1)
      }
    } finally { release() }
  })
}

for (const failureKind of ['server-error', 'network-error']) {
  test(`회원가입 완료 뒤 ${failureKind} 자동 로그인 실패는 재가입 없이 로그인으로 복구`, async ({ page, api }) => {
    let loginAttempts = 0
    await page.route('**/api/auth/login', async (route) => {
      loginAttempts += 1
      if (loginAttempts !== 1) return route.fallback()
      if (failureKind === 'network-error') return route.abort('failed')
      await route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') })
    })
    await page.goto('/account?redirect=/cart')
    await page.locator('.segmented').getByRole('button', { name: '회원가입', exact: true }).click()
    await page.getByLabel('아이디', { exact: true }).fill('created-member')
    await page.getByRole('button', { name: '중복 확인', exact: true }).click()
    await expect(page.getByText('사용할 수 있는 아이디입니다.', { exact: true })).toBeVisible()
    await page.getByLabel('이름', { exact: true }).fill('가입복구회원')
    await page.getByLabel('비밀번호', { exact: true }).fill('fixture-pass')
    await page.locator('.auth-form').getByRole('button', { name: '회원가입', exact: true }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect.poll(() => loginAttempts).toBe(1)
    expect(api.users.filter((user) => user.id === 'created-member')).toHaveLength(1)
    expect(api.user).toBeNull()
    await page.getByLabel('비밀번호', { exact: true }).fill('fixture-pass')
    await page.locator('.auth-form').getByRole('button', { name: /^(회원가입|로그인)$/ }).click()
    await expect(page).toHaveURL('/cart')
    expect(api.calls.filter((call) => call.method === 'POST' && call.path === '/users')).toHaveLength(1)
    expect(loginAttempts).toBe(2)
    expect(api.user.id).toBe('created-member')
  })
}

async function prepareJoin(page, id = 'recovery-member') {
  await page.goto('/account?redirect=/cart')
  await page.locator('.segmented').getByRole('button', { name: '회원가입', exact: true }).click()
  await page.getByLabel('아이디', { exact: true }).fill(id)
  await page.getByRole('button', { name: '중복 확인', exact: true }).click()
  await expect(page.getByText('사용할 수 있는 아이디입니다.', { exact: true })).toBeVisible()
  await page.getByLabel('이름', { exact: true }).fill('복구흐름회원')
  await page.getByLabel('비밀번호', { exact: true }).fill('fixture-pass')
}

test('가입 요청 자체의 실패는 완료로 오인하지 않고 입력과 재가입을 유지', async ({ page, api }) => {
  let attempts = 0
  await page.route('**/api/users', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    attempts += 1
    if (attempts === 1) return route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') })
    await route.fallback()
  })
  await prepareJoin(page)
  await page.locator('.auth-form').getByRole('button', { name: '회원가입', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.locator('.auth-form').getByRole('button', { name: '회원가입', exact: true })).toBeEnabled()
  await expect(page.getByLabel('아이디', { exact: true })).toHaveValue('recovery-member')
  await expect(page.getByLabel('이름', { exact: true })).toHaveValue('복구흐름회원')
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveValue('fixture-pass')
  expect(api.users.some((user) => user.id === 'recovery-member')).toBe(false)
  expect(api.calls.filter((call) => call.path === '/auth/login')).toHaveLength(0)
  await page.locator('.auth-form').getByRole('button', { name: '회원가입', exact: true }).click()
  await expect(page).toHaveURL('/cart')
  expect(attempts).toBe(2)
})

test('아이디 경쟁으로 가입이 거절되면 로그인 완료로 바꾸지 않고 새 아이디 확인을 요구', async ({ page, api }) => {
  await prepareJoin(page)
  api.users.push({ id: 'recovery-member', name: '다른 요청의 회원', role: 'USER', stamps: 0 })
  await page.locator('.auth-form').getByRole('button', { name: '회원가입', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.locator('.auth-form').getByRole('button', { name: '회원가입', exact: true })).toBeEnabled()
  expect(api.calls.filter((call) => call.path === '/auth/login')).toHaveLength(0)
  await page.getByLabel('아이디', { exact: true }).fill('another-recovery-member')
  await expect(page.locator('.auth-form').getByRole('button', { name: '회원가입', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '중복 확인', exact: true }).click()
  await expect(page.getByText('사용할 수 있는 아이디입니다.', { exact: true })).toBeVisible()
  await page.locator('.auth-form').getByRole('button', { name: '회원가입', exact: true }).click()
  await expect(page).toHaveURL('/cart')
  expect(api.user.id).toBe('another-recovery-member')
})

test('가입과 자동 로그인 대기는 자격 입력·모드를 고정하고 복구 로그인 거절 뒤 명시적 재입력을 허용', async ({ page, api }) => {
  let releaseJoin, releaseLogin
  const joinGate = new Promise((resolve) => { releaseJoin = resolve })
  const loginGate = new Promise((resolve) => { releaseLogin = resolve })
  const registrations = [], logins = []
  await page.route('**/api/users', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    registrations.push(route.request().postDataJSON())
    await joinGate
    await route.fallback()
  })
  await page.route('**/api/auth/login', async (route) => {
    logins.push(route.request().postDataJSON())
    if (logins.length === 1) { await loginGate; return route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') }) }
    if (logins.length === 2) return route.fulfill({ status: 401, json: failure('UNAUTHORIZED') })
    await route.fallback()
  })
  try {
    await prepareJoin(page)
    await page.locator('.auth-form').getByRole('button', { name: '회원가입', exact: true }).click()
    await expect.poll(() => registrations.length).toBe(1)
    for (const label of ['아이디', '이름', '비밀번호']) await expect(page.getByLabel(label, { exact: true })).toBeDisabled()
    for (const name of ['로그인', '회원가입']) await expect(page.locator('.segmented').getByRole('button', { name, exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: '중복 확인', exact: true })).toBeDisabled()
    await page.locator('.auth-form').evaluate((form) => form.requestSubmit())
    expect(registrations).toHaveLength(1)
    releaseJoin()
    await expect.poll(() => logins.length).toBe(1)
    await expect(page.getByLabel('아이디', { exact: true })).toBeDisabled()
    releaseLogin()
    await expect(page.getByRole('alert')).toContainText('회원가입은 완료되었지만')
    await expect(page.getByLabel('아이디', { exact: true })).toHaveValue('recovery-member')
    await expect(page.getByLabel('비밀번호', { exact: true })).toHaveValue('')
    await expect(page.getByLabel('이름', { exact: true })).toHaveCount(0)
    await page.getByLabel('비밀번호', { exact: true }).fill('wrong-pass')
    await page.locator('.auth-form').getByRole('button', { name: '로그인', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('로그인이 필요합니다.')
    await expect(page.locator('.auth-form').getByRole('button', { name: '로그인', exact: true })).toBeEnabled()
    await page.getByLabel('비밀번호', { exact: true }).fill('fixture-pass')
    await page.locator('.auth-form').getByRole('button', { name: '로그인', exact: true }).click()
    await expect(page).toHaveURL('/cart')
    expect(registrations).toHaveLength(1)
    expect(logins).toHaveLength(3)
    expect(logins[0]).toEqual({ id: 'recovery-member', pass: 'fixture-pass' })
    expect(api.users.filter((user) => user.id === 'recovery-member')).toHaveLength(1)
  } finally { releaseJoin(); releaseLogin() }
})

test('늦은 이전 아이디 중복 확인은 현재 새 아이디의 가입을 승인하지 않음', async ({ page, api }) => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let held = false
  await page.route('**/api/users/id-available?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('id') !== 'first-draft') return route.fallback()
    held = true
    await gate
    await route.fallback()
  })
  try {
    await page.goto('/account')
    await page.locator('.segmented').getByRole('button', { name: '회원가입', exact: true }).click()
    await page.getByLabel('아이디', { exact: true }).fill('first-draft')
    await page.getByRole('button', { name: '중복 확인', exact: true }).click()
    await expect.poll(() => held).toBe(true)
    await page.getByLabel('아이디', { exact: true }).fill('second-draft')
    release()
    await expect(page.getByRole('button', { name: '중복 확인', exact: true })).toBeEnabled()
    await expect(page.getByText('사용할 수 있는 아이디입니다.', { exact: true })).toHaveCount(0)
    await expect(page.locator('.auth-form').getByRole('button', { name: '회원가입', exact: true })).toBeDisabled()
    expect(api.calls.filter((call) => call.path === '/users')).toHaveLength(0)
    await page.getByRole('button', { name: '중복 확인', exact: true }).click()
    await expect(page.getByText('사용할 수 있는 아이디입니다.', { exact: true })).toBeVisible()
  } finally { release() }
})

test('가입 후 로그인 실패의 늦은 결과는 이탈한 탐색 경로에 계정 폼을 열지 않음', async ({ page, api }) => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let pending = false
  await page.route('**/api/auth/login', async (route) => {
    if (pending) return route.fallback()
    pending = true
    await gate
    await route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') })
  })
  try {
    await prepareJoin(page)
    await page.locator('.auth-form').getByRole('button', { name: '회원가입', exact: true }).click()
    await expect.poll(() => pending).toBe(true)
    await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: '전체 주류', exact: true }).click()
    release()
    await expect(page.getByRole('alert')).toContainText('회원가입은 완료되었지만')
    await expect(page).toHaveURL('/products')
    await expect(page.locator('.auth-form')).toHaveCount(0)
    await page.getByRole('link', { name: '로그인', exact: true }).click()
    await expect(page.getByLabel('아이디', { exact: true })).toHaveValue('')
    await page.getByLabel('아이디', { exact: true }).fill('recovery-member')
    await page.getByLabel('비밀번호', { exact: true }).fill('fixture-pass')
    await page.locator('.auth-form').getByRole('button', { name: '로그인', exact: true }).click()
    await expect(page).toHaveURL('/profile')
    expect(api.calls.filter((call) => call.method === 'POST' && call.path === '/users')).toHaveLength(1)
  } finally { release() }
})

test('390px 웹에서도 가입 완료 뒤 키보드로 비밀번호를 재입력해 로그인 복구', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let attempts = 0
  await page.route('**/api/auth/login', async (route) => {
    attempts += 1
    if (attempts === 1) return route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') })
    await route.fallback()
  })
  await prepareJoin(page)
  await page.locator('.auth-form').getByRole('button', { name: '회원가입', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('회원가입은 완료되었지만')
  await expect(page.getByLabel('아이디', { exact: true })).toHaveAttribute('autocomplete', 'username')
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveAttribute('autocomplete', 'current-password')
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveAttribute('maxlength', '100')
  await expect(page.getByLabel('비밀번호', { exact: true })).toBeEnabled()
  await page.getByLabel('비밀번호', { exact: true }).focus()
  await page.keyboard.type('fixture-pass')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/cart')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('가입 후 로그인 복구에서 다른 계정을 선택하면 그 계정 세션과 개인 화면만 표시', async ({ page, api }) => {
  let attempts = 0
  await page.route('**/api/auth/login', async (route) => {
    attempts += 1
    if (attempts === 1) return route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') })
    await route.fallback()
  })
  await prepareJoin(page)
  await page.locator('.auth-form').getByRole('button', { name: '회원가입', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('회원가입은 완료되었지만')
  await page.getByLabel('아이디', { exact: true }).fill('other')
  await page.getByLabel('비밀번호', { exact: true }).fill('fixture-pass')
  await page.locator('.auth-form').getByRole('button', { name: '로그인', exact: true }).click()
  await expect(page).toHaveURL('/cart')
  await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: '마이', exact: true }).click()
  await expect(page.getByRole('heading', { name: '다른회원님의 취향 기록', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '복구흐름회원님의 취향 기록', exact: true })).toHaveCount(0)
  expect(api.calls.filter((call) => call.method === 'POST' && call.path === '/users')).toHaveLength(1)
  expect(api.user.id).toBe('other')
})

for (const rating of [0.5, 4.5]) {
  test(`기존 ${rating}점 후기를 열면 편집 평점도 저장된 값과 일치`, async ({ page, api }) => {
    api.user = api.users.find((user) => user.id === 'member')
    api.reviews = [{ id: 31, userId: 'member', productId: 901, rating, comment: '소수 평점 시연 후기' }]
    await page.goto('/products/901')
    const row = page.locator('.comment-row').filter({ hasText: '소수 평점 시연 후기' })
    await row.getByRole('button', { name: '수정', exact: true }).click()
    const select = row.locator('.comment-edit-form').getByRole('combobox', { name: '평점', exact: true })
    expect(api.reviews[0].rating).toBe(rating)
    expect(api.calls.filter((call) => call.method === 'PUT')).toHaveLength(0)
    await test.info().attach('selected-rating', { body: JSON.stringify({ stored: rating, selected: await select.inputValue(), option: await select.locator('option:checked').textContent() }), contentType: 'application/json' })
    await expect(select).toHaveValue(String(rating))
    await expect(select.locator('option:checked')).toHaveText(`${rating}점`)
  })
}

for (const rating of [0.5, 4.5, 2.25]) {
  test(`${rating}점 후기의 본문만 수정하고 정수 평점 뒤 원래 값을 다시 선택`, async ({ page, api }) => {
    api.user = api.users.find((user) => user.id === 'member')
    api.reviews = [{ id: 41, userId: 'member', productId: 901, rating, comment: '원래 소수 후기' }]
    await page.goto('/products/901')
    const row = page.locator('.comment-row')
    await row.getByRole('button', { name: '수정', exact: true }).click()
    const form = row.locator('.comment-edit-form')
    await form.getByRole('textbox', { name: '후기 내용', exact: true }).fill('본문만 수정한 소수 후기')
    await form.getByRole('button', { name: '저장', exact: true }).click()
    await expect(form).toHaveCount(0)
    expect(api.reviews[0].rating).toBe(rating)
    expect(api.calls.filter((call) => call.method === 'PUT' && call.path === '/comments/41')[0].body).toEqual({ rating, comment: '본문만 수정한 소수 후기' })
    await row.getByRole('button', { name: '수정', exact: true }).click()
    const select = form.getByRole('combobox', { name: '평점', exact: true })
    await select.selectOption('3')
    await expect(select).toHaveValue('3')
    await select.selectOption(String(rating))
    await expect(select).toHaveValue(String(rating))
    await form.getByRole('button', { name: '저장', exact: true }).click()
    await expect(form).toHaveCount(0)
    expect(api.reviews[0].rating).toBe(rating)
    expect(api.calls.filter((call) => call.method === 'PUT' && call.path === '/comments/41').map((call) => call.body.rating)).toEqual([rating, rating])
  })
}

test('후기 편집 중 재연결로 원본 평점이 바뀌어도 시작값과 현재 선택을 유지', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  api.reviews = [{ id: 42, userId: 'member', productId: 901, rating: 4.5, comment: '재연결 전 후기' }]
  await page.goto('/products/901')
  const row = page.locator('.comment-row')
  await row.getByRole('button', { name: '수정', exact: true }).click()
  const form = row.locator('.comment-edit-form')
  const select = form.getByRole('combobox', { name: '평점', exact: true })
  await form.getByRole('textbox', { name: '후기 내용', exact: true }).fill('저장 전 내 초안')
  const reads = api.calls.filter((call) => call.path === '/products/901/comments').length
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  api.reviews[0] = { ...api.reviews[0], rating: 2.25, comment: '서버에서 바뀐 후기' }
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(() => api.calls.filter((call) => call.path === '/products/901/comments').length).toBeGreaterThan(reads)
  await expect(row.locator('.badge')).toHaveText('2.3점')
  await expect(select).toHaveValue('4.5')
  await expect(form.getByRole('textbox', { name: '후기 내용', exact: true })).toHaveValue('저장 전 내 초안')
  await select.selectOption('3')
  await select.selectOption('4.5')
  await expect(select).toHaveValue('4.5')
  await expect(select.locator('option[value="2.25"]')).toHaveCount(1)
  await expect(select.locator('option[value="4.5"]')).toHaveCount(1)
  await form.getByRole('button', { name: '취소', exact: true }).click()
  expect(api.reviews[0].rating).toBe(2.25)
  expect(api.calls.filter((call) => call.method === 'PUT')).toHaveLength(0)
})

test('소수 후기 저장 거절은 선택과 본문을 유지하고 명시적 재시도만 저장', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  api.reviews = [{ id: 43, userId: 'member', productId: 901, rating: 0.5, comment: '거절 전 후기' }]
  let attempts = 0
  await page.route('**/api/comments/43', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    attempts += 1
    if (attempts === 1) return route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') })
    await route.fallback()
  })
  await page.goto('/products/901')
  const row = page.locator('.comment-row')
  await row.getByRole('button', { name: '수정', exact: true }).click()
  const form = row.locator('.comment-edit-form')
  await form.getByRole('textbox', { name: '후기 내용', exact: true }).fill('다시 저장할 본문')
  await form.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(form.getByRole('button', { name: '저장', exact: true })).toBeEnabled()
  await expect(form.getByRole('combobox', { name: '평점', exact: true })).toHaveValue('0.5')
  await expect(form.getByRole('textbox', { name: '후기 내용', exact: true })).toHaveValue('다시 저장할 본문')
  expect(api.reviews[0].comment).toBe('거절 전 후기')
  expect(attempts).toBe(1)
  await form.getByRole('button', { name: '저장', exact: true }).click()
  await expect(form).toHaveCount(0)
  expect(api.reviews[0]).toMatchObject({ rating: 0.5, comment: '다시 저장할 본문' })
  expect(attempts).toBe(2)
})

test('다른 회원은 소수 후기의 편집 조작을 볼 수 없고 관리자 편집은 저장값을 선택', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'other')
  api.reviews = [{ id: 44, userId: 'member', productId: 901, rating: 4.5, comment: '권한 소수 후기' }]
  await page.goto('/products/901')
  await expect(page.locator('.comment-row').getByRole('button', { name: '수정', exact: true })).toHaveCount(0)
  api.user = api.users.find((user) => user.id === 'admin')
  await page.reload()
  await page.locator('.comment-row').getByRole('button', { name: '수정', exact: true }).click()
  await expect(page.locator('.comment-edit-form').getByRole('combobox', { name: '평점', exact: true })).toHaveValue('4.5')
  expect(api.calls.filter((call) => call.method === 'PUT')).toHaveLength(0)
})

test('390px 웹에서 소수 평점을 보존하고 Tab과 Enter로 후기 폼을 저장', async ({ page, api }) => {
  api.user = api.users.find((user) => user.id === 'member')
  api.reviews = [{ id: 45, userId: 'member', productId: 901, rating: 4.5, comment: '키보드 소수 후기' }]
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/products/901')
  await page.locator('.comment-row').getByRole('button', { name: '수정', exact: true }).click()
  const form = page.locator('.comment-edit-form')
  const select = form.getByRole('combobox', { name: '평점', exact: true })
  await select.selectOption('4')
  await select.selectOption('4.5')
  await select.focus()
  await expect(select).toBeFocused()
  await select.press('Tab')
  const text = form.getByRole('textbox', { name: '후기 내용', exact: true })
  await expect(text).toBeFocused()
  await text.fill('키보드로 보존한 후기')
  await text.press('Tab')
  const cancel = form.getByRole('button', { name: '취소', exact: true })
  await expect(cancel).toBeFocused()
  await cancel.press('Tab')
  const save = form.getByRole('button', { name: '저장', exact: true })
  await expect(save).toBeFocused()
  await save.press('Enter')
  await expect(form).toHaveCount(0)
  expect(api.reviews[0].rating).toBe(4.5)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
