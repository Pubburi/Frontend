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
    const state = { products, calls: [], unexpected: [], errors: [] }
    page.on('pageerror', (error) => state.errors.push(error.message))
    await page.route('**/api/**', async (route) => {
      const req = route.request(); const url = new URL(req.url()); const q = url.searchParams
      state.calls.push({ method: req.method(), path: url.pathname, query: [...q] })
      if (req.method() === 'GET' && url.pathname === '/api/auth/me') return route.fulfill({ status: 401, json: failure('UNAUTHORIZED') })
      if (req.method() === 'GET' && url.pathname === '/api/products') {
        const items = state.products.filter((p) => !q.get('q') || p.name.includes(q.get('q')))
        return route.fulfill({ json: success(pageOf(items, Number(q.get('page') || 1))) })
      }
      const detail = url.pathname.match(/^\/api\/products\/(\d+)(\/features|\/comments)?$/)
      if (req.method() === 'GET' && detail) {
        const product = state.products.find((item) => item.id === Number(detail[1]))
        if (!product) return route.fulfill({ status: 404, json: failure('NOT_FOUND') })
        if (detail[2] === '/features') return route.fulfill({ json: success({ productId: product.id, volumeMl: null, tasteTags: null, aromaTags: null, description: null, sourceName: null, sourceUrl: null, sourceNote: null }) })
        if (detail[2] === '/comments') return route.fulfill({ json: success({ ...pageOf([]), ratingSummary: { count: 0, average: null } }) })
        return route.fulfill({ json: success(product) })
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

for (const width of [390, 1280, 1440, 1920]) test(`${width}px 목록 카드와 로딩은 지정된 열·간격을 유지하고 문서를 넘치지 않음`, async ({ page, focusApi }) => {
  await page.setViewportSize({ width, height: 900 })
  const columns = width === 390 ? 2 : 4, gap = width === 390 ? 12 : 24, sectionGap = width === 390 ? 12 : 40
  const gate = await holdSecondPage(page)
  try {
    await page.goto(initialUrl); await expect(page.locator('.product-card')).toHaveCount(12)
    const sections = await page.locator('.catalog-products').evaluate((element) => {
      const intro = element.querySelector('.shop-intro').getBoundingClientRect(), form = element.querySelector('.filter-panel').getBoundingClientRect()
      return { gap: parseFloat(getComputedStyle(element).rowGap), distance: form.top - intro.bottom }
    })
    expect(sections.gap).toBe(sectionGap); expect(sections.distance).toBeCloseTo(sectionGap, 1)
    for (const phase of ['results', 'loading']) {
      const grid = results(page).locator(phase === 'results' ? '.product-grid' : '.skeleton-grid')
      await expect(grid).toBeVisible()
      const geometry = await grid.evaluate((element) => {
        const style = getComputedStyle(element)
        return { columns: style.gridTemplateColumns.split(/\s+/).length, rowGap: parseFloat(style.rowGap), columnGap: parseFloat(style.columnGap),
          items: Array.from(element.children).map((child) => { const rect = child.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } }) }
      })
      expect(geometry.columns).toBe(columns); expect(geometry.rowGap).toBe(gap); expect(geometry.columnGap).toBe(gap)
      expect(geometry.items).toHaveLength(phase === 'results' ? 12 : 4)
      for (let index = 1; index < columns; index++) {
        expect(geometry.items[index].top).toBeCloseTo(geometry.items[0].top, 1)
        expect(geometry.items[index].left - geometry.items[index - 1].right).toBeCloseTo(gap, 1)
      }
      if (geometry.items.length > columns)
        expect(geometry.items[columns].top - Math.max(...geometry.items.slice(0, columns).map((item) => item.bottom))).toBeCloseTo(gap, 1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      if (phase === 'results') {
        await nextButton(page).press('Enter'); await expect.poll(gate.started).toBe(true)
      }
    }
    gate.release(); await expect(page.locator('.product-card')).toHaveCount(2)
    await expect(page).toHaveURL((url) => url.searchParams.get('page') === '2')
    expect(focusApi.calls.filter((call) => call.path === '/api/products')).toHaveLength(2)
  } finally { gate.release() }
})

for (const width of [390, 1280]) {
  test(`${width}px 카드 사진과 이름은 같은 상세 링크이고 담기와 비교는 독립적으로 작동`, async ({ page, focusApi }) => {
    const secondName = '포커스 상품 1 긴 이름의 전통주 봄 한정판 첫 번째 양조장 병입 상품'
    focusApi.products = [750, null, undefined, 0, 1.5, '750', 1_000_001, 1, 1_000_000].map((volumeMl, index) => ({
      ...products[index], name: index === 1 ? secondName : products[index].name, volumeMl,
    }))
    await page.setViewportSize({ width, height: 880 })
    await page.goto(initialUrl)
    const cards = results(page).getByRole('article')
    const first = cards.first()
    const detail = first.getByRole('link', { name: '포커스 상품 0', exact: true })
    const add = first.getByRole('button', { name: '빠른 담기', exact: true })
    const select = first.getByRole('button', { name: '포커스 상품 0 비교 선택', exact: true })
    await expect(first.getByRole('link')).toHaveCount(1)
    await expect(detail).toHaveAttribute('href', '/products/1700')
    await expect(detail.getByRole('heading', { name: '포커스 상품 0', exact: true })).toBeVisible()
    await expect(detail.getByRole('img')).toBeVisible()
    const expectedVolumes = ['용량 750 mL', ...Array(6).fill('용량 미확인'), '용량 1 mL', '용량 1,000,000 mL']
    for (const [index, label] of expectedVolumes.entries()) {
      await expect(cards.nth(index).getByText(label, { exact: true })).toBeVisible()
    }
    const originalPrice = await first.getByText('7,777원', { exact: true }).boundingBox()
    const adjacentPrice = await cards.nth(1).getByText('7,777원', { exact: true }).boundingBox()
    expect(Math.abs(originalPrice.y - adjacentPrice.y)).toBeLessThan(1)
    await detail.focus()
    await page.keyboard.press('Tab')
    await expect(add).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: /장바구니/ }).locator('.cart-count')).toHaveText('1')
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pubburi-cart')))).toEqual([{ product: products[0], quantity: 1 }])
    await page.keyboard.press('Tab')
    await expect(select).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(first.getByRole('button', { name: '포커스 상품 0 비교 해제', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(initialUrl)
    await page.keyboard.press('Tab')
    await expect(results(page).getByRole('link', { name: secondName, exact: true })).toBeFocused()
    expect(focusApi.calls.filter(({ path }) => path.startsWith('/api/products')).map(({ path }) => path)).toEqual(['/api/products'])
    await detail.getByRole('img').click()
    await expect(page.getByRole('heading', { name: '포커스 상품 0', level: 1, exact: true })).toBeVisible()
  })
}

for (const { width, browserBack } of [{ width: 390, browserBack: false }, { width: 1280, browserBack: true }]) {
  test(`${width}px 상세에서 ${browserBack ? '브라우저 뒤로' : '목록 링크'}로 돌아오면 조건·상품 링크·위치를 복원`, async ({ page, focusApi }) => {
    focusApi.products = Array.from({ length: 24 }, (_, index) => ({ ...products[0], id: 1700 + index, name: `포커스 상품 ${index + 1}` }))
    await page.setViewportSize({ width, height: 880 })
    const listUrl = initialUrl.replace('page=1', 'page=2')
    await page.goto(listUrl)
    const product = page.getByRole('link', { name: '포커스 상품 23', exact: true })
    await expect(product).toBeVisible()
    const before = await product.evaluate((el) => {
      history.scrollRestoration = 'manual'
      el.scrollIntoView({ block: 'center', behavior: 'instant' })
      el.focus({ preventScroll: true })
      return { top: el.getBoundingClientRect().top, scroll: scrollY, entry: history.state?.key }
    })
    expect(before.scroll).toBeGreaterThan(0)
    await product.press('Enter')
    await expect(page.getByRole('heading', { name: '포커스 상품 23', level: 1, exact: true })).toBeVisible()
    if (browserBack) await page.goBack()
    else await page.getByRole('link', { name: /^(전체 주류 보기|검색 결과로 돌아가기)$/ }).press('Enter')
    await expect(page).toHaveURL(listUrl)
    await expect(page.getByLabel('상품 검색', { exact: true })).toHaveValue('포커스')
    await expect(product).toBeFocused()
    await expect.poll(() => product.evaluate((el, originalTop) => Math.abs(el.getBoundingClientRect().top - originalTop), before.top)).toBeLessThan(4)
    expect(await page.evaluate(() => history.state?.key)).toBe(before.entry)
  })
}

test('상품 상세에서 창 높이를 줄인 뒤 복귀해도 같은 필터와 방문 상품이 화면 안에 있다', async ({ page, focusApi }) => {
  focusApi.products = Array.from({ length: 24 }, (_, index) => ({ ...products[0], id: 1700 + index, name: `포커스 상품 ${index + 1}` }))
  const shorterHeight = 560
  const listUrl = initialUrl.replace('page=1', 'page=2')
  await page.setViewportSize({ width: 1280, height: 1200 })
  await page.goto(listUrl)
  const product = results(page).getByRole('link', { name: '포커스 상품 23', exact: true })
  const original = await product.evaluate((link) => {
    history.scrollRestoration = 'manual'
    link.focus({ preventScroll: true })
    const { top, height } = link.getBoundingClientRect()
    window.scrollBy({ top: top - (innerHeight - height - 100), behavior: 'instant' })
    const rect = link.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom, viewportHeight: innerHeight, entry: history.state?.key }
  })
  expect(original.top).toBeGreaterThan(shorterHeight)
  expect(original.bottom).toBeLessThanOrEqual(original.viewportHeight)
  await product.press('Enter')
  await expect(page.getByRole('heading', { name: '포커스 상품 23', level: 1, exact: true })).toBeVisible()
  await page.setViewportSize({ width: 1280, height: shorterHeight })

  await page.getByRole('link', { name: '검색 결과로 돌아가기', exact: true }).press('Enter')
  await expect(page).toHaveURL(listUrl)
  expect(await page.evaluate(() => history.state?.key)).toBe(original.entry)
  await expect(page.getByLabel('상품 검색', { exact: true })).toHaveValue('포커스')
  await expect(product).toBeFocused()
  await expect.poll(() => product.evaluate((link) => {
    const { top, bottom } = link.getBoundingClientRect()
    const headerBottom = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0
    return top >= headerBottom && bottom <= innerHeight
  })).toBe(true)
})

test('직접 연 상품 상세에서는 일반 상품 목록 링크로 이동한다', async ({ page }) => {
  await page.goto('/products/1700')
  await expect(page.getByRole('heading', { name: '포커스 상품 0', level: 1, exact: true })).toBeVisible()
  const browse = page.getByRole('link', { name: '전체 주류 보기', exact: true })
  await expect(browse).toHaveAttribute('href', '/products')
  await browse.press('Enter')
  await expect(page).toHaveURL('/products')
})

for (const method of ['휠', '키보드']) test(`상세에서 돌아온 뒤 목록을 다시 읽는 동안 ${method}로 스크롤하면 그 위치를 유지한다`, async ({ page }) => {
  await page.goto(initialUrl)
  const product = page.getByRole('link', { name: '포커스 상품 11', exact: true })
  await product.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0)
  await page.evaluate(() => { history.scrollRestoration = 'manual' })
  await product.press('Enter')
  await expect(page.getByRole('heading', { name: '포커스 상품 11', exact: true, level: 1 })).toBeVisible()
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
  let release
  const waiting = new Promise((resolve) => { release = resolve })
  let started = false
  await page.route('**/api/products?**', async (route) => {
    started = true
    await waiting
    return route.fallback()
  })
  try {
    await page.goBack()
    await expect.poll(() => started).toBe(true)
    const intendedScroll = method === '휠' ? 160 : await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
    expect(intendedScroll).toBeGreaterThan(0)
    if (method === '휠') {
      await page.mouse.move(500, 300)
      await page.mouse.wheel(0, intendedScroll)
    } else {
      await page.keyboard.press('End')
    }
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(intendedScroll)
    release()
    await expect(results(page)).toHaveAttribute('aria-busy', 'false')
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    await expect(product).not.toBeFocused()
    expect(await page.evaluate(() => scrollY)).toBe(intendedScroll)
  } finally { release() }
})

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
      const firstProduct = results(page).getByRole('link', { name: '포커스 상품 12', exact: true })
      await expect(firstProduct).toBeFocused()
      await expect(firstProduct).toHaveAttribute('href', '/products/1712')
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

for (const { outcome, width } of [
  { outcome: '검색 성공', width: 390 },
  { outcome: '다시 오류', width: 1440 },
  { outcome: '다른 입력', width: 1440 },
  { outcome: '다른 화면', width: 1440 },
]) test(`목록 재시도는 기존 검색 조건과 의도한 키보드 포커스를 유지한다 · ${outcome}`, async ({ page }) => {
  let release
  const pending = new Promise((resolve) => { release = resolve })
  const attempts = []
  await page.route('**/api/products?**', async (route) => {
    attempts.push(new URL(route.request().url()).search)
    if (attempts.length > 1) {
      await pending
      if (outcome !== '다시 오류') return route.fallback()
    }
    return route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') })
  })

  try {
    await page.setViewportSize({ width, height: 900 })
    const target = initialUrl.replace('page=1', 'page=2')
    await page.goto(target)
    const region = results(page)
    const retry = region.getByRole('button', { name: '다시 시도', exact: true })
    const input = page.getByLabel('상품 검색', { exact: true })
    await expect(retry).toBeVisible()
    await input.fill('아직 제출하지 않은 검색어')
    await retry.press('Enter')
    await expect.poll(() => attempts.length).toBe(2)
    await expect(region).toBeFocused()
    await expect(region).toHaveAttribute('aria-busy', 'true')
    await expect(input).toHaveValue('아직 제출하지 않은 검색어')
    await page.keyboard.press('Enter')

    const cart = page.getByRole('navigation', { name: '주요 메뉴', exact: true }).getByRole('link', { name: '장바구니', exact: true })
    if (outcome === '다른 화면') {
      await cart.click()
      await expect(page).toHaveURL('/cart')
      await expect(region).toHaveCount(0)
      await expect(cart).toBeFocused()
    } else if (outcome === '다른 입력') {
      await input.fill('재시도 중 작성한 검색어')
      await expect(input).toBeFocused()
    }

    const response = page.waitForResponse((reply) => new URL(reply.url()).pathname === '/api/products')
    release()
    await (await response).finished()
    if (outcome === '다른 화면') {
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
      await expect(page).toHaveURL('/cart')
      await expect(cart).toBeFocused()
    } else {
      await expect(page).toHaveURL(target)
      await expect(region).toHaveAttribute('aria-busy', 'false')
      if (outcome === '다시 오류') {
        await expect(region).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(retry).toBeFocused()
      } else {
        await expect(region.locator('.product-card')).toHaveCount(2)
        await expect(outcome === '다른 입력' ? input : region).toBeFocused()
      }
      await expect(input).toHaveValue(outcome === '다른 입력' ? '재시도 중 작성한 검색어' : '아직 제출하지 않은 검색어')
    }
    expect(attempts).toEqual([attempts[0], attempts[0]])
  } finally {
    release()
  }
})

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
  // Refresh the first page in place, then revisit the original keyboard entry with Forward.
  const search = page.getByRole('button', { name: '검색하기', exact: true })
  const sameUrl = page.url(); const historyLength = await page.evaluate(() => history.length)
  const [response] = await Promise.all([
    page.waitForResponse((result) => new URL(result.url()).pathname === '/api/products'),
    search.click(),
  ])
  expect(response.ok()).toBe(true)
  await expect(page).toHaveURL(sameUrl)
  await expect(page.locator('.product-card')).toHaveCount(12)
  expect(await page.evaluate(() => history.length)).toBe(historyLength)
  await results(page).focus()
  await page.evaluate(() => { window.__catalogScrollRequests = [] })
  await page.goForward(); await expect(page).toHaveURL((url) => url.searchParams.get('page') === '2')
  await expect(page.locator('.product-card')).toHaveCount(2); await expect(results(page)).toBeFocused()
  await expect.poll(() => page.evaluate(() => window.__catalogScrollRequests.filter((call) => call.args[0]?.top === 0).length)).toBe(1)
  await page.goBack(); await expect(page.locator('.product-card')).toHaveCount(12)
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
