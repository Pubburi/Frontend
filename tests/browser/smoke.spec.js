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
    const state = { user: null, catalogFailures: 0, calls: [], unexpected: [], pageErrors: [] }
    page.on('pageerror', (error) => state.pageErrors.push(error.message))
    await page.route('**/api/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const path = url.pathname.slice('/api'.length)
      state.calls.push({ method: request.method(), path, query: Object.fromEntries(url.searchParams) })
      if (request.method() === 'GET' && path === '/auth/me') {
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
        const items = products.filter((item) => (!type || item.type === type) && item.name.includes(q))
        await route.fulfill({ json: success(pageOf(items)) })
        return
      }
      if (request.method() === 'GET' && path === '/products/popular') {
        await route.fulfill({ json: success(products) })
        return
      }
      if (request.method() === 'GET' && path === '/markets') {
        await route.fulfill({ json: success(pageOf([])) })
        return
      }
      if (request.method() === 'GET' && path === '/products/999/comments') {
        await route.fulfill({ status: 404, json: failure('NOT_FOUND') })
        return
      }
      if (request.method() === 'GET' && products.some((item) => path === `/products/${item.id}/comments`)) {
        await route.fulfill({ json: success(pageOf([], 10)) })
        return
      }
      if (request.method() === 'GET' && /^\/products\/\d+$/.test(path)) {
        const product = products.find((item) => item.id === Number(path.split('/').at(-1)))
        await route.fulfill({ status: product ? 200 : 404, json: product ? success(product) : failure('NOT_FOUND') })
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
