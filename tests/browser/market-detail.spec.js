import { expect, test as base } from '@playwright/test'

// Authored API fixtures exercise view ownership; actual GET-only integration is separate.
const initialMarkets = [
  { id: 901, name: '시연 매장 하나', latitude: 0, longitude: 127.7654321, image: 'market1.png' },
  { id: 902, name: '시연 매장 둘', latitude: 37.1234567, longitude: 0, image: null },
]
const envelope = (data) => ({ data, message: 'ok', error: null })
const failure = (status) => ({ data: null, message: null, error: { code: ({ 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND' })[status] || 'SERVICE_UNAVAILABLE' } })
const test = base.extend({
  fixture: [async ({ page }, use) => {
    const state = { markets: structuredClone(initialMarkets), details: new Map(), calls: [], unexpected: [], errors: [], gates: new Map(), allGates: [] }
    state.hold = (path, response) => {
      let release
      const wait = new Promise((resolve) => { release = resolve })
      const gate = { response, wait, release, started: false }
      state.allGates.push(gate)
      state.gates.set(path, gate)
      return gate
    }
    state.reads = (id) => state.calls.filter((call) => call.path === `/markets/${id}`).length
    page.on('pageerror', (error) => state.errors.push(error.message))
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url()), path = url.pathname.slice(4), method = route.request().method()
      state.calls.push({ path, method, search: url.search })
      if (method === 'GET' && path === '/auth/me') return route.fulfill({ status: 401, json: failure(401) })
      if (method === 'GET' && path === '/products/popular') return route.fulfill({ json: envelope([]) })
      if (method === 'GET' && path === '/markets') return route.fulfill({ json: envelope({ items: state.markets, page: 1, size: 12, total: state.markets.length, totalPages: 1, hasNext: false }) })
      if (method === 'GET' && /^\/markets\/\d+$/.test(path)) {
        const id = Number(path.split('/').at(-1))
        const gate = state.gates.get(path)
        const response = structuredClone(gate?.response ?? state.details.get(id) ?? { status: state.markets.some((m) => m.id === id) ? 200 : 404, data: state.markets.find((m) => m.id === id) })
        if (gate) { gate.started = true; state.gates.delete(path); await gate.wait }
        return route.fulfill({ status: response.status, json: response.status === 200 ? envelope(response.data) : failure(response.status) })
      }
      state.unexpected.push({ method, path })
      await route.fulfill({ status: 501, json: failure(501) })
    })
    try { await use(state) } finally {
      for (const gate of state.allGates) gate.release()
      expect(state.unexpected).toEqual([])
      expect(state.errors).toEqual([])
      expect(state.calls.every((call) => call.method === 'GET')).toBe(true)
    }
  }, { auto: true }],
})

const detail = (page) => page.locator('.market-detail-view')
async function facts(page, market) {
  await expect(detail(page)).toHaveAttribute('data-market-id', String(market.id))
  await expect(page.getByRole('heading', { name: market.name, exact: true })).toBeVisible()
  await expect(page.locator('[data-market-field="latitude"]')).toHaveText(String(market.latitude))
  await expect(page.locator('[data-market-field="longitude"]')).toHaveText(String(market.longitude))
}
async function homeMarket(page, name) {
  await page.getByRole('link', { name: '홈의 매장 목록', exact: true }).click()
  await page.getByRole('link', { name: `${name} 상세 보기`, exact: true }).click()
}

for (const width of [1280, 390]) {
  test(`public home keyboard/detail/refresh/reload/Back preserves exact coordinate0 at${width}`, async ({ page, fixture }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const link = page.getByRole('link', { name: `${initialMarkets[0].name} 상세 보기`, exact: true })
    await link.focus(); await expect(link).toBeFocused(); await link.press('Enter')
    await facts(page, initialMarkets[0])
    await expect(detail(page)).toContainText('시연용 매장 위치 정보입니다.')
    await expect(detail(page)).toContainText('매장 사진은 현재 제공되지 않습니다.')
    await expect(detail(page).locator('img')).toHaveCount(0)
    const refresh = page.getByRole('button', { name: '매장 정보 새로고침', exact: true })
    const gate = fixture.hold('/markets/901', { status: 200, data: { ...initialMarkets[0], name: '현재 바뀐 매장명' } })
    await refresh.focus(); await refresh.press('Enter')
    await expect.poll(() => gate.started).toBe(true)
    await expect(refresh).toBeFocused(); await expect(refresh).toHaveAttribute('aria-disabled', 'true')
    await expect(page.locator('[data-market-field]')).toHaveCount(0)
    await refresh.press('Enter'); expect(fixture.reads(901)).toBe(2)
    gate.release()
    await facts(page, { ...initialMarkets[0], name: '현재 바뀐 매장명' })
    await expect(refresh).toBeFocused()
    await homeMarket(page, initialMarkets[1].name); await facts(page, initialMarkets[1])
    await page.goBack(); await expect(page.getByRole('heading', { name: '주점부리 매장', exact: true })).toBeVisible()
    await page.goBack(); await facts(page, initialMarkets[0])
    expect(fixture.reads(901)).toBe(3)
    await page.reload(); await facts(page, initialMarkets[0]); expect(fixture.reads(901)).toBe(4)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  })

  test(`full100character market name and keyboard actions stay inside${width}`, async ({ page, fixture }, testInfo) => {
    const name = 'N'.repeat(100)
    fixture.markets[0].name = name
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const link = page.getByRole('link', { name: `${name} 상세 보기`, exact: true })
    await link.focus(); await link.press('Enter')
    await facts(page, fixture.markets[0])
    const heading = page.getByRole('heading', { name, exact: true })
    const geometry = await heading.evaluate((node) => {
      const range = document.createRange(); range.selectNodeContents(node)
      return { name: node.textContent, document: document.documentElement.scrollWidth, viewport: innerWidth, rects: [...range.getClientRects()].map((r) => ({ left: r.left, right: r.right })) }
    })
    await testInfo.attach('market-name-geometry.json', { body: JSON.stringify(geometry), contentType: 'application/json' })
    expect(geometry.name).toBe(name); expect(geometry.document).toBeLessThanOrEqual(width)
    expect(geometry.rects.every((r) => r.left >= 0 && r.right <= width)).toBe(true)
    const back = page.getByRole('link', { name: '홈의 매장 목록', exact: true })
    await back.focus(); await back.press('Tab')
    await expect(page.getByRole('button', { name: '매장 정보 새로고침', exact: true })).toBeFocused()
    await page.keyboard.press('Shift+Tab'); await back.press('Enter')
    await expect(page).toHaveURL('/#stores')
    await expect(page.getByRole('heading', { name: '주점부리 매장', exact: true })).toBeFocused()
    await expect(link).toBeVisible()
  })
}

test('malformed IDs and repeated path components do not request any market detail', async ({ page, fixture }) => {
  for (const id of ['0', '01', '-1', '+1', '1e0', '1.0', '2147483648', '99999999999999999999999999999', '1/2']) {
    await page.goto(`/markets/${id}`)
    await expect(page.getByRole('heading', { name: id === '1/2' ? '페이지를 찾을 수 없습니다' : '매장 번호를 확인해 주세요', exact: true })).toBeVisible()
    await expect(page.locator('[data-market-field]')).toHaveCount(0)
  }
  expect(fixture.calls.filter((call) => /^\/markets\//.test(call.path))).toEqual([])
})

test('403 and503 are explicit read failures;retry is single and retains keyboard focus', async ({ page, fixture }) => {
  for (const status of [403, 503]) {
    fixture.details.set(901, { status })
    await page.goto('/markets/901')
    await expect(page.getByRole('heading', { name: '매장 정보를 불러오지 못했습니다', exact: true })).toBeVisible()
    await expect(page).toHaveURL('/markets/901')
    const count = fixture.reads(901)
    await page.evaluate(() => { window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online')) })
    expect(fixture.reads(901)).toBe(count)
    const gate = fixture.hold('/markets/901', { status: 200, data: initialMarkets[0] })
    const retry = page.getByRole('button', { name: '매장 정보 다시 시도', exact: true })
    await retry.focus(); await retry.press('Enter'); await expect.poll(() => gate.started).toBe(true)
    const action = page.locator('.market-detail-actions button')
    await expect(action).toBeFocused(); await expect(action).toHaveAttribute('aria-disabled', 'true')
    await action.press('Enter'); expect(fixture.reads(901)).toBe(count + 1)
    gate.release(); await facts(page, initialMarkets[0])
    await expect(page.getByRole('button', { name: '매장 정보 새로고침', exact: true })).toBeFocused()
  }
})

test('cached re-entry404 hides old facts and offers home or an explicit current read', async ({ page, fixture }) => {
  await page.goto('/markets/901'); await facts(page, initialMarkets[0])
  fixture.details.set(901, { status: 404 })
  await homeMarket(page, initialMarkets[0].name)
  await expect(page.getByRole('heading', { name: '매장을 찾을 수 없습니다', exact: true })).toBeVisible()
  await expect(detail(page).getByRole('heading', { name: initialMarkets[0].name, exact: true })).toHaveCount(0)
  await expect(page.locator('[data-market-field]')).toHaveCount(0)
  fixture.details.delete(901)
  await page.getByRole('button', { name: '매장 정보 다시 시도', exact: true }).click()
  await facts(page, initialMarkets[0])
  expect(fixture.reads(901)).toBe(3)
})

for (const status of [200, 503]) {
  test(`late previous-ID${status} cannot replace current market or user focus`, async ({ page, fixture }) => {
    const gate = fixture.hold('/markets/901', { status, data: initialMarkets[0] })
    await page.goto('/markets/901'); await expect.poll(() => gate.started).toBe(true)
    await expect(page.getByRole('status', { name: '현재 매장 정보를 확인하는 중입니다.', exact: true })).toBeVisible()
    await homeMarket(page, initialMarkets[1].name); await facts(page, initialMarkets[1])
    const back = page.getByRole('link', { name: '홈의 매장 목록', exact: true })
    await back.focus()
    const settled = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/markets/901')
    gate.release(); await (await settled).finished()
    await facts(page, initialMarkets[1]); await expect(back).toBeFocused()
    await expect(detail(page)).not.toContainText(initialMarkets[0].name)
  })
}

test('mismatched response ID is an error and missing coordinates never become fabricated zero', async ({ page, fixture }) => {
  fixture.details.set(901, { status: 200, data: initialMarkets[1] })
  await page.goto('/markets/901')
  await expect(page.getByRole('heading', { name: '매장 정보를 불러오지 못했습니다', exact: true })).toBeVisible()
  await expect(page.locator('[data-market-field]')).toHaveCount(0)
  fixture.details.set(901, { status: 200, data: { ...initialMarkets[0], latitude: null, longitude: 999 } })
  await page.getByRole('button', { name: '매장 정보 다시 시도', exact: true }).click()
  await expect(page.getByRole('heading', { name: initialMarkets[0].name, exact: true })).toBeVisible()
  await expect(page.locator('[data-market-field="latitude"]')).toHaveText('미확인')
  await expect(page.locator('[data-market-field="longitude"]')).toHaveText('미확인')
})

test('cached offline re-entry does not present old market facts as current', async ({ page, fixture }) => {
  await page.goto('/markets/901'); await facts(page, initialMarkets[0])
  await page.getByRole('link', { name: '홈의 매장 목록', exact: true }).click()
  await expect(page.getByRole('link', { name: `${initialMarkets[0].name} 상세 보기`, exact: true })).toBeVisible()
  await page.context().setOffline(true)
  await page.getByRole('link', { name: `${initialMarkets[0].name} 상세 보기`, exact: true }).click()
  await expect(page.getByRole('heading', { name: '연결 후 매장 정보를 확인해 주세요', exact: true })).toBeVisible()
  await expect(page.locator('[data-market-field]')).toHaveCount(0)
  expect(fixture.reads(901)).toBe(1)
  fixture.details.set(901, { status: 200, data: { ...initialMarkets[0], longitude: 127.123456789 } })
  await page.context().setOffline(false)
  await facts(page, { ...initialMarkets[0], longitude: 127.123456789 })
  expect(fixture.reads(901)).toBe(2)
})

test('public detail does not mutate cart,recent history or private account storage', async ({ page, fixture }) => {
  await page.goto('/')
  const cart = JSON.stringify([{ product: { id: 7, name: '원문 상품', price: 0, abv: 0, type: '탁주', orderCount: 0, img: null }, quantity: 2 }])
  const recent = JSON.stringify({ version: 1, entries: [{ id: 7, viewedAt: Date.now() - 300000 }] })
  await page.evaluate(({ cart, recent }) => { localStorage.setItem('pubburi-cart', cart); localStorage.setItem('pubburi-recent-products-v1', recent) }, { cart, recent })
  await page.getByRole('link', { name: `${initialMarkets[0].name} 상세 보기`, exact: true }).click()
  await facts(page, initialMarkets[0])
  expect(await page.evaluate(() => localStorage.getItem('pubburi-cart'))).toBe(cart)
  expect(await page.evaluate(() => localStorage.getItem('pubburi-recent-products-v1'))).toBe(recent)
  expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual(['pubburi-cart', 'pubburi-recent-products-v1'])
  expect(fixture.calls.filter((call) => call.path.startsWith('/users/'))).toEqual([])
})
