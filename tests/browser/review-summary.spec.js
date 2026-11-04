import { expect, test as base } from '@playwright/test'

// Authored review/API examples, separate from real Backend/DB acceptance.
const ok = (data) => ({ data, message: 'ok', error: null })
const error = (code) => ({ data: null, message: null, error: { code, message: code } })
const product = (id) => ({ id, name: `후기 표본 ${id}`, type: '탁주', price: 6000, abv: 6, img: null, orderCount: 0 })
const review = (id, rating, productId = 901) => ({ id, productId, rating, comment: `회원 평가 ${id}`, userId: 'member' })
const pageOf = (items, page, size) => ({ items: items.slice((page - 1) * size, page * size), page, size, total: items.length, totalPages: Math.ceil(items.length / size), hasNext: page * size < items.length })
const test = base.extend({
  reviewsApi: [async ({ page }, use) => {
    const state = { reviews: [], user: { id: 'member', name: '회원', role: 'USER', stamps: 0 }, calls: [], errors: [], unexpected: [], failures: 0, omitSummary: false, summaryOverride: undefined }
    state.response = (url) => {
      const productId = Number(url.pathname.split('/').at(-2)), sort = url.searchParams.get('sort') || 'latest'
      const all = state.reviews.filter((item) => item.productId === productId)
      const items = all.toSorted((a, b) => (sort === 'rating_desc' ? b.rating - a.rating : sort === 'rating_asc' ? a.rating - b.rating : 0) || b.id - a.id)
      const data = pageOf(items, Number(url.searchParams.get('page') || 1), Number(url.searchParams.get('size') || 10))
      if (!state.omitSummary && url.searchParams.get('includeSummary') === 'true') data.ratingSummary = state.summaryOverride ?? { count: all.length, average: all.length ? Math.round(all.reduce((sum, item) => sum + item.rating, 0) / all.length * 100) / 100 : null }
      return data
    }
    page.on('pageerror', (err) => state.errors.push(err.message))
    await page.route('**/api/**', async (route) => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
      const body = request.postData() ? request.postDataJSON() : null
      state.calls.push({ path, method, query: Object.fromEntries(url.searchParams), body })
      if (path === '/api/auth/me') return route.fulfill({ status: state.user ? 200 : 401, json: state.user ? ok(state.user) : error('UNAUTHORIZED') })
      if (path === '/api/auth/logout') { state.user = null; return route.fulfill({ json: ok(true) }) }
      if (/^\/api\/users\/me\/favorites\/\d+$/.test(path)) return route.fulfill({ json: ok({ productId: Number(path.split('/').at(-1)), favorited: false }) })
      if (/^\/api\/products\/(901|902)$/.test(path)) return route.fulfill({ json: ok(product(Number(path.split('/').at(-1)))) })
      if (/^\/api\/products\/(901|902)\/features$/.test(path)) return route.fulfill({ json: ok({ productId: Number(path.split('/').at(-2)), volumeMl: null, description: null, tasteTags: null, aromaTags: null, sourceName: null, sourceUrl: null, sourceNote: null }) })
      if (/^\/api\/products\/(901|902)\/comments$/.test(path) && method === 'GET') {
        if (state.failures) { state.failures--; return route.fulfill({ status: 503, json: error('SERVICE_UNAVAILABLE') }) }
        return route.fulfill({ json: ok(state.response(url)) })
      }
      if (path === '/api/comments' && method === 'POST') {
        const item = { ...body, id: Math.max(1000, ...state.reviews.map((item) => item.id)) + 1, userId: state.user.id }
        state.reviews.push(item); return route.fulfill({ status: 201, json: ok(item) })
      }
      if (/^\/api\/comments\/\d+$/.test(path) && ['PUT', 'DELETE'].includes(method)) {
        const id = Number(path.split('/').at(-1)), item = state.reviews.find((item) => item.id === id)
        if (method === 'PUT') Object.assign(item, body)
        else state.reviews = state.reviews.filter((item) => item.id !== id)
        return route.fulfill({ json: ok(method === 'PUT' ? item : true) })
      }
      state.unexpected.push(`${method} ${path}`)
      return route.fulfill({ status: 501, json: error('UNEXPECTED_TEST_REQUEST') })
    })
    await use(state)
    expect(state.errors).toEqual([])
    expect(state.unexpected).toEqual([])
  }, { auto: true }],
})

for (const width of [1280, 390]) test(`전체평균·후기수·평점정렬과 페이지 초기화, ${width}px`, async ({ page, reviewsApi }) => {
  await page.setViewportSize({ width, height: 900 })
  const memberId = 'ci_jpa_0123456789abcdef_member'
  reviewsApi.user = { ...reviewsApi.user, id: memberId }
  reviewsApi.reviews = [0, .5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.555].map((rating, index) => ({ ...review(101 + index, rating), userId: memberId }))
  await page.goto('/products/901')
  await expect(page.getByRole('heading', { name: '회원 후기 12', exact: true })).toBeVisible()
  await expect(page.locator('.review-summary')).toHaveText('평균 2.75점 · 전체 후기 12개')
  await expect(page.locator('.comment-row > p')).toHaveText(Array.from({ length: 10 }, (_, index) => `회원 평가 ${112 - index}`))
  await page.getByRole('navigation', { name: 'pagination', exact: true }).getByRole('button', { name: '다음', exact: true }).click()
  await expect(page.locator('.comment-row > p')).toHaveText(['회원 평가 102', '회원 평가 101'])
  await expect(page.locator('.review-summary')).toHaveText('평균 2.75점 · 전체 후기 12개')
  const order = page.getByRole('combobox', { name: '후기 정렬', exact: true })
  await order.focus(); await expect(order).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('.comment-form').getByRole('combobox', { name: '평점', exact: true })).toBeFocused()
  await order.selectOption('rating_desc')
  await expect(order).toHaveValue('rating_desc')
  await expect(page.getByRole('navigation', { name: 'pagination', exact: true })).toContainText('1 / 2')
  await expect(page.locator('.comment-row > p')).toHaveText(Array.from({ length: 10 }, (_, index) => `회원 평가 ${112 - index}`))
  await order.selectOption('rating_asc')
  await expect(page.locator('.comment-row > p')).toHaveText(Array.from({ length: 10 }, (_, index) => `회원 평가 ${101 + index}`))
  const reads = reviewsApi.calls.filter((call) => call.path.endsWith('/comments') && call.method === 'GET')
  expect(reads.every((call) => call.query.includeSummary === 'true')).toBe(true)
  expect(reads.at(-1).query).toEqual({ page: '1', size: '10', sort: 'rating_asc', includeSummary: 'true' })
  await expect(page.locator('.comment-head strong')).toHaveText(Array.from({ length: 10 }, () => memberId))
  const bounds = await page.locator('.comment-row').evaluateAll((rows) => rows.map((row) => {
    const card = row.getBoundingClientRect(), name = row.querySelector('.comment-head strong').getBoundingClientRect(), badge = row.querySelector('.comment-head > .badge').getBoundingClientRect()
    return { withinCard: name.left >= card.left && name.right <= card.right && badge.left >= card.left && badge.right <= card.right, separated: name.right <= badge.left }
  }))
  expect(bounds.every((row) => row.withinCard && row.separated)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await test.info().attach(`review-summary-${width}`, { body: await page.locator('.comment-box').screenshot(), contentType: 'image/png' })
})

test('평점동률의 서버순서와 소수·legacy범위를 보존하고 전체가 없는 경우만 null로 표시', async ({ page, reviewsApi }) => {
  reviewsApi.reviews = [review(1, 5.555), review(3, 5.555), review(2, 5.555)]
  await page.goto('/products/901')
  await expect(page.locator('.review-summary')).toHaveText('평균 5.56점 · 전체 후기 3개')
  await page.getByRole('combobox', { name: '후기 정렬', exact: true }).selectOption('rating_desc')
  await expect(page.locator('.comment-row > p')).toHaveText(['회원 평가 3', '회원 평가 2', '회원 평가 1'])
  await page.goto('/products/902')
  await expect(page.locator('.review-summary')).toHaveText('아직 등록된 평점이 없습니다. · 전체 후기 0개')
  await expect(page.getByRole('heading', { name: '아직 등록된 후기가 없습니다', exact: true })).toBeVisible()
})

test('실제 0평균은 빈값으로 바꾸지 않고, 등록·수정·삭제 뒤 현재 정렬의 전체집계를 갱신', async ({ page, reviewsApi }) => {
  reviewsApi.reviews = [review(1, 0)]
  await page.goto('/products/901')
  await expect(page.locator('.review-summary')).toHaveText('평균 0점 · 전체 후기 1개')
  await page.getByRole('combobox', { name: '후기 정렬', exact: true }).selectOption('rating_asc')
  await page.getByLabel('후기', { exact: true }).fill('새 회원 평가')
  await page.locator('.comment-form').getByRole('combobox', { name: '평점', exact: true }).selectOption('5')
  await page.getByRole('button', { name: '후기 등록', exact: true }).click()
  await expect(page.locator('.review-summary')).toHaveText('평균 2.5점 · 전체 후기 2개')
  const old = page.locator('.comment-row').filter({ has: page.getByText('회원 평가 1', { exact: true }) })
  await old.getByRole('button', { name: '수정', exact: true }).click()
  await old.getByRole('combobox', { name: '평점', exact: true }).selectOption('3')
  await old.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.locator('.review-summary')).toHaveText('평균 4점 · 전체 후기 2개')
  await old.getByRole('button', { name: '삭제', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '삭제', exact: true }).click()
  await expect(page.locator('.review-summary')).toHaveText('평균 5점 · 전체 후기 1개')
  await expect(page.getByRole('combobox', { name: '후기 정렬', exact: true })).toHaveValue('rating_asc')
})

test('마지막 페이지 한 후기 삭제는 앞 페이지로 돌아가며 전체집계를 현재값으로 읽음', async ({ page, reviewsApi }) => {
  reviewsApi.reviews = Array.from({ length: 11 }, (_, i) => review(i + 1, i === 0 ? 1 : 5))
  await page.goto('/products/901')
  await page.getByRole('navigation', { name: 'pagination', exact: true }).getByRole('button', { name: '다음', exact: true }).click()
  await expect(page.locator('.comment-row > p')).toHaveText(['회원 평가 1'])
  await page.locator('.comment-row').getByRole('button', { name: '삭제', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '삭제', exact: true }).click()
  await expect(page.locator('.comment-row')).toHaveCount(10)
  await expect(page.locator('.review-summary')).toHaveText('평균 5점 · 전체 후기 10개')
  expect(reviewsApi.calls.filter((call) => call.path.endsWith('/comments') && call.method === 'GET').at(-1).query.page).toBe('1')
})

test('정렬을 빨리 바꿔도 늦은 이전 응답이 현재 순서/평균을 덮지 않음', async ({ page, reviewsApi }) => {
  reviewsApi.reviews = [review(1, 0), review(2, 5)]
  await page.goto('/products/901')
  await expect(page.locator('.review-summary')).toHaveText('평균 2.5점 · 전체 후기 2개')
  let release, started
  const held = new Promise((resolve) => { release = resolve }), began = new Promise((resolve) => { started = resolve })
  await page.route('**/api/products/901/comments?**', async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('sort') !== 'rating_desc') return route.fallback()
    const old = reviewsApi.response(url)
    old.items = old.items.map((item) => ({ ...item, rating: item.id === 2 ? 5 : 4.5 }))
    old.ratingSummary = { count: 2, average: 4.75 }
    started(); await held; return route.fulfill({ json: ok(old) })
  })
  try {
    await page.getByRole('combobox', { name: '후기 정렬', exact: true }).selectOption('rating_desc')
    await began
    await expect(page.locator('.review-summary')).toHaveText('전체 평점을 불러오는 중입니다.')
    await page.getByRole('combobox', { name: '후기 정렬', exact: true }).selectOption('rating_asc')
    await expect(page.locator('.comment-row > p')).toHaveText(['회원 평가 1', '회원 평가 2'])
    const delivered = page.waitForResponse((response) => new URL(response.url()).searchParams.get('sort') === 'rating_desc')
    release(); await delivered; await page.evaluate(() => new Promise(requestAnimationFrame))
    await expect(page.locator('.review-summary')).toHaveText('평균 2.5점 · 전체 후기 2개')
    await expect(page.locator('.comment-row > p')).toHaveText(['회원 평가 1', '회원 평가 2'])
  } finally { release() }
})

test('누락/불일치 집계는 0이나 페이지평균으로 만들지 않고 명시 재확인으로 복구', async ({ page, reviewsApi }) => {
  reviewsApi.reviews = [review(1, 4)]
  reviewsApi.omitSummary = true
  await page.goto('/products/901')
  await expect(page.locator('.review-summary')).toContainText('전체 평점 정보를 확인하지 못했습니다.')
  await expect(page.locator('.review-summary')).not.toContainText('평균 4점')
  await expect(page.locator('.comment-row > p')).toHaveText('회원 평가 1')
  reviewsApi.omitSummary = false; reviewsApi.summaryOverride = { count: 99, average: 5 }
  await page.getByRole('button', { name: '평점 집계 다시 확인', exact: true }).click()
  await expect(page.locator('.review-summary')).toContainText('전체 평점 정보를 확인하지 못했습니다.')
  reviewsApi.summaryOverride = undefined
  await page.getByRole('button', { name: '평점 집계 다시 확인', exact: true }).click()
  await expect(page.locator('.review-summary')).toHaveText('평균 4점 · 전체 후기 1개')
})

test('현재 정렬의 오류는 이전 집계를 노출하지 않고 초안을 유지한 채 같은 조건으로 재시도', async ({ page, reviewsApi }) => {
  reviewsApi.reviews = [review(1, 3)]
  await page.goto('/products/901')
  await expect(page.locator('.review-summary')).toHaveText('평균 3점 · 전체 후기 1개')
  await page.getByLabel('후기', { exact: true }).fill('아직 제출하지 않은 후기')
  reviewsApi.failures = 1
  await page.getByRole('combobox', { name: '후기 정렬', exact: true }).selectOption('rating_asc')
  await expect(page.getByRole('heading', { name: '후기를 불러오지 못했습니다', exact: true })).toBeVisible()
  await expect(page.locator('.review-summary')).toHaveText('전체 평점 정보를 불러오지 못했습니다.')
  await expect(page.locator('.comment-row')).toHaveCount(0)
  await expect(page.getByLabel('후기', { exact: true })).toHaveValue('아직 제출하지 않은 후기')
  await page.getByRole('button', { name: '다시 시도', exact: true }).click()
  await expect(page.locator('.review-summary')).toHaveText('평균 3점 · 전체 후기 1개')
  expect(reviewsApi.calls.filter((call) => call.path.endsWith('/comments') && call.method === 'GET').at(-1).query.sort).toBe('rating_asc')
})
