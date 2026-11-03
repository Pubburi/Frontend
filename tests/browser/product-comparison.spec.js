import { expect, test as base } from '@playwright/test'

// Authored Product7/feature contracts, not real product facts or recommendation evidence.
const product = (id) => ({ id, name: `비교 표본 ${id}`, price: id === 201 ? 0 : id * 100, abv: id === 201 ? 0 : id === 203 ? 6.23456 : 6.25, type: '탁주', img: null, orderCount: 0 })
const feature = (id, values = {}) => ({ productId: id, volumeMl: null, tasteTags: null, aromaTags: null, description: null, sourceName: null, sourceUrl: null, sourceNote: null, ...values })
const success = (data) => ({ data, message: 'ok', error: null })
const failure = (code) => ({ data: null, message: null, error: { code, message: code } })
const test = base.extend({
  comparisonApi: [async ({ page }, use) => {
    const state = {
      products: new Map([201, 202, 203, 204, 205].map((id) => [id, product(id)])),
      features: new Map([201, 202, 203, 204, 205].map((id) => [id, feature(id)])),
      productErrors: new Map(), featureErrors: new Map(), calls: [], unexpected: [], errors: [],
    }
    state.features.set(201, feature(201, { volumeMl: 500, tasteTags: ['dry,sweet', 'line\nbreak'], aromaTags: [], sourceName: '직접 작성한 근거', sourceUrl: 'https://example.test/facts', sourceNote: '검증 표본' }))
    state.features.set(203, feature(203, { tasteTags: [], aromaTags: ['<floral>'], sourceName: '별도 검수 표본' }))
    page.on('pageerror', (error) => state.errors.push(error.message))
    await page.route('**/api/**', async (route) => {
      const request = route.request(); const url = new URL(request.url()); const path = url.pathname
      state.calls.push({ method: request.method(), path, query: url.search })
      if (request.method() === 'GET' && path === '/api/auth/me') return route.fulfill({ status: 401, json: failure('UNAUTHORIZED') })
      if (request.method() === 'GET' && path === '/api/products') {
        const items = [...state.products.values()]
        return route.fulfill({ json: success({ items, page: 1, size: 12, total: items.length, totalPages: 1, hasNext: false }) })
      }
      const match = path.match(/^\/api\/products\/(\d+)(\/features|\/comments)?$/)
      if (request.method() === 'GET' && match) {
        const id = Number(match[1])
        if (match[2] === '/comments') return route.fulfill({ json: success({ items: [], page: 1, size: 10, total: 0, totalPages: 0, hasNext: false }) })
        const status = (match[2] ? state.featureErrors : state.productErrors).get(id)
        if (status) return route.fulfill({ status, json: failure(status === 404 ? 'NOT_FOUND' : 'SERVICE_UNAVAILABLE') })
        const value = (match[2] ? state.features : state.products).get(id)
        return value ? route.fulfill({ json: success(value) }) : route.fulfill({ status: 404, json: failure('NOT_FOUND') })
      }
      state.unexpected.push(`${request.method()} ${path}`)
      return route.fulfill({ status: 501, json: failure('UNEXPECTED_TEST_REQUEST') })
    })
    await use(state)
    expect(state.unexpected).toEqual([])
    expect(state.errors).toEqual([])
    expect(state.calls.filter((call) => call.method !== 'GET')).toEqual([])
  }, { auto: true }],
})
const cell = (page, id, field) => page.locator(`td[data-product-id="${id}"][data-field="${field}"]`)
const itemReads = (calls) => calls.filter((call) => /^\/api\/products\/\d+(\/features)?$/.test(call.path))

test('목록·상세의 비교 선택은 필터 URL·Product7 장바구니를 보존하고 현재 값을 따로 조회', async ({ page, comparisonApi }) => {
  const url = '/products?minPriceKrw=0&tasteTag=dry%2Csweet&sort=name&page=1'
  await page.goto(url)
  await page.getByRole('button', { name: '비교 표본 201 비교 선택', exact: true }).click()
  await expect(page).toHaveURL(url)
  expect(itemReads(comparisonApi.calls)).toEqual([])
  await page.locator('.product-card').filter({ has: page.getByRole('heading', { name: '비교 표본 202', exact: true }) }).getByRole('link', { name: '상세 보기', exact: true }).click()
  await page.getByRole('button', { name: '수량 늘리기', exact: true }).click()
  await page.getByRole('button', { name: '2개 장바구니에 담기', exact: true }).click()
  const cart = await page.evaluate(() => localStorage.getItem('pubburi-cart'))
  await page.getByRole('button', { name: '비교 표본 202 비교 선택', exact: true }).click()
  comparisonApi.products.set(201, { ...product(201), price: 7777 })
  await page.getByRole('link', { name: '상품 비교 2', exact: true }).click()
  await expect(page).toHaveURL('/compare?productId=201&productId=202')
  await expect(cell(page, 201, 'price')).toHaveText('7,777원')
  await expect(cell(page, 201, 'abv')).toHaveText('0%')
  await expect(cell(page, 201, 'volume')).toHaveText('500 mL')
  await expect(cell(page, 201, 'taste').locator('li')).toHaveText(['dry,sweet', 'line\nbreak'])
  expect(await cell(page, 201, 'taste').locator('li').evaluateAll((nodes) => nodes.map((node) => node.textContent))).toEqual(['dry,sweet', 'line\nbreak'])
  await expect(cell(page, 201, 'aroma')).toHaveText('등록된 태그 없음')
  await expect(cell(page, 202, 'taste')).toHaveText('미확인')
  await expect(cell(page, 201, 'source').getByRole('link')).toHaveAttribute('href', 'https://example.test/facts')
  await test.info().attach('comparison-desktop', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
  expect(await page.evaluate(() => localStorage.getItem('pubburi-cart'))).toBe(cart)
  await page.goBack()
  await expect(page.getByRole('button', { name: '비교 표본 202 비교 해제', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('최대 네 개 선택과 동일 상품 해제는 동기적으로 적용되고 다섯 번째를 몰래 교체하지 않음', async ({ page }) => {
  await page.goto('/products')
  for (const id of [201, 202, 203, 204]) await page.getByRole('button', { name: `비교 표본 ${id} 비교 선택`, exact: true }).click()
  await page.getByRole('button', { name: '비교 표본 205 비교 선택', exact: true }).click()
  await expect(page.getByRole('link', { name: '상품 비교 4', exact: true })).toHaveAttribute('href', '/compare?productId=201&productId=202&productId=203&productId=204')
  await expect(page.getByRole('button', { name: '비교 표본 205 비교 선택', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('status').filter({ hasText: '비교 상품은 최대 4개입니다.' })).toBeVisible()
  await page.getByRole('button', { name: '비교 표본 202 비교 해제', exact: true }).click()
  await page.getByRole('button', { name: '비교 표본 205 비교 선택', exact: true }).click()
  await page.getByRole('link', { name: '상품 비교 4', exact: true }).click()
  await expect(page.locator('thead th[data-product-id]')).toHaveCount(4)
  expect(await page.locator('thead th[data-product-id]').evaluateAll((nodes) => nodes.map((node) => node.dataset.productId))).toEqual(['201', '203', '204', '205'])
})

test('직접 비교 URL의 순서·새로고침·뒤로와 키보드 제거/전체 해제는 현재 선택에 속함', async ({ page, comparisonApi }) => {
  await page.goto('/compare?productId=203&productId=201')
  await expect(cell(page, 201, 'price')).toHaveText('0원')
  await page.reload()
  await expect(cell(page, 203, 'taste')).toHaveText('등록된 태그 없음')
  await expect(cell(page, 203, 'aroma').locator('li')).toHaveText(['<floral>'])
  const remove = page.getByRole('button', { name: '상품 203 비교 해제', exact: true })
  await remove.focus(); await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/compare?productId=201')
  await expect(page.getByRole('heading', { name: '상품 비교', exact: true })).toBeFocused()
  await expect(page.locator('thead th[data-product-id]')).toHaveCount(1)
  await expect(page.getByRole('link', { name: '상품 비교 1', exact: true })).toHaveAttribute('href', '/compare?productId=201')
  await page.goBack()
  await expect(page.locator('thead th[data-product-id]')).toHaveCount(2)
  await expect(page.getByRole('link', { name: '상품 비교 2', exact: true })).toHaveAttribute('href', '/compare?productId=203&productId=201')
  const clear = page.getByRole('button', { name: '비교 전체 해제', exact: true })
  const before = itemReads(comparisonApi.calls).length
  await clear.focus(); await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/compare')
  await expect(page.getByRole('heading', { name: '비교할 상품을 골라 주세요', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '상품 비교', exact: true })).toBeFocused()
  expect(itemReads(comparisonApi.calls)).toHaveLength(before)
})

for (const query of ['productId=', 'productId=01', 'productId=1e2', 'productId=201%0A', 'productId=9007199254740992', 'productId=201&productId=201', 'productId=201&productId=202&productId=203&productId=204&productId=205']) {
  test(`잘못된 비교 주소 ${query}는 일부 선택으로 축소하거나 상품을 조회하지 않음`, async ({ page, comparisonApi }) => {
    await page.goto(`/compare?${query}`)
    await expect(page.getByRole('heading', { name: '비교 상품 주소를 확인해 주세요', exact: true })).toBeVisible()
    expect(itemReads(comparisonApi.calls)).toEqual([])
    await page.getByRole('button', { name: '비교 전체 해제', exact: true }).click()
    await expect(page).toHaveURL('/compare')
    await expect(page.getByRole('link', { name: '상품 더 고르기', exact: true })).toHaveAttribute('href', '/products')
    expect(itemReads(comparisonApi.calls)).toEqual([])
  })
}

test('한 상품의 로딩·404·503은 다른 상품을 가리지 않고 실패한 항목만 명시적으로 복구', async ({ page, comparisonApi }) => {
  comparisonApi.productErrors.set(201, 404); comparisonApi.productErrors.set(203, 503)
  await page.goto('/compare?productId=201&productId=202&productId=203')
  await expect(page.locator('thead th[data-product-id="201"]')).toContainText('상품을 찾을 수 없습니다.')
  await expect(page.locator('thead th[data-product-id="203"]')).toContainText('상품을 불러오지 못했습니다.')
  await expect(cell(page, 202, 'price')).toHaveText('20,200원')
  expect(comparisonApi.calls.filter((call) => call.path === '/api/products/201/features')).toEqual([])
  comparisonApi.productErrors.delete(203)
  await page.locator('thead th[data-product-id="203"]').getByRole('button', { name: '상품 다시 불러오기', exact: true }).click()
  await expect(cell(page, 203, 'aroma')).toHaveText('<floral>')
  await expect(cell(page, 203, 'abv')).toHaveText('6.23456%')
  expect(comparisonApi.calls.filter((call) => call.path === '/api/products/201')).toHaveLength(1)
})

test('특성 오류·잘못된 productId는 기본 정보를 보존하고 재시도 후 현재 특성만 표시', async ({ page, comparisonApi }) => {
  comparisonApi.featureErrors.set(201, 503)
  comparisonApi.features.set(202, feature(201, { tasteTags: ['wrong'] }))
  await page.goto('/compare?productId=201&productId=202')
  for (const id of [201, 202]) {
    await expect(cell(page, id, 'feature-state')).toContainText('상품 특성을 불러오지 못했습니다.')
    await expect(cell(page, id, 'taste')).toHaveText('확인할 수 없음')
  }
  await expect(cell(page, 201, 'price')).toHaveText('0원')
  comparisonApi.featureErrors.delete(201)
  await cell(page, 201, 'feature-state').getByRole('button', { name: '특성 다시 불러오기', exact: true }).click()
  await expect(cell(page, 201, 'volume')).toHaveText('500 mL')
  comparisonApi.features.set(202, feature(202))
  await cell(page, 202, 'feature-state').getByRole('button', { name: '특성 다시 불러오기', exact: true }).click()
  await expect(cell(page, 202, 'taste')).toHaveText('미확인')
})

test('제거한 상품의 늦은 특성 성공은 남은 상품이나 새 선택을 덮지 않음', async ({ page }) => {
  let release; const gate = new Promise((resolve) => { release = resolve }); let started = false
  await page.route('**/api/products/201/features', async (route) => { started = true; await gate; await route.fulfill({ json: success(feature(201, { tasteTags: ['late old'], sourceName: 'old' })) }) })
  try {
    await page.goto('/compare?productId=201&productId=202')
    await expect.poll(() => started).toBe(true)
    await expect(cell(page, 201, 'feature-state')).toContainText('불러오는 중')
    await expect(cell(page, 202, 'taste')).toHaveText('미확인')
    await page.getByRole('button', { name: '상품 201 비교 해제', exact: true }).click()
    const browse = page.getByRole('link', { name: '상품 더 고르기', exact: true }); await browse.focus()
    release()
    await expect(page.locator('thead th[data-product-id]')).toHaveCount(1)
    await expect(cell(page, 202, 'taste')).toHaveText('미확인')
    await expect(page.getByText('late old', { exact: true })).toHaveCount(0)
    await expect(browse).toBeFocused()
  } finally { release() }
})

test('기본 상품 보류 중 제거·늦은 오류는 현재 URL의 다른 상품/특성·선택을 덮지 않음', async ({ page, comparisonApi }) => {
  let release; const gate = new Promise((resolve) => { release = resolve }); let started = false
  await page.route('**/api/products/201', async (route) => { started = true; await gate; await route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') }) })
  try {
    await page.goto('/compare?productId=201&productId=202')
    await expect.poll(() => started).toBe(true)
    await expect(page.locator('thead th[data-product-id="201"]')).toContainText('상품 201 정보를 불러오는 중입니다.')
    await expect(cell(page, 202, 'taste')).toHaveText('미확인')
    const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/products/201')
    await page.getByRole('button', { name: '상품 201 비교 해제', exact: true }).click()
    release(); await response
    await expect(page).toHaveURL('/compare?productId=202')
    await expect(cell(page, 202, 'price')).toHaveText('20,200원')
    await expect(page.getByText('상품을 불러오지 못했습니다.', { exact: true })).toHaveCount(0)
    expect(comparisonApi.calls.filter((call) => call.path === '/api/products/201/features')).toEqual([])
  } finally { release() }
})

test('상품 응답의 다른 ID는 현재 상품 사실로 표시하지 않고 명시 재시도 뒤 복구', async ({ page, comparisonApi }) => {
  comparisonApi.products.set(201, product(205))
  await page.goto('/compare?productId=201&productId=202')
  await expect(page.locator('thead th[data-product-id="201"]')).toContainText('상품을 불러오지 못했습니다.')
  await expect(cell(page, 201, 'price')).toHaveText('확인할 수 없음')
  await expect(page.getByRole('link', { name: '비교 표본 205', exact: true })).toHaveCount(0)
  comparisonApi.products.set(201, product(201))
  await page.locator('thead th[data-product-id="201"]').getByRole('button', { name: '상품 다시 불러오기', exact: true }).click()
  await expect(cell(page, 201, 'price')).toHaveText('0원')
})

test('캐시가 있어도 재진입의 offline 대기는 이전 가격/특성을 현재 조회 성공으로 표시하지 않음', async ({ page, comparisonApi }) => {
  await page.goto('/compare?productId=201')
  await expect(cell(page, 201, 'volume')).toHaveText('500 mL')
  await page.getByRole('link', { name: '상품 더 고르기', exact: true }).click()
  await expect(page.locator('.product-card')).toHaveCount(5)
  await page.context().setOffline(true)
  try {
    await page.getByRole('link', { name: '상품 비교 1', exact: true }).click()
    await expect(cell(page, 201, 'price')).toHaveText('연결을 기다리는 중')
    await expect(cell(page, 201, 'volume')).toHaveText('상품 정보 확인 후 조회')
    comparisonApi.products.set(201, { ...product(201), price: 5050 })
    comparisonApi.features.set(201, feature(201))
  } finally { await page.context().setOffline(false) }
  await expect(cell(page, 201, 'price')).toHaveText('5,050원')
  await expect(cell(page, 201, 'volume')).toHaveText('미확인')
})

test('캐시 재진입은 현재 상품/특성을 재조회하고 새 실패에 과거 가격을 내보내지 않음', async ({ page, comparisonApi }) => {
  await page.goto('/compare?productId=201')
  await expect(cell(page, 201, 'volume')).toHaveText('500 mL')
  await page.getByRole('link', { name: '상품 더 고르기', exact: true }).click()
  comparisonApi.productErrors.set(201, 503)
  await page.getByRole('link', { name: '상품 비교 1', exact: true }).click()
  await expect(cell(page, 201, 'price')).toHaveText('확인할 수 없음')
  comparisonApi.productErrors.delete(201)
  comparisonApi.products.set(201, { ...product(201), price: 9191 })
  comparisonApi.features.set(201, feature(201))
  await page.getByRole('button', { name: '상품 다시 불러오기', exact: true }).click()
  await expect(cell(page, 201, 'price')).toHaveText('9,191원')
  await expect(cell(page, 201, 'volume')).toHaveText('미확인')
})

test('390px 비교 표의 가로 이동·Tab/Enter 제거는 문서 넘침 없이 현재 선택과 포커스를 보존', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/compare?productId=201&productId=202&productId=203&productId=204')
  await expect(cell(page, 204, 'price')).toHaveText('20,400원')
  const region = page.getByRole('region', { name: '상품 비교 표', exact: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await test.info().attach('comparison-390', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
  await region.focus(); await page.keyboard.press('ArrowRight')
  await expect.poll(() => region.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '상품 201 비교 해제', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: '상품 비교', exact: true })).toBeFocused()
  await expect(page.locator('thead th[data-product-id]')).toHaveCount(3)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

// Hold only scheduler task delivery, keeping URL changes/native history and HTTP real within this fixture.
// This deterministically models Back before the removal's concurrent React commit.
test('제거의 React commit 전 빠른 nativeBack도 URL·표·전역선택과 보관 상태를 일치시킴', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.MessageChannel
    window.__holdComparisonRender = false; window.__heldComparisonTasks = []; window.__deliveredComparisonTasks = 0
    window.MessageChannel = function () {
      const channel = new Original(), post = channel.port2.postMessage.bind(channel.port2)
      channel.port1.addEventListener('message', () => window.__deliveredComparisonTasks++)
      channel.port2.postMessage = (...args) => {
        if (window.__holdComparisonRender) window.__heldComparisonTasks.push(() => post(...args))
        else post(...args)
      }
      return channel
    }
    window.MessageChannel.prototype = Original.prototype
    localStorage.setItem('pubburi-cart', JSON.stringify([{product:{id:201,name:'비교 표본 201',price:0,abv:0,type:'탁주',img:null,orderCount:0},quantity:2}]))
    localStorage.setItem('pubburi-recent-products-v1',JSON.stringify({version:1,entries:[{id:201,viewedAt:Date.now()}]}))
  })
  await page.goto('/compare?productId=203&productId=201')
  await expect(cell(page, 201, 'price')).toHaveText('0원')
  await expect(page.getByRole('link',{name:'상품 비교 2',exact:true})).toHaveAttribute('href','/compare?productId=203&productId=201')
  const stored=await page.evaluate(()=>({cart:localStorage.getItem('pubburi-cart'),recent:localStorage.getItem('pubburi-recent-products-v1')}))
  const remove=page.getByRole('button',{name:'상품 203 비교 해제',exact:true});await remove.focus()
  await page.evaluate(()=>{window.__holdComparisonRender=true})
  try {
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/compare?productId=201')
    expect(await page.evaluate(()=>window.__heldComparisonTasks.length)).toBeGreaterThan(0)
    await page.goBack()
    await expect(page).toHaveURL('/compare?productId=203&productId=201')
  } finally {
    await page.evaluate(()=>{window.__holdComparisonRender=false;for(const deliver of window.__heldComparisonTasks.splice(0))deliver()})
  }
  await expect.poll(()=>page.evaluate(()=>window.__deliveredComparisonTasks)).toBeGreaterThan(0)
  await expect(page.locator('thead th[data-product-id]')).toHaveCount(2)
  await expect(page.getByRole('link',{name:'상품 비교 2',exact:true})).toHaveAttribute('href','/compare?productId=203&productId=201')
  await page.getByRole('link',{name:'상품 더 고르기',exact:true}).click()
  await expect(page.getByRole('button',{name:'비교 표본 203 비교 해제',exact:true})).toHaveAttribute('aria-pressed','true')
  await expect(page.getByRole('button',{name:'비교 표본 201 비교 해제',exact:true})).toHaveAttribute('aria-pressed','true')
  expect(await page.evaluate(()=>({cart:localStorage.getItem('pubburi-cart'),recent:localStorage.getItem('pubburi-recent-products-v1')}))).toEqual(stored)
})
