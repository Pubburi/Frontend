import { test as base, expect } from '@playwright/test'

// Authored browser contract data. Production acceptance uses the reviewed catalog.
const row = (id, name, abv, volumeMl, price = 0) => ({ product: { id, name, type: '탁주', price, abv, img: null, orderCount: 0 }, volumeMl })
const small = row(7, '검수 300mL', 0, 300)
const middle = row(8, '검수 500mL', 7, 500, 5000)
const large = row(9, '검수 1000mL', 13, 1000, 9000)
const wire = (items = [[small, middle], [small, middle], [large, middle]]) => ({
  source: 'REVIEWED_LOCAL_CATALOG',
  themes: ['BEGINNER', 'GIFT', 'TABLE'].map((id, index) => ({ id, items: items[index] })),
})
const ok = (data) => ({ data, error: null })
const pageOf = (items) => ({ items, page: 1, size: 12, total: items.length, totalPages: items.length ? 1 : 0, hasNext: false })
const test = base.extend({
  fixture: [async ({ page }, use) => {
    const fixture = { calls: [], themeReads: 0, replies: [], gates: [], pageErrors: [], unexpected: [] }
    fixture.hold = () => {
      let release
      const wait = new Promise((done) => { release = done })
      const gate = { wait, release, started: false }
      fixture.gates.push(gate)
      return gate
    }
    page.on('pageerror', (error) => fixture.pageErrors.push(error.message))
    await page.route('**/api/**', async (route) => {
      const request = route.request()
      const { pathname, search } = new URL(request.url())
      const path = pathname.slice(4)
      const method = request.method()
      fixture.calls.push({ path, method, search })
      if (path === '/products/themes' && method === 'GET') {
        expect(search).toBe('')
        fixture.themeReads++
        const reply = fixture.replies.shift() ?? { status: 200, data: wire() }
        const gate = fixture.gates.find((value) => !value.started)
        if (gate) { gate.started = true; await gate.wait }
        return route.fulfill({ status: reply.status, json: reply.status === 200 ? ok(reply.data) : { data: null, error: { code: 'REQUEST_FAILED' } } })
      }
      if (method === 'GET' && path === '/auth/me') return route.fulfill({ status: 401, json: { data: null, error: { code: 'UNAUTHORIZED' } } })
      if (method === 'GET' && ['/products/popular', '/products/suggestions'].includes(path)) return route.fulfill({ json: ok(path.endsWith('/suggestions') ? { items: [] } : []) })
      if (method === 'GET' && path === '/markets') return route.fulfill({ json: ok(pageOf([])) })
      if (method === 'GET' && path === '/products') return route.fulfill({ json: ok(pageOf([small.product])) })
      if (method === 'GET' && /^\/products\/[789]$/.test(path)) {
        const id = Number(path.split('/').at(-1))
        return route.fulfill({ json: ok([small, middle, large].find((item) => item.product.id === id).product) })
      }
      if (method === 'GET' && /^\/products\/[789]\/features$/.test(path)) {
        const id = Number(path.split('/').at(-2))
        const { volumeMl } = [small, middle, large].find((item) => item.product.id === id)
        return route.fulfill({ json: ok({ productId: id, volumeMl, description: null, tasteTags: null, aromaTags: null, sourceName: null, sourceUrl: null, sourceNote: null }) })
      }
      if (method === 'GET' && /^\/products\/[789]\/comments$/.test(path)) return route.fulfill({ json: ok({ ...pageOf([]), size: 10, ratingSummary: { count: 0, average: null } }) })
      if (method === 'GET' && /^\/products\/[789]\/similar$/.test(path)) return route.fulfill({ json: ok({ items: [] }) })
      fixture.unexpected.push({ path, method })
      return route.fulfill({ status: 501, json: { data: null, error: { code: 'UNKNOWN_REQUEST' } } })
    })
    try { await use(fixture) } finally {
      fixture.gates.forEach((gate) => gate.release())
      expect(fixture.unexpected).toEqual([])
      expect(fixture.pageErrors).toEqual([])
      expect(fixture.calls.every(({ method }) => method === 'GET')).toBe(true)
    }
  }, { auto: true }],
})

const panel = (page) => page.getByRole('region', { name: '테마로 둘러보기', exact: true })
const option = (page, name) => panel(page).getByRole('button', { name, exact: true })
const cards = (page) => panel(page).locator('[data-theme-product]')
const retry = (page) => option(page, '테마 목록 다시 확인')
const ids = (page) => cards(page).evaluateAll((nodes) => nodes.map((node) => Number(node.dataset.themeProduct)))

for (const width of [1280, 390]) test(`F08 ${width}px 같은 화면 테마 전환과 키보드 상세·Back 복원`, async ({ page, fixture }, info) => {
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/?occasion=demo')
  await expect(panel(page)).toBeVisible()
  expect(fixture.themeReads).toBe(0)
  const search = page.getByLabel('상품 검색', { exact: true })
  await search.fill('미제출 테마 검색')
  await option(page, '입문').press('Enter')
  await expect(cards(page)).toHaveCount(2)
  await expect(option(page, '입문')).toBeFocused()
  await expect(panel(page)).toContainText('도수 7% 이하')
  await expect(cards(page).first()).toContainText('시연 가격 0원 · 도수 0% · 300mL')
  await option(page, '선물').press('Space')
  await expect(option(page, '선물')).toHaveAttribute('aria-pressed', 'true')
  await expect(panel(page)).toContainText('용량 300–500mL')
  await option(page, '음식 자리').press('Enter')
  await expect(option(page, '음식 자리')).toBeFocused()
  await expect(panel(page)).toContainText('용량 500mL 이상')
  expect(await ids(page)).toEqual([9, 8])
  expect(fixture.themeReads).toBe(1)
  await expect(page).toHaveURL('/?occasion=demo')
  await expect(search).toHaveValue('미제출 테마 검색')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const screenshot = info.outputPath(`product-themes-${width}.png`)
  await panel(page).screenshot({ path: screenshot })
  await info.attach(`product-themes-${width}.png`, { path: screenshot, contentType: 'image/png' })
  const first = cards(page).first().getByRole('link')
  await page.keyboard.press('Tab'); await expect(first).toBeFocused()
  await first.press('Enter')
  await expect(page.getByRole('heading', { name: large.product.name, level: 1, exact: true })).toBeVisible()
  await page.goBack()
  await expect(option(page, '음식 자리')).toHaveAttribute('aria-pressed', 'true')
  await expect(cards(page)).toHaveCount(2)
  expect(await ids(page)).toEqual([9, 8])
  expect(fixture.themeReads).toBe(2)
})

test('F08 첫 조회가 늦어도 마지막으로 고른 테마에만 목록을 표시', async ({ page, fixture }) => {
  await page.goto('/')
  const gate = fixture.hold()
  await option(page, '입문').click()
  await expect.poll(() => gate.started).toBe(true)
  await option(page, '선물').click()
  await option(page, '음식 자리').press('Space')
  await expect(cards(page)).toHaveCount(0)
  await expect(option(page, '음식 자리')).toHaveAttribute('aria-pressed', 'true')
  gate.release()
  await expect(cards(page)).toHaveCount(2)
  expect(await ids(page)).toEqual([9, 8])
  expect(fixture.themeReads).toBe(1)
})

test('F08 현재 409, 장애와 정상 빈 테마에서 선택과 재확인 포커스를 유지', async ({ page, fixture }) => {
  await page.goto('/')
  await option(page, '선물').click()
  await expect(cards(page)).toHaveCount(2)
  fixture.replies.push({ status: 409 })
  const gate = fixture.hold()
  await retry(page).press('Enter')
  await expect.poll(() => gate.started).toBe(true)
  await expect(retry(page)).toBeFocused()
  await expect(retry(page)).toHaveAttribute('aria-disabled', 'true')
  await expect(cards(page)).toHaveCount(0)
  await retry(page).press('Enter'); expect(fixture.themeReads).toBe(2)
  gate.release()
  await expect(panel(page)).toContainText('테마 상품 정보가 변경되었습니다')
  fixture.replies.push({ status: 200, data: { source: 'UNAVAILABLE', themes: [] } })
  await retry(page).press('Enter')
  await expect(panel(page)).toContainText('테마 목록을 준비하지 못했습니다')
  fixture.replies.push({ status: 200, data: wire([[], [], []]) })
  await retry(page).press('Enter')
  await expect(panel(page)).toContainText('이 기준에 맞는 검수 상품이 없습니다')
  await expect(option(page, '선물')).toHaveAttribute('aria-pressed', 'true')
  await expect(retry(page)).toBeFocused()
  await retry(page).press('Enter')
  await expect(cards(page)).toHaveCount(2)
  await expect(option(page, '선물')).toHaveAttribute('aria-pressed', 'true')
  expect(fixture.themeReads).toBe(5)
})

test('F08 잘못된 상품 기준은 부분 목록을 표시하지 않고 최신 응답으로 복구', async ({ page, fixture }) => {
  const bad = wire([[small, middle], [small, middle], [middle, large]])
  fixture.replies.push({ status: 200, data: bad })
  await page.goto('/')
  await option(page, '입문').click()
  await expect(panel(page)).toContainText('테마 목록을 불러오지 못했습니다')
  await expect(cards(page)).toHaveCount(0)
  await retry(page).click(); await expect(cards(page)).toHaveCount(2)
  expect(await ids(page)).toEqual([7, 8])
  expect(fixture.themeReads).toBe(2)
})
