import { expect, test as base } from '@playwright/test'
import { openCatalogFilters } from './catalog-filters'

// Authored filter envelopes, separate from actual Backend/catalog acceptance.
const ok = (data) => ({ data, message: 'ok', error: null })
const bad = (code) => ({ data: null, message: null, error: { code, message: code } })
const items = Array.from({ length: 14 }, (_, i) => ({ id: 1900 + i, name: `초기 조건 상품 ${i}`, type: '탁주', price: 6000, abv: 6, img: null, orderCount: 0 }))
const applied = () => new URLSearchParams([['q', '초기'], ['type', '탁주'], ['minPriceKrw', '0'], ['maxPriceKrw', '12000'], ['minAbvPercent', '0'], ['maxAbvPercent', '15'], ['tasteTag', 'dry,sweet'], ['tasteTag', 'line\nbreak'], ['aromaTag', 'floral'], ['sort', 'name'], ['page', '2']])
const test = base.extend({
  filtersApi: [async ({ page }, use) => {
    const state = { calls: [], unexpected: [], errors: [], failures: 0, items, hints: new Map() }
    page.on('pageerror', (error) => state.errors.push(error.message))
    await page.route('**/api/**', async (route) => {
      if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/users/me/notifications') return route.fulfill({ status: 404, json: { data: null, error: { code: 'NOTIFICATIONS_NOT_SUPPORTED' } } })
      if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/users/me/cart') return route.fulfill({ status: 404, json: { data: null, error: { code: 'CART_NOT_SUPPORTED' } } })
      const req = route.request(), url = new URL(req.url()), q = url.searchParams
      state.calls.push({ path: url.pathname, method: req.method(), query: [...q] })
      if (req.method() === 'GET' && url.pathname === '/api/auth/me') return route.fulfill({ status: 401, json: bad('UNAUTHORIZED') })
      if (req.method() === 'GET' && url.pathname === '/api/products') {
        if (state.failures) { state.failures--; return route.fulfill({ status: 503, json: bad('SERVICE_UNAVAILABLE') }) }
        const matches = state.items.filter((p) => (!q.get('q') || p.name.includes(q.get('q'))) && (!q.get('type') || p.type === q.get('type')) &&
          (!q.has('minPriceKrw') || p.price >= Number(q.get('minPriceKrw'))) && (!q.has('maxPriceKrw') || p.price <= Number(q.get('maxPriceKrw'))) &&
          (!q.has('minAbvPercent') || p.abv >= Number(q.get('minAbvPercent'))) && (!q.has('maxAbvPercent') || p.abv <= Number(q.get('maxAbvPercent'))) &&
          q.getAll('tasteTag').every((v) => ['dry,sweet', 'line\nbreak'].includes(v)) && q.getAll('aromaTag').every((v) => v === 'floral'))
        const current = Number(q.get('page') || 1), size = 12
        const hint = state.hints.get(q.get('q'))
        return route.fulfill({
          headers: hint ? { 'X-Pubburi-Search-Hint': hint } : {},
          json: ok({ items: matches.slice((current - 1) * size, current * size), page: current, size, total: matches.length, totalPages: Math.ceil(matches.length / size), hasNext: current * size < matches.length }),
        })
      }
      state.unexpected.push(`${req.method()} ${url.pathname}`)
      return route.fulfill({ status: 501, json: bad('UNEXPECTED_TEST_REQUEST') })
    })
    await use(state)
    expect(state.errors).toEqual([]); expect(state.unexpected).toEqual([])
    expect(state.calls.filter((call) => call.method !== 'GET')).toEqual([])
  }, { auto: true }],
})
const catalogCalls = (api) => api.calls.filter((call) => call.path === '/api/products')
const urlQuery = (page) => new URL(page.url()).searchParams
const requestQuery = (api) => new URLSearchParams(catalogCalls(api).at(-1).query)
const remove = (page, name) => page.getByRole('button', { name, exact: true })
const hintAction = (page, keyword) => page.getByRole('button', { name: `‘${keyword}’로 다시 검색`, exact: true })

for (const [width, original, canonical, kind] of [
  [1280, '약주', '약 · 청주', 'ALIAS'],
  [390, '과실쥬', '과실주', 'TYPO'],
]) test(`F02 검색 보조 ${width}px는 명시 적용으로 현재 조건·다른 초안·포커스·Back 보존`, async ({ page, filtersApi }, info) => {
  const query = applied()
  query.set('q', original); query.set('type', canonical); query.set('from', 'saved-search')
  const corrected = new URLSearchParams(query)
  corrected.set('q', canonical); corrected.set('page', '1')
  filtersApi.items = [{ ...items[0], type: canonical, name: `${canonical} 시험 상품` }]
  filtersApi.hints.set(original, `${kind}:${encodeURIComponent(canonical)}`)
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript(() => {
    const scrollTo = window.scrollTo.bind(window)
    window.hintScrollRequests = 0
    window.scrollTo = (...args) => { window.hintScrollRequests++; return scrollTo(...args) }
  })
  await page.goto(`/products?${query}`)
  const hint = hintAction(page, canonical)
  await expect(hint).toBeVisible()
  await expect(page.getByRole('region', { name: '상품 검색 결과' })).toContainText(kind === 'ALIAS' ? '검수 동의어' : '비슷한 검색어')
  await expect(page).toHaveURL(`/products?${query}`)
  expect(catalogCalls(filtersApi)).toHaveLength(1)
  const input = page.getByLabel('상품 검색', { exact: true })
  await input.fill('별도의 검색어 초안')
  await page.getByRole('combobox', { name: '주종', exact: true }).selectOption('맥주')
  await page.getByRole('combobox', { name: '정렬', exact: true }).selectOption('priceDesc')
  await openCatalogFilters(page)
  await page.getByLabel('최대 가격(원)', { exact: true }).fill('9999')
  await page.getByLabel('맛 태그 조건 1', { exact: true }).fill('나중,태그\n원문')
  await hint.scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath(`search-hint-${width}.png`) })
  await page.evaluate(() => { window.hintScrollRequests = 0 })
  await hint.press(width === 1280 ? 'Enter' : 'Space')
  await expect(page).toHaveURL(`/products?${corrected}`)
  await expect(page.locator('.product-card')).toHaveCount(1)
  await expect(page.getByRole('region', { name: '상품 검색 결과' })).toBeFocused()
  expect(await page.evaluate(() => window.hintScrollRequests)).toBe(0)
  await expect(hint).toHaveCount(0)
  await expect(input).toHaveValue(canonical)
  await expect(page.getByRole('combobox', { name: '주종', exact: true })).toHaveValue('맥주')
  await expect(page.getByRole('combobox', { name: '정렬', exact: true })).toHaveValue('priceDesc')
  await expect(page.getByLabel('최대 가격(원)', { exact: true })).toHaveValue('9999')
  await expect(page.getByLabel('맛 태그 조건 1', { exact: true })).toHaveValue('나중,태그\n원문')
  expect([...urlQuery(page)]).toEqual([...corrected])
  const expectedRequest = new URLSearchParams(corrected); expectedRequest.delete('from'); expectedRequest.set('size', '12')
  for (const key of expectedRequest.keys()) expect(requestQuery(filtersApi).getAll(key)).toEqual(expectedRequest.getAll(key))
  expect(requestQuery(filtersApi).has('from')).toBe(false)
  expect(catalogCalls(filtersApi)).toHaveLength(2)
  await page.goBack()
  await expect(page).toHaveURL(`/products?${query}`)
  await expect(input).toHaveValue(original)
  await expect(hint).toBeVisible()
  expect(catalogCalls(filtersApi)).toHaveLength(3)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

for (const destination of ['latest query', 'route']) test(`F02 검색 보조의 늦은 응답이 ${destination}에 나타나지 않음`, async ({ page, filtersApi }) => {
  filtersApi.hints.set('약주', `ALIAS:${encodeURIComponent('약 · 청주')}`)
  let release, started = false
  const gate = new Promise((resolve) => { release = resolve })
  await page.route('**/api/products?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('q') === '약주') { started = true; await gate }
    await route.fallback()
  })
  try {
    await page.goto('/products?q=약주')
    await expect.poll(() => started).toBe(true)
    await expect(hintAction(page, '약 · 청주')).toHaveCount(0)
    if (destination === 'route') {
      await page.locator('header').getByRole('link', { name: '장바구니', exact: true }).click()
      await expect(page.getByRole('heading', { name: '장바구니', exact: true })).toBeVisible()
    } else {
      await page.getByLabel('상품 검색', { exact: true }).fill('검수되지 않은 현재 검색')
      await remove(page, '검색하기').press('Enter')
      await expect(page.getByRole('heading', { name: '조건에 맞는 상품이 없습니다', exact: true })).toBeVisible()
    }
    const old = page.waitForResponse((response) => new URL(response.url()).searchParams.get('q') === '약주')
    release(); await (await old).finished()
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    await expect(hintAction(page, '약 · 청주')).toHaveCount(0)
    if (destination === 'route') await expect(page).toHaveURL('/cart')
    else expect(urlQuery(page).get('q')).toBe('검수되지 않은 현재 검색')
  } finally { release() }
})

test('F02 검색 보조는 장애 또는 정상 결과를 현재 추천 문구로 바꾸지 않음', async ({ page, filtersApi }) => {
  filtersApi.hints.set('초기', `ALIAS:${encodeURIComponent('약 · 청주')}`)
  filtersApi.failures = 1
  await page.goto('/products?q=초기')
  await expect(page.getByRole('heading', { name: '상품을 불러오지 못했습니다', exact: true })).toBeVisible()
  await expect(hintAction(page, '약 · 청주')).toHaveCount(0)
  await remove(page, '다시 시도').press('Enter')
  await expect(page.locator('.product-card')).toHaveCount(12)
  await expect(hintAction(page, '약 · 청주')).toHaveCount(0)
  expect(catalogCalls(filtersApi)).toHaveLength(2)
  expect(urlQuery(page).get('q')).toBe('초기')
})
async function fits(page) {
  const width = page.viewportSize().width
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  for (const control of await page.locator('button[data-applied-remove]').all()) {
    const box = await control.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width)
  }
}

async function positionAppliedChip(page, chip) {
  await openCatalogFilters(page)
  await chip.evaluate((element) => window.scrollTo({
    top: Math.max(1, window.scrollY + element.getBoundingClientRect().top - innerHeight / 2),
    behavior: 'instant',
  }))
  const before = await page.evaluate(() => window.scrollY)
  expect(before).toBeGreaterThan(0)
  return before
}

for (const width of [1280, 390]) test(`사라진 결과 페이지는 적용 조건·입력·뒤로 가기를 보존해 복구 ${width}px`, async ({ page, filtersApi }, info) => {
  filtersApi.items = items.slice(0, 2)
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript(() => {
    const scrollTo = window.scrollTo.bind(window)
    window.catalogRepairScrollRequests = 0
    window.scrollTo = (...args) => {
      window.catalogRepairScrollRequests += 1
      return scrollTo(...args)
    }
  })
  const target = applied()
  target.set('sort', 'priceDesc')
  target.set('from', 'saved-search')
  const recovered = new URLSearchParams(target)
  recovered.set('page', '1')
  let release, started = false
  const gate = new Promise((resolve) => { release = resolve })
  await page.route('**/api/products?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('page') === '2') { started = true; await gate }
    await route.fallback()
  })
  try {
    await page.goto('/products?sort=name&page=1')
    await expect(page.locator('.product-card')).toHaveCount(2)
    await page.goto(`/products?${target}`)
    await expect.poll(() => started).toBe(true)
    await openCatalogFilters(page)
    await page.getByLabel('최대 가격(원)', { exact: true }).fill('9999')
    const input = page.getByLabel('상품 검색', { exact: true })
    await input.fill('아직 제출하지 않은 검색')
    await expect(input).toBeFocused()
    await page.evaluate(() => { window.catalogRepairScrollRequests = 0 })
    const empty = page.getByRole('heading', { name: '조건에 맞는 상품이 없습니다', exact: true })
    const outcome = Promise.race([page.waitForURL((url) => url.searchParams.toString() === recovered.toString()), empty.waitFor()])
    release()
    await outcome
    const observed = { width, currentPage: urlQuery(page).get('page'), showsNoMatches: await empty.isVisible() }
    await info.attach('catalog-page-repair.json', { body: JSON.stringify(observed), contentType: 'application/json' })
    expect(observed).toEqual({ width, currentPage: '1', showsNoMatches: false })
    await expect(page.locator('.product-card')).toHaveCount(2)
    await expect(input).toHaveValue('아직 제출하지 않은 검색')
    await expect(input).toBeFocused()
    expect(await page.evaluate(() => window.catalogRepairScrollRequests)).toBe(0)
    await expect(page.getByLabel('최대 가격(원)', { exact: true })).toHaveValue('9999')
    await expect(page.getByLabel('적용된 필터', { exact: true })).toContainText('최대 가격(원): 12000')
    expect([...urlQuery(page)]).toEqual([...recovered])
    const matching = catalogCalls(filtersApi).filter(({ query }) => new URLSearchParams(query).get('q') === '초기').map(({ query }) => new URLSearchParams(query))
    expect(matching.map((query) => query.get('page'))).toEqual(['2', '1'])
    const [oldQuery, newQuery] = matching
    oldQuery.delete('page'); newQuery.delete('page')
    expect([...newQuery]).toEqual([...oldQuery])
    expect(newQuery.getAll('tasteTag')).toEqual(['dry,sweet', 'line\nbreak'])
    expect(newQuery.get('minPriceKrw')).toBe('0')
    expect(newQuery.get('sort')).toBe('priceDesc')
    await page.goBack()
    await expect(page).toHaveURL('/products?sort=name&page=1')
    await expect(page.locator('.product-card')).toHaveCount(2)
  } finally { release() }
})

test('검색 장애와 실제 일치 상품 0건은 페이지를 임의로 변경하지 않음', async ({ page, filtersApi }) => {
  filtersApi.failures = 1
  filtersApi.items = []
  const url = `/products?${applied()}`
  await page.goto(url)
  await expect(page.getByRole('heading', { name: '상품을 불러오지 못했습니다', exact: true })).toBeVisible()
  await expect(page).toHaveURL(url)
  await page.getByRole('button', { name: '다시 시도', exact: true }).press('Enter')
  await expect(page.getByRole('heading', { name: '조건에 맞는 상품이 없습니다', exact: true })).toBeVisible()
  await expect(page).toHaveURL(url)
  expect(catalogCalls(filtersApi).map(({ query }) => new URLSearchParams(query).get('page'))).toEqual(['2', '2'])
})

for (const width of [1280, 390]) test(`applied-draft-baseline: 적용 URL과 결과는 미제출 입력에 바뀌지 않음 ${width}px`, async ({ page, filtersApi }, info) => {
  await page.setViewportSize({ width, height: 900 })
  await page.goto(`/products?${applied()}`)
  await expect(page.locator('.product-card')).toHaveCount(2)
  await page.getByRole('combobox', { name: '주종', exact: true }).selectOption('맥주')
  await page.getByLabel('상품 검색', { exact: true }).fill('미제출 검색')
  await openCatalogFilters(page)
  await page.getByLabel('최대 가격(원)', { exact: true }).fill('9999')
  const summary = page.getByLabel('적용된 필터', { exact: true })
  const observed = { width, url: page.url(), applied: await summary.textContent(), request: catalogCalls(filtersApi).at(-1), reads: catalogCalls(filtersApi).length }
  await info.attach('applied-draft.json', { body: JSON.stringify(observed), contentType: 'application/json' })
  expect(catalogCalls(filtersApi)).toHaveLength(1)
  await expect(page).toHaveURL((url) => url.searchParams.get('type') === '탁주' && url.searchParams.get('maxPriceKrw') === '12000')
  await expect(summary).toContainText('탁주')
  await expect(summary).toContainText('검색: 초기')
  await expect(summary).toContainText('최대 가격(원): 12000')
  await expect(summary).not.toContainText('미제출 검색')
  await summary.scrollIntoViewIfNeeded()
  await info.attach('applied-filters.png', { body: await page.screenshot(), contentType: 'image/png' })
})

for (const width of [1280, 390]) test(`applied-draft-baseline: 적용 없는 새 입력은 적용된 필터로 표시하지 않음 ${width}px`, async ({ page, filtersApi }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/products'); await expect(page.locator('.product-card')).toHaveCount(12)
  await page.getByLabel('상품 검색', { exact: true }).fill('아직 적용하지 않음')
  await expect(page.getByLabel('적용된 필터', { exact: true })).toHaveCount(0)
  expect(catalogCalls(filtersApi)).toHaveLength(1)
  await remove(page, '입력 초기화').click()
  await expect(page.getByLabel('상품 검색', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('적용된 필터', { exact: true })).toHaveCount(0)
  expect(catalogCalls(filtersApi)).toHaveLength(1)
})

for (const width of [1280, 390]) test(`개별 해제는 URL 한 조건/page1만 바꾸고 모든 수정 중인 초안을 보존 ${width}px`, async ({ page, filtersApi }) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto(`/products?${applied()}`)
  await expect(page.locator('.product-card')).toHaveCount(2)
  await page.getByRole('combobox', { name: '주종', exact: true }).selectOption('맥주')
  await page.getByRole('combobox', { name: '정렬', exact: true }).selectOption('priceDesc')
  await page.getByLabel('상품 검색', { exact: true }).fill('미제출 검색')
  await openCatalogFilters(page)
  await page.getByLabel('최대 가격(원)', { exact: true }).fill('9999')
  await page.getByLabel('맛 태그 조건 1', { exact: true }).fill('아직 적용하지 않은 태그')
  await remove(page, '최대 가격(원) 12000 해제').click()
  await expect(page.locator('.product-card')).toHaveCount(12)
  expect(urlQuery(page).get('page')).toBe('1'); expect(urlQuery(page).has('maxPriceKrw')).toBe(false)
  const expected = applied(); expected.delete('maxPriceKrw'); expected.set('page', '1')
  expect([...urlQuery(page)]).toEqual([...expected])
  for (const key of expected.keys()) expect(requestQuery(filtersApi).getAll(key)).toEqual(expected.getAll(key))
  await expect(page.getByLabel('최대 가격(원)', { exact: true })).toHaveValue('9999')
  await expect(page.getByLabel('상품 검색', { exact: true })).toHaveValue('미제출 검색')
  await expect(page.getByRole('combobox', { name: '주종', exact: true })).toHaveValue('맥주')
  await expect(page.getByRole('combobox', { name: '정렬', exact: true })).toHaveValue('priceDesc')
  await expect(page.getByLabel('맛 태그 조건 1', { exact: true })).toHaveValue('아직 적용하지 않은 태그')
  await expect(page.getByLabel('적용된 필터', { exact: true })).not.toContainText('9999')
  await expect(remove(page, '검색 초기 해제')).toBeVisible()
  await fits(page)
  // Explicit batch submission, not chip removal, applies every edited field.
  await remove(page, '검색하기').click(); await expect(page.getByRole('heading', { name: '조건에 맞는 상품이 없습니다', exact: true })).toBeVisible()
  expect(requestQuery(filtersApi).get('q')).toBe('미제출 검색'); expect(requestQuery(filtersApi).get('type')).toBe('맥주')
  expect(requestQuery(filtersApi).get('maxPriceKrw')).toBe('9999'); expect(requestQuery(filtersApi).get('sort')).toBe('priceDesc')
  expect(requestQuery(filtersApi).getAll('tasteTag')).toEqual(['아직 적용하지 않은 태그', 'line\nbreak'])
  await page.goBack(); await expect(page.locator('.product-card')).toHaveCount(12)
  await expect(page.getByLabel('최대 가격(원)', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('상품 검색', { exact: true })).toHaveValue('초기')
  await page.goBack(); await expect(page.locator('.product-card')).toHaveCount(2)
  await expect(page.getByLabel('최대 가격(원)', { exact: true })).toHaveValue('12000')
})

for (const width of [1280, 390]) test(`키보드로 리터럴 태그·영점 범위를 하나씩 해제하고 다음 조작으로 연결 ${width}px`, async ({ page, filtersApi }, info) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto(`/products?${applied()}`)
  await expect(page.locator('.product-card')).toHaveCount(2)
  const first = remove(page, '맛 태그 dry,sweet 해제'); await first.focus(); await first.press('Enter')
  await expect(page.locator('.product-card')).toHaveCount(12)
  expect(urlQuery(page).getAll('tasteTag')).toEqual(['line\nbreak'])
  await expect(page.getByLabel('맛 태그 조건 1', { exact: true })).toHaveValue('line\nbreak')
  const second = page.getByRole('button', { name: /맛 태그 line\s+break 해제/ })
  await expect(second).toBeFocused()
  const box = await second.boundingBox(), headerBottom = await page.locator('.topbar').evaluate((el) => el.getBoundingClientRect().bottom)
  expect(box.y).toBeGreaterThanOrEqual(headerBottom); expect(box.y + box.height).toBeLessThan(900)
  await fits(page)
  await second.press('Space'); await expect(remove(page, '향 태그 floral 해제')).toBeFocused()
  expect(urlQuery(page).has('tasteTag')).toBe(false)
  await remove(page, '향 태그 floral 해제').press('Enter'); await expect(remove(page, '주종 탁주 해제')).toBeFocused()
  for (const [name, key] of [['주종 탁주 해제', 'type'], ['검색 초기 해제', 'q'], ['최소 가격(원) 0 해제', 'minPriceKrw'], ['최대 가격(원) 12000 해제', 'maxPriceKrw'], ['최소 도수(%) 0 해제', 'minAbvPercent'], ['최대 도수(%) 15 해제', 'maxAbvPercent']]) {
    const button = remove(page, name); await expect(button).toBeFocused(); await button.press('Enter')
    await expect(page).toHaveURL((url) => !url.searchParams.has(key))
  }
  await expect(remove(page, '검색하기')).toBeFocused()
  expect([...urlQuery(page)]).toEqual([['sort', 'name'], ['page', '1']])
  await expect(page.getByLabel('적용된 필터', { exact: true })).toHaveCount(0)
  await expect(page.locator('.product-card')).toHaveCount(12)
  expect(requestQuery(filtersApi).get('sort')).toBe('name')
  await fits(page)
  await info.attach('individual-removal.json', { body: JSON.stringify({ width, url: page.url(), active: await page.evaluate(() => document.activeElement.textContent), requests: catalogCalls(filtersApi), documentWidth: await page.evaluate(() => document.documentElement.scrollWidth) }), contentType: 'application/json' })
})

for (const width of [1280, 390]) for (const restoration of ['auto', 'manual']) test(`포인터 해제·Back의 현재 URL과 스크롤 소유 ${width}px/history=${restoration}`, async ({ page }, info) => {
  await page.addInitScript(() => {
    const nativeScrollTo = window.scrollTo.bind(window)
    window.__appliedScrollRequests = []
    window.scrollTo = (...args) => {
      window.__appliedScrollRequests.push({ args, destination: location.pathname + location.search })
      return nativeScrollTo(...args)
    }
  })
  await page.setViewportSize({ width, height: 900 }); await page.goto(`/products?${applied()}`)
  expect(await page.evaluate(() => history.scrollRestoration)).toBe('auto')
  await expect(page.locator('.product-card')).toHaveCount(2)
  const target = remove(page, '최대 가격(원) 12000 해제')
  const before = await positionAppliedChip(page, target)
  const source = await target.elementHandle()
  await target.click(); await expect(page.locator('.product-card')).toHaveCount(12)
  const observed = await page.evaluate(() => ({ scrollY: window.scrollY, active: document.activeElement.tagName }))
  await info.attach('pointer-scroll.json', { body: JSON.stringify({ width, before, ...observed, removed: await source.evaluate((el) => !el.isConnected) }), contentType: 'application/json' })
  expect(observed.scrollY).toBeGreaterThan(0)
  expect(Math.abs(observed.scrollY - before)).toBeLessThanOrEqual(96)
  await fits(page)
  // Only the explicit App-scroll check disables the browser's competing restoration.
  if (restoration === 'manual') {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.evaluate(() => { history.scrollRestoration = 'manual' })
  }
  const backUrl = page.url()
  await page.getByLabel('상품 검색', { exact: true }).fill('이탈 전 미제출 초안')
  await page.locator('header').getByRole('link', { name: '장바구니', exact: true }).click()
  await expect(page).toHaveURL(/\/cart$/)
  // The address can change before React commits the cart route.
  await expect(page.getByRole('main').getByRole('heading', { name: '장바구니', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await page.evaluate(() => { window.__appliedScrollRequests = [] })
  await page.goBack(); await expect(page).toHaveURL(backUrl)
  await expect(page.locator('.product-card')).toHaveCount(12)
  await expect(page.getByLabel('상품 검색', { exact: true })).toHaveValue('초기')
  await expect.poll(() => page.evaluate(() => window.__appliedScrollRequests.filter((call) => call.args[0]?.top === 0 && call.destination === location.pathname + location.search).length)).toBe(1)
  expect(await page.evaluate(() => history.scrollRestoration)).toBe(restoration)
  // In auto mode native history may restore a remembered position after App's request.
  if (restoration === 'manual') await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await info.attach('back-scroll-owner.json', { body: JSON.stringify(await page.evaluate(() => ({ mode: history.scrollRestoration, scrollY, requests: window.__appliedScrollRequests, url: location.pathname + location.search }))), contentType: 'application/json' })
  await openCatalogFilters(page)
  await expect(page.getByLabel('최대 가격(원)', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('최소 가격(원)', { exact: true })).toHaveValue('0')
  await expect(page.getByLabel('맛 태그 조건 1', { exact: true })).toHaveValue('dry,sweet')
  await expect(page.getByLabel('맛 태그 조건 2', { exact: true })).toHaveValue('line\nbreak')
})

test.describe('터치 가능한 웹 브라우저', () => {
  test.use({ hasTouch: true })
  test('390px 터치 해제도 현재 위치·새 입력을 보존', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 900 }); await page.goto(`/products?${applied()}`)
    await expect(page.locator('.product-card')).toHaveCount(2)
    await page.getByLabel('상품 검색', { exact: true }).fill('터치 전 새 초안')
    const target = remove(page, '최대 가격(원) 12000 해제')
    const before = await positionAppliedChip(page, target)
    await target.tap(); await expect(page.locator('.product-card')).toHaveCount(12)
    const after = await page.evaluate(() => window.scrollY)
    await info.attach('touch-scroll.json', { body: JSON.stringify({ before, after }), contentType: 'application/json' })
    expect(after).toBeGreaterThan(0); expect(Math.abs(after - before)).toBeLessThanOrEqual(96)
    await expect(page.getByLabel('상품 검색', { exact: true })).toHaveValue('터치 전 새 초안')
    expect(urlQuery(page).get('q')).toBe('초기'); expect(urlQuery(page).get('page')).toBe('1')
    await fits(page)
  })
})

test('수정한 태그 초안 배열은 적용된 한 태그를 해제해도 다시 쓰지 않음', async ({ page }) => {
  await page.goto(`/products?${applied()}`); await expect(page.locator('.product-card')).toHaveCount(2)
  await openCatalogFilters(page)
  await page.getByLabel('맛 태그 조건 1', { exact: true }).fill('새,초안\n원문')
  await page.getByRole('button', { name: /맛 태그 line\s+break 해제/ }).click()
  await expect(page.locator('.product-card')).toHaveCount(12)
  expect(urlQuery(page).getAll('tasteTag')).toEqual(['dry,sweet'])
  await expect(page.getByLabel('맛 태그 조건 1', { exact: true })).toHaveValue('새,초안\n원문')
  await expect(page.getByLabel('맛 태그 조건 2', { exact: true })).toHaveValue('line\nbreak')
  await expect(page.getByLabel('현재 적용된 태그 조건', { exact: true })).not.toContainText('line\nbreak')
})

test('잘못된 반복 hard 범위는 다른 조건 해제에도 보존하며 무제약 조회하지 않음', async ({ page, filtersApi }) => {
  const query = applied(); query.append('minPriceKrw', '10')
  await page.goto(`/products?${query}`); await expect(page.getByRole('heading', { name: '검색 조건을 확인해 주세요', exact: true })).toBeVisible()
  await remove(page, '검색 초기 해제').click()
  expect(urlQuery(page).getAll('minPriceKrw')).toEqual(['0', '10'])
  expect(urlQuery(page).get('maxPriceKrw')).toBe('12000')
  expect(urlQuery(page).getAll('tasteTag')).toEqual(['dry,sweet', 'line\nbreak'])
  expect(catalogCalls(filtersApi)).toHaveLength(0)
  await expect(remove(page, '최소 가격(원) 10 해제')).toHaveCount(0)
  await expect(page.getByLabel('최소 가격(원)', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('heading', { name: '검색 조건을 확인해 주세요', exact: true })).toBeVisible()
  await page.getByLabel('최소 가격(원)', { exact: true }).fill('0'); await remove(page, '검색하기').click()
  await expect(page.locator('.product-card')).toHaveCount(12)
  expect(urlQuery(page).getAll('minPriceKrw')).toEqual(['0'])
  expect(catalogCalls(filtersApi)).toHaveLength(1)
})

test('제공자 Unicode400은 다른 조건 해제에도 원문을 남기고 명시 수정만 허용', async ({ page, filtersApi }) => {
  await page.route('**/api/products?**', async (route) => {
    if (new URL(route.request().url()).searchParams.getAll('tasteTag').includes('Ä')) {
      filtersApi.calls.push({ path: '/api/products', method: 'GET', query: [...new URL(route.request().url()).searchParams] })
      return route.fulfill({ status: 400, json: bad('BAD_REQUEST') })
    }
    return route.fallback()
  })
  const query = applied(); query.delete('tasteTag'); query.append('tasteTag', 'Ä'); query.append('tasteTag', 'ä')
  await page.goto(`/products?${query}`); await expect(page.getByRole('heading', { name: '검색 조건을 확인해 주세요', exact: true })).toBeVisible()
  await remove(page, '주종 탁주 해제').click()
  await expect.poll(() => catalogCalls(filtersApi).length).toBe(2)
  expect(requestQuery(filtersApi).getAll('tasteTag')).toEqual(['Ä', 'ä'])
  expect(urlQuery(page).getAll('tasteTag')).toEqual(['Ä', 'ä']); expect(requestQuery(filtersApi).get('minPriceKrw')).toBe('0')
  await expect(page.getByRole('heading', { name: '검색 조건을 확인해 주세요', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '맛 태그 Ä 해제', exact: true })).toHaveCount(0)
  await remove(page, '태그 조건 수정').click(); await expect(page.getByLabel('맛 태그 조건 1', { exact: true })).toBeFocused()
  await page.getByLabel('맛 태그 조건 1', { exact: true }).fill('dry,sweet')
  await page.getByLabel('맛 태그 조건 2', { exact: true }).fill('line\nbreak')
  await remove(page, '검색하기').click(); await expect(page.locator('.product-card')).toHaveCount(12)
  expect(requestQuery(filtersApi).getAll('tasteTag')).toEqual(['dry,sweet', 'line\nbreak'])
})

test('해제 뒤503은 새 입력을 보존하고 동일한 나머지 조건만 재시도', async ({ page, filtersApi }) => {
  await page.goto(`/products?${applied()}`); await expect(page.locator('.product-card')).toHaveCount(2)
  await page.getByLabel('상품 검색', { exact: true }).fill('나중 초안')
  filtersApi.failures = 1; await remove(page, '최대 가격(원) 12000 해제').click()
  await expect(page.getByRole('heading', { name: '상품을 불러오지 못했습니다', exact: true })).toBeVisible()
  const failed = catalogCalls(filtersApi).at(-1).query
  await expect(page.getByLabel('상품 검색', { exact: true })).toHaveValue('나중 초안')
  await remove(page, '다시 시도').click(); await expect(page.locator('.product-card')).toHaveCount(12)
  expect(catalogCalls(filtersApi).at(-1).query).toEqual(failed)
  expect(requestQuery(filtersApi).get('q')).toBe('초기'); expect(requestQuery(filtersApi).get('minPriceKrw')).toBe('0')
  expect(requestQuery(filtersApi).getAll('tasteTag')).toEqual(['dry,sweet', 'line\nbreak'])
  await expect(page.getByLabel('상품 검색', { exact: true })).toHaveValue('나중 초안')
})

for (const departure of ['input', 'Back', 'route']) test(`해제의 늦은 응답은 현재 ${departure}·URL·초안을 덮거나 포커스를 훔치지 않음`, async ({ page }) => {
  let release, started = false; const gate = new Promise((resolve) => { release = resolve })
  await page.route('**/api/products?**', async (route) => {
    const q = new URL(route.request().url()).searchParams
    if (!q.has('maxPriceKrw')) { started = true; await gate }
    return route.fallback()
  })
  try {
    await page.goto(`/products?${applied()}`); await expect(page.locator('.product-card')).toHaveCount(2)
    const button = remove(page, '최대 가격(원) 12000 해제'); await button.focus(); await button.press('Enter')
    await expect.poll(() => started).toBe(true)
    if (departure === 'route') {
      await page.locator('header').getByRole('link', { name: '장바구니', exact: true }).click()
      await expect(page).toHaveURL(/\/cart$/); await expect(page.getByRole('heading', { name: '장바구니', exact: true })).toBeVisible()
      const target = page.getByRole('link', { name: '전체 주류 보기', exact: true }); await target.focus()
      const old = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/products' && !new URL(r.url()).searchParams.has('maxPriceKrw'))
      release(); await (await old).finished(); await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
      await expect(target).toBeFocused(); await expect(page).toHaveURL(/\/cart$/)
    } else {
      if (departure === 'Back') { await page.goBack(); await expect(page.locator('.product-card')).toHaveCount(2) }
      const input = page.getByLabel('상품 검색', { exact: true }); await input.fill('새 초안·이동 후')
      const old = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/products' && !new URL(r.url()).searchParams.has('maxPriceKrw'))
      release(); await (await old).finished(); await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
      await expect(page.locator('.product-card')).toHaveCount(departure === 'Back' ? 2 : 12)
      await expect(input).toBeFocused(); await expect(input).toHaveValue('새 초안·이동 후')
      expect(urlQuery(page).get('maxPriceKrw')).toBe(departure === 'Back' ? '12000' : null)
      if (departure === 'Back') {
        await page.goForward(); await expect(page.locator('.product-card')).toHaveCount(12)
        // Historical removal state cannot revive/preserve an unrelated later draft.
        await expect(input).toHaveValue('초기')
      }
    }
  } finally { release() }
})
