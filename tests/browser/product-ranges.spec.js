import { expect, test as base } from '@playwright/test'

// Authored contract fixtures, not actual product or recommendation evidence.
const product = (id, name, price, abv) => ({ id, name, price, abv, type: '탁주', img: null, orderCount: 0 })
const products = [
  product(1200, '범위 영점', 0, 0),
  product(1201, '범위 최소', 6000, 6.25),
  product(1202, '범위 최대', 12000, 15),
  product(1203, '가격 하한 밖', 5999, 6.25),
  product(1204, '가격 상한 밖', 12001, 6.25),
  product(1205, '도수 하한 밖', 9000, 6.24),
  product(1206, '도수 상한 밖', 9000, 15.01),
]
const success = (data) => ({ data, message: 'ok', error: null })
const failure = (code) => ({ data: null, message: null, error: { code, message: code } })
const pageOf = (items, page = 1, size = 12) => ({ items: items.slice((page - 1) * size, page * size), page, size, total: items.length, totalPages: Math.ceil(items.length / size), hasNext: page * size < items.length })
const labels = { minPriceKrw: '최소 가격(원)', maxPriceKrw: '최대 가격(원)', minAbvPercent: '최소 도수(%)', maxAbvPercent: '최대 도수(%)' }
const test = base.extend({
  rangeApi: [async ({ page }, use) => {
    const state = { products: [...products], calls: [], unexpected: [], pageErrors: [], failures: 0 }
    page.on('pageerror', (error) => state.pageErrors.push(error.message))
    await page.route('**/api/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      state.calls.push({ method: request.method(), path: url.pathname, query: Object.fromEntries(url.searchParams) })
      if (request.method() === 'GET' && url.pathname === '/api/auth/me') return route.fulfill({ status: 401, json: failure('UNAUTHORIZED') })
      if (request.method() === 'GET' && url.pathname === '/api/products') {
        if (state.failures) { state.failures -= 1; return route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') }) }
        const query = url.searchParams
        const matches = state.products.filter((item) => (!query.get('type') || item.type === query.get('type')) && (!query.get('q') || item.name.includes(query.get('q'))) &&
          (!query.has('minPriceKrw') || item.price >= Number(query.get('minPriceKrw'))) && (!query.has('maxPriceKrw') || item.price <= Number(query.get('maxPriceKrw'))) &&
          (!query.has('minAbvPercent') || item.abv >= Number(query.get('minAbvPercent'))) && (!query.has('maxAbvPercent') || item.abv <= Number(query.get('maxAbvPercent'))))
        return route.fulfill({ json: success(pageOf(matches, Number(query.get('page') || 1), Number(query.get('size') || 12))) })
      }
      state.unexpected.push(`${request.method()} ${url.pathname}`)
      return route.fulfill({ status: 501, json: failure('UNEXPECTED_TEST_REQUEST') })
    })
    await use(state)
    expect(state.unexpected).toEqual([])
    expect(state.pageErrors).toEqual([])
    expect(state.calls.filter((call) => call.method !== 'GET')).toEqual([])
  }, { auto: true }],
})
async function fillRanges(page, values) {
  for (const [key, value] of Object.entries(values)) await page.getByLabel(labels[key], { exact: true }).fill(value)
}
const ranges = { minPriceKrw: '6000', maxPriceKrw: '12000', minAbvPercent: '6.25', maxAbvPercent: '15' }
const rangeQuery = new URLSearchParams(ranges).toString()

test('가격·도수 네 범위 입력은 포함 경계와 모든 조건을 함께 API에 전달', async ({ page, rangeApi }) => {
  await page.goto('/products')
  await expect(page.locator('.product-card')).toHaveCount(7)
  await fillRanges(page, ranges)
  expect(rangeApi.calls.filter((call) => call.path === '/api/products')).toHaveLength(1)
  await page.getByRole('button', { name: '검색하기', exact: true }).click()
  await expect(page).toHaveURL((url) => Object.entries(ranges).every(([key, value]) => url.searchParams.get(key) === value) && url.searchParams.get('page') === '1')
  await expect(page.locator('.product-card')).toHaveCount(2)
  await expect(page.getByRole('heading', { name: '범위 최소', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '범위 최대', exact: true })).toBeVisible()
  expect(rangeApi.calls.filter((call) => call.path === '/api/products').at(-1).query).toMatchObject({ ...ranges, page: '1', size: '12' })
  await expect(page.getByLabel('현재 적용된 가격·도수 범위', { exact: true })).toContainText('6,000원 이상')
  await expect(page.getByLabel('현재 적용된 가격·도수 범위', { exact: true })).toContainText('15% 이하')
})

test('직접 URL의 실제 영점 범위를 복원하고 미제출 초안과 적용 범위를 구분', async ({ page, rangeApi }) => {
  const zero = { minPriceKrw: '0', maxPriceKrw: '0', minAbvPercent: '0', maxAbvPercent: '0' }
  await page.goto(`/products?${new URLSearchParams(zero)}`)
  await expect(page.locator('.product-card')).toHaveCount(1)
  for (const key of Object.keys(zero)) await expect(page.getByLabel(labels[key], { exact: true })).toHaveValue('0')
  await expect(page.getByRole('heading', { name: '범위 영점', exact: true })).toBeVisible()
  const applied = page.getByLabel('현재 적용된 가격·도수 범위', { exact: true })
  await expect(applied).toContainText('0원 이하')
  await page.getByLabel(labels.maxPriceKrw, { exact: true }).fill('12000')
  await expect(applied).toContainText('0원 이하')
  await expect(applied).not.toContainText('12,000원 이하')
  expect(rangeApi.calls.filter((call) => call.path === '/api/products')).toHaveLength(1)
  await page.reload()
  await expect(page.getByLabel(labels.maxPriceKrw, { exact: true })).toHaveValue('0')
  expect(rangeApi.calls.filter((call) => call.path === '/api/products').at(-1).query).toMatchObject(zero)
})

for (const invalid of [
  { values: { minPriceKrw: '1e3' }, field: 'minPriceKrw' },
  { values: { minAbvPercent: '5.555' }, field: 'minAbvPercent' },
  { values: { maxPriceKrw: '00000000000' }, field: 'maxPriceKrw' },
  { values: { maxAbvPercent: '100.001' }, field: 'maxAbvPercent' },
  { values: { minPriceKrw: '100', maxPriceKrw: '99' }, field: 'maxPriceKrw' },
]) {
  test(`범위 입력 오류 ${JSON.stringify(invalid.values)}는 요청 없이 입력과 첫 오류 포커스를 유지`, async ({ page, rangeApi }) => {
    await page.goto('/products')
    await expect(page.locator('.product-card')).toHaveCount(7)
    await fillRanges(page, invalid.values)
    await page.getByRole('button', { name: '검색하기', exact: true }).click()
    await expect(page.getByLabel(labels[invalid.field], { exact: true })).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByLabel(labels[invalid.field], { exact: true })).toBeFocused()
    for (const [key, value] of Object.entries(invalid.values)) await expect(page.getByLabel(labels[key], { exact: true })).toHaveValue(value)
    expect(rangeApi.calls.filter((call) => call.path === '/api/products')).toHaveLength(1)
    await expect(page).toHaveURL('/products')
  })
}

for (const invalid of [
  'minPriceKrw=', 'maxPriceKrw=1e3', 'minPriceKrw=0&minPriceKrw=100', 'minAbvPercent=20&maxAbvPercent=10',
]) {
  test(`잘못된 직접 범위 URL ${invalid}는 무제약 조회로 바꾸지 않음`, async ({ page, rangeApi }) => {
    await page.goto(`/products?${invalid}`)
    await expect(page.getByRole('heading', { name: '검색 조건을 확인해 주세요', exact: true })).toBeVisible()
    await expect(page.locator('.product-card')).toHaveCount(0)
    expect(rangeApi.calls.filter((call) => call.path === '/api/products')).toEqual([])
    await page.getByRole('button', { name: '전체 해제', exact: true }).click()
    await expect(page).toHaveURL('/products?sort=popular&page=1')
    await expect(page.locator('.product-card')).toHaveCount(7)
  })
}

test('범위의 페이지 이동은 적용 조건을 쓰고 Enter·뒤로·전체 해제는 URL과 입력을 복원', async ({ page, rangeApi }) => {
  rangeApi.products = [products[0], ...Array.from({ length: 14 }, (_, i) => product(1300 + i, `페이지 범위 ${i + 1}`, 6000, 6.25))]
  await page.goto(`/products?${rangeQuery}&page=1`)
  await expect(page.locator('.product-card')).toHaveCount(12)
  await page.getByLabel(labels.maxPriceKrw, { exact: true }).fill('6000')
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await expect(page).toHaveURL((url) => url.searchParams.get('maxPriceKrw') === '12000' && url.searchParams.get('page') === '2')
  await expect(page.locator('.product-card')).toHaveCount(2)
  await expect(page.getByLabel(labels.maxPriceKrw, { exact: true })).toHaveValue('12000')
  await page.getByLabel(labels.maxPriceKrw, { exact: true }).fill('6000')
  await page.getByLabel(labels.maxPriceKrw, { exact: true }).press('Enter')
  await expect(page).toHaveURL((url) => url.searchParams.get('maxPriceKrw') === '6000' && url.searchParams.get('page') === '1')
  await expect(page.locator('.product-card')).toHaveCount(12)
  await expect(page.getByLabel('현재 적용된 가격·도수 범위', { exact: true })).toContainText('6,000원 이하')
  await page.goBack()
  await expect(page).toHaveURL((url) => url.searchParams.get('maxPriceKrw') === '12000' && url.searchParams.get('page') === '2')
  await expect(page.getByLabel(labels.maxPriceKrw, { exact: true })).toHaveValue('12000')
  await page.getByRole('button', { name: '전체 해제', exact: true }).click()
  await expect(page).toHaveURL('/products?sort=popular&page=1')
  for (const key of Object.keys(ranges)) await expect(page.getByLabel(labels[key], { exact: true })).toHaveValue('')
})

test('이전 범위의 보류 응답은 새 범위 결과를 덮지 않음', async ({ page }) => {
  let releaseOld
  const gate = new Promise((resolve) => { releaseOld = resolve })
  let oldRequested = false
  await page.route('**/api/products?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('maxPriceKrw') !== '12000') return route.fallback()
    oldRequested = true
    await gate
    return route.fulfill({ json: success(pageOf([products[1], products[2]])) })
  })
  try {
    await page.goto(`/products?${rangeQuery}`)
    await expect.poll(() => oldRequested).toBe(true)
    await fillRanges(page, { minPriceKrw: '0', maxPriceKrw: '0', minAbvPercent: '0', maxAbvPercent: '0' })
    await page.getByRole('button', { name: '검색하기', exact: true }).click()
    await expect(page.getByRole('heading', { name: '범위 영점', exact: true })).toBeVisible()
    const oldResponse = page.waitForResponse((response) => new URL(response.url()).searchParams.get('maxPriceKrw') === '12000')
    releaseOld()
    await (await oldResponse).finished()
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    await expect(page.locator('.product-card')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: '범위 영점', exact: true })).toBeVisible()
  } finally { releaseOld() }
})

test('범위 조회 실패는 같은 URL 조건의 명시적 재시도로 복구', async ({ page, rangeApi }) => {
  rangeApi.failures = 1
  await page.goto(`/products?${rangeQuery}`)
  await expect(page.getByRole('heading', { name: '상품을 불러오지 못했습니다', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '다시 시도', exact: true }).click()
  await expect(page.locator('.product-card')).toHaveCount(2)
  expect(rangeApi.calls.filter((call) => call.path === '/api/products').map((call) => call.query)).toEqual([
    expect.objectContaining(ranges), expect.objectContaining(ranges),
  ])
})

test('390px 범위 입력의 오류 안내와 Tab·Enter 제출은 단위·영점·화면 너비를 보존', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/products')
  await expect(page.locator('.product-card')).toHaveCount(7)
  await fillRanges(page, { minPriceKrw: '0', maxPriceKrw: '0', minAbvPercent: '0', maxAbvPercent: '0' })
  const last = page.getByLabel(labels.maxAbvPercent, { exact: true })
  await last.fill('0.001')
  await last.press('Enter')
  await expect(last).toHaveAttribute('aria-invalid', 'true')
  await expect(last).toBeFocused()
  await expect(page.locator('#range-error-maxAbvPercent')).toBeVisible()
  await expect(last).toHaveAttribute('aria-describedby', 'range-error-maxAbvPercent')
  await last.fill('0')
  await last.focus()
  await last.press('Tab')
  await expect(page.getByRole('button', { name: '검색하기', exact: true })).toBeFocused()
  await page.getByRole('button', { name: '검색하기', exact: true }).press('Enter')
  await expect(page.getByRole('heading', { name: '범위 영점', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await expect(page.getByRole('group', { name: '가격·도수 범위', exact: true })).toContainText('원')
})
