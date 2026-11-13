import { expect, test as base } from '@playwright/test'
import { openCatalogFilters } from './catalog-filters'

// Authored matched-product envelopes; no actual catalog/fact assertions.
const products = Array.from({ length: 14 }, (_, i) => ({ id: 1700 + i, name: `포커스 상품 ${i}`, type: '탁주', price: 7777, abv: 6, img: null, orderCount: 0 }))
const success = (data) => ({ data, message: 'ok', error: null })
const failure = (code) => ({ data: null, message: null, error: { code, message: code } })
const pageOf = (items, page = 1) => ({ items: items.slice((page - 1) * 12, page * 12), page, size: 12, total: items.length, totalPages: Math.ceil(items.length / 12), hasNext: page * 12 < items.length })
const initialQuery = new URLSearchParams({ q: '포커스', type: '탁주', minPriceKrw: '0', maxPriceKrw: '10000', minAbvPercent: '0', maxAbvPercent: '15', sort: 'name', page: '1' })
initialQuery.append('tasteTag', 'dry,sweet'); initialQuery.append('tasteTag', 'line\nbreak'); initialQuery.append('aromaTag', 'floral')
const initialUrl = `/products?${initialQuery}`
const test = base.extend({
  focusApi: [async ({ page }, use) => {
    const state = { calls: [], unexpected: [], errors: [] }
    page.on('pageerror', (error) => state.errors.push(error.message))
    await page.route('**/api/**', async (route) => {
      const req = route.request(); const url = new URL(req.url()); const q = url.searchParams
      state.calls.push({ method: req.method(), path: url.pathname, query: [...q] })
      if (req.method() === 'GET' && url.pathname === '/api/auth/me') return route.fulfill({ status: 401, json: failure('UNAUTHORIZED') })
      if (req.method() === 'GET' && url.pathname === '/api/products') {
        const items = products.filter((p) => !q.get('q') || p.name.includes(q.get('q')))
        return route.fulfill({ json: success(pageOf(items, Number(q.get('page') || 1))) })
      }
      state.unexpected.push(`${req.method()} ${url.pathname}`)
      return route.fulfill({ status: 501, json: failure('UNEXPECTED_TEST_REQUEST') })
    })
    await use(state)
    expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([])
    expect(state.calls.filter((c) => c.method !== 'GET')).toEqual([])
  }, { auto: true }],
})
async function holdSecondPage(page, status = 200) {
  let release; const gate = new Promise((resolve) => { release = resolve }); let started = false
  await page.route('**/api/products?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('page') !== '2') return route.fallback()
    started = true; await gate
    if (status !== 200) return route.fulfill({ status, json: failure(status === 400 ? 'BAD_REQUEST' : 'SERVICE_UNAVAILABLE') })
    return route.fallback()
  })
  return { release, started: () => started }
}
const nextButton = (page) => page.getByRole('navigation', { name: 'pagination', exact: true }).getByRole('button', { name: '다음', exact: true })
const results = (page) => page.getByRole('region', { name: '상품 검색 결과', exact: true })
const tasteShortcut = (page) => results(page).getByRole('button', { name: '저장한 취향으로 찾기', exact: true })

for (const width of [1280, 390]) {
  test(`${width}px 키보드 페이지 이동은 로딩 중 포커스를 잃지 않고 새 상품으로 Tab 연결`, async ({ page, focusApi }) => {
    await page.setViewportSize({ width, height: 900 })
    const gate = await holdSecondPage(page)
    try {
      await page.goto(initialUrl); await expect(page.locator('.product-card')).toHaveCount(12)
      await nextButton(page).focus(); await nextButton(page).press('Enter')
      await expect.poll(gate.started).toBe(true)
      await expect(page.getByRole('status', { name: '불러오는 중입니다.', exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe('BODY')
      await expect(results(page)).toBeFocused()
      gate.release(); await expect(page.locator('.product-card')).toHaveCount(2)
      await expect(results(page)).toBeFocused()
      const box = await results(page).boundingBox()
      const headerBottom = await page.locator('.topbar').evaluate((header) => header.getBoundingClientRect().bottom)
      expect(box.y).toBeGreaterThanOrEqual(headerBottom)
      expect(box.y).toBeLessThan(900)
      expect(await results(page).evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid')
      await page.keyboard.press('Tab')
      await expect(tasteShortcut(page)).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(page.locator('.product-card .product-image').first()).toBeFocused()
      await expect(page.locator('.product-card .product-image').first()).toHaveAttribute('href', '/products/1712')
      const query = new URLSearchParams(focusApi.calls.filter((c) => c.path === '/api/products').at(-1).query)
      expect(query.getAll('tasteTag')).toEqual(['dry,sweet', 'line\nbreak'])
      expect(query.getAll('aromaTag')).toEqual(['floral']); expect(query.get('minPriceKrw')).toBe('0')
      expect(query.get('page')).toBe('2')
      const previous = page.getByRole('button', { name: '이전', exact: true })
      await previous.focus(); await previous.press('Space')
      await expect(page.locator('.product-card')).toHaveCount(12)
      await expect(results(page)).toBeFocused()
      await expect(page).toHaveURL((url) => url.searchParams.get('page') === '1')
    } finally { gate.release() }
  })
}

test('로딩 중 Shift+Tab으로 이동한 키보드 포커스를 응답이 되돌리지 않음', async ({ page }) => {
  const gate = await holdSecondPage(page)
  try {
    await page.goto(initialUrl); await expect(page.locator('.product-card')).toHaveCount(12)
    await nextButton(page).focus(); await nextButton(page).press('Enter')
    await expect.poll(gate.started).toBe(true); await expect(results(page)).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    const previous = page.getByRole('button', { name: '전체 해제', exact: true })
    await expect(previous).toBeFocused()
    gate.release(); await expect(page.locator('.product-card')).toHaveCount(2)
    await expect(previous).toBeFocused()
  } finally { gate.release() }
})

test('390px 검색 결과의 취향 바로가기는 입력과 URL을 유지하고 안내로 키보드 포커스를 옮긴다', async ({ page, focusApi }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto(initialUrl); await expect(page.locator('.product-card')).toHaveCount(12)
  const query = page.getByLabel('상품 검색', { exact: true })
  await query.fill('아직 제출하지 않은 검색')
  const before = focusApi.calls.filter(({ path }) => path === '/api/products').length
  await tasteShortcut(page).press('Enter')
  await expect(page.getByRole('heading', { name: '취향 조건으로 검색', exact: true })).toBeFocused()
  await expect(page).toHaveURL(initialUrl)
  await expect(query).toHaveValue('아직 제출하지 않은 검색')
  expect(focusApi.calls.filter(({ path }) => path === '/api/products')).toHaveLength(before)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('region', { name: '취향 조건으로 검색', exact: true }).getByRole('link', { name: '전체 상품 보기', exact: true })).toBeFocused()
})

test('포인터 페이지 이동과 진행 중 새 검색 입력은 결과 포커스를 강제하지 않음', async ({ page }) => {
  const gate = await holdSecondPage(page)
  try {
    await page.goto(initialUrl); await expect(page.locator('.product-card')).toHaveCount(12)
    await nextButton(page).click(); await expect.poll(gate.started).toBe(true)
    await expect(results(page)).not.toBeFocused()
    const input = page.getByLabel('상품 검색', { exact: true }); await input.fill('아직 제출하지 않은 검색')
    gate.release(); await expect(page.locator('.product-card')).toHaveCount(2)
    await expect(input).toBeFocused(); await expect(input).toHaveValue('아직 제출하지 않은 검색')
  } finally { gate.release() }
})

test('현재 포커스 없는 script click은 키보드 의도로 포커스를 가져가지 않음', async ({ page }) => {
  await page.goto(initialUrl); await expect(page.locator('.product-card')).toHaveCount(12)
  const input = page.getByLabel('상품 검색', { exact: true }); await input.focus()
  await nextButton(page).evaluate((button) => button.click())
  await expect(page.locator('.product-card')).toHaveCount(2)
  await expect(input).toBeFocused(); await expect(results(page)).not.toBeFocused()
})

for (const status of [400, 503]) {
  test(`페이지 응답 ${status}도 결과 영역을 유지하고 Tab으로 명시적 복구에 연결`, async ({ page }) => {
    const gate = await holdSecondPage(page, status)
    try {
      await page.goto(initialUrl); await expect(page.locator('.product-card')).toHaveCount(12)
      await nextButton(page).focus(); await nextButton(page).press('Enter'); await expect.poll(gate.started).toBe(true)
      gate.release()
      await expect(page.getByRole('heading', { name: status === 400 ? '검색 조건을 확인해 주세요' : '상품을 불러오지 못했습니다', exact: true })).toBeVisible()
      await expect(results(page)).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(tasteShortcut(page)).toBeFocused()
      await page.keyboard.press('Tab')
      const action = page.getByRole('button', { name: status === 400 ? '태그 조건 수정' : '다시 시도', exact: true })
      await expect(action).toBeFocused()
      if (status === 400) {
        await action.press('Enter')
        await expect(page.getByLabel('맛 태그 조건 1', { exact: true })).toBeFocused()
        await expect(page.getByLabel('맛 태그 조건 1', { exact: true })).toHaveValue('dry,sweet')
      }
    } finally { gate.release() }
  })
}

test('페이지 요청 중 다른 경로로 이동해도 늦은 응답이 포커스를 가져가지 않음', async ({ page }) => {
  const gate = await holdSecondPage(page)
  try {
    await page.goto(initialUrl); await expect(page.locator('.product-card')).toHaveCount(12)
    await nextButton(page).focus(); await nextButton(page).press('Enter'); await expect.poll(gate.started).toBe(true)
    const cart = page.getByRole('navigation', { name: '주요 메뉴', exact: true }).getByRole('link', { name: '장바구니', exact: true })
    await cart.click(); await expect(page.getByRole('heading', { name: '장바구니', exact: true })).toBeVisible()
    const old = page.waitForResponse((r) => new URL(r.url()).searchParams.get('page') === '2')
    gate.release(); await (await old).finished(); await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    await expect(cart).toBeFocused(); await expect(results(page)).toHaveCount(0)
  } finally { gate.release() }
})

test('결과 영역이 계속 집중된 POP은 지난 키보드 이동의 스크롤 예외를 재사용하지 않음', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const nativeScrollTo = window.scrollTo.bind(window)
    window.__catalogScrollRequests = []
    window.scrollTo = (...args) => {
      window.__catalogScrollRequests.push({ args, search: location.search, focused: document.activeElement?.getAttribute('aria-label') })
      return nativeScrollTo(...args)
    }
  })
  await page.goto(initialUrl); await expect(page.locator('.product-card')).toHaveCount(12)
  await nextButton(page).focus(); await nextButton(page).press('Enter')
  await expect(page.locator('.product-card')).toHaveCount(2); await expect(results(page)).toBeFocused()
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0)
  await page.evaluate(() => { window.__catalogScrollRequests = [] })
  await page.goBack(); await expect(page).toHaveURL((url) => url.searchParams.get('page') === '1')
  await expect(page.locator('.product-card')).toHaveCount(12); await expect(results(page)).toBeFocused()
  // Native history can subsequently restore its own position; observe the unchanged App request.
  await expect.poll(() => page.evaluate(() => window.__catalogScrollRequests.filter((call) => call.args[0]?.top === 0).length)).toBe(1)
  // Canonicalize once, then push an identical URL to refresh only navigation ownership.
  const search = page.getByRole('button', { name: '검색하기', exact: true })
  await search.click(); await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
  const sameUrl = page.url(); const previousKey = await page.evaluate(() => history.state.key)
  await search.click(); await expect(page).toHaveURL(sameUrl)
  await expect.poll(() => page.evaluate(() => history.state.key)).not.toBe(previousKey)
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
  await nextButton(page).focus(); await nextButton(page).press('Enter')
  await expect(page.locator('.product-card')).toHaveCount(2); await expect(results(page)).toBeFocused()
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0)
})

test('명시적 검색과 뒤로 이동은 입력의 현재 포커스를 보존', async ({ page }) => {
  await page.goto('/products?sort=name&page=1'); await expect(page.locator('.product-card')).toHaveCount(12)
  const input = page.getByLabel('상품 검색', { exact: true }); await input.fill('포커스 상품 13'); await input.press('Enter')
  await expect(page.locator('.product-card')).toHaveCount(1); await expect(input).toBeFocused()
  await openCatalogFilters(page)
  const min = page.getByLabel('최소 가격(원)', { exact: true }); await min.focus(); await page.goBack()
  await expect(page.locator('.product-card')).toHaveCount(12); await expect(min).toBeFocused()
})
