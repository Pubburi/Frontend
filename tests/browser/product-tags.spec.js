import { expect, test as base } from '@playwright/test'
import { openCatalogFilters } from './catalog-filters'

// Authored search contracts, not actual drink facts or training data.
const products = Array.from({ length: 7 }, (_, i) => ({ id: 1400 + i, name: `태그 시연 ${i}`, type: '탁주', price: i === 6 ? 20000 : 7777, abv: 6, img: null, orderCount: 0 }))
const features = [
  { taste: ['dry,sweet', 'line\nbreak'], aroma: ['floral'] },
  { taste: ['dry', 'sweet', 'line\nbreak'], aroma: ['floral'] },
  { taste: null, aroma: null }, { taste: [], aroma: [] },
  { taste: ['dry,sweet'], aroma: ['floral'] },
  { taste: ['dry,sweet', 'line\nbreak'], aroma: ['spice'] },
  { taste: ['dry,sweet', 'line\nbreak'], aroma: ['floral'] },
]
const success = (data) => ({ data, message: 'ok', error: null })
const failure = (code) => ({ data: null, message: null, error: { code, message: code } })
const pageOf = (items, p = 1) => ({ items: items.slice((p - 1) * 12, p * 12), page: p, size: 12, total: items.length, totalPages: Math.ceil(items.length / 12), hasNext: p * 12 < items.length })
const queryFor = (taste = ['dry,sweet', 'line\nbreak'], aroma = ['floral']) => {
  const q = new URLSearchParams({ minPriceKrw: '0', maxPriceKrw: '10000', minAbvPercent: '0', maxAbvPercent: '15', sort: 'name', page: '1' })
  taste.forEach((t) => q.append('tasteTag', t)); aroma.forEach((t) => q.append('aromaTag', t))
  return q
}
const test = base.extend({
  tagsApi: [async ({ page }, use) => {
    const state = { products: [...products], features: Object.fromEntries(products.map((p, i) => [p.id, features[i]])), calls: [], unexpected: [], errors: [], failures: 0 }
    page.on('pageerror', (e) => state.errors.push(e.message))
    await page.route('**/api/**', async (route) => {
      if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/users/me/notifications') return route.fulfill({ status: 404, json: { data: null, error: { code: 'NOTIFICATIONS_NOT_SUPPORTED' } } })
      if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/users/me/cart') return route.fulfill({ status: 404, json: { data: null, error: { code: 'CART_NOT_SUPPORTED' } } })
      const req = route.request(); const url = new URL(req.url()); const q = url.searchParams
      state.calls.push({ method: req.method(), path: url.pathname, query: [...q] })
      if (req.method() === 'GET' && url.pathname === '/api/auth/me') return route.fulfill({ status: 401, json: failure('UNAUTHORIZED') })
      if (req.method() === 'GET' && url.pathname === '/api/products') {
        if (state.failures) { state.failures--; return route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') }) }
        // Two fixed provider400 contracts; no browser Unicode casing oracle.
        if ((q.getAll('tasteTag').includes('Ä') && q.getAll('tasteTag').includes('ä')) || q.getAll('tasteTag').includes('a'.repeat(39) + 'İ'))
          return route.fulfill({ status: 400, json: failure('BAD_REQUEST') })
        const matches = state.products.filter((p) => (!q.get('q') || p.name.includes(q.get('q'))) && (!q.get('type') || p.type === q.get('type')) &&
          (!q.has('minPriceKrw') || p.price >= Number(q.get('minPriceKrw'))) && (!q.has('maxPriceKrw') || p.price <= Number(q.get('maxPriceKrw'))) &&
          (!q.has('minAbvPercent') || p.abv >= Number(q.get('minAbvPercent'))) && (!q.has('maxAbvPercent') || p.abv <= Number(q.get('maxAbvPercent'))) &&
          q.getAll('tasteTag').every((t) => state.features[p.id]?.taste?.includes(t.trim().toLowerCase())) &&
          q.getAll('aromaTag').every((t) => state.features[p.id]?.aroma?.includes(t.trim().toLowerCase())))
        return route.fulfill({ json: success(pageOf(matches, Number(q.get('page') || 1))) })
      }
      state.unexpected.push(`${req.method()} ${url.pathname}`)
      return route.fulfill({ status: 501, json: failure('UNEXPECTED_TEST_REQUEST') })
    })
    await use(state)
    expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([])
    expect(state.calls.filter((c) => c.method !== 'GET')).toEqual([])
  }, { auto: true }],
})
async function addTag(page, kind, value) {
  await openCatalogFilters(page)
  await page.getByRole('button', { name: `${kind} 조건 추가`, exact: true }).click()
  const inputs = page.getByRole('textbox', { name: new RegExp(`^${kind} 태그 조건 \\d+$`) })
  await inputs.last().fill(value)
}
const catalogCalls = (api) => api.calls.filter((c) => c.path === '/api/products')

test('맛과 향을 키보드로 골라 입력 없이 필터로 적용', async ({ page, tagsApi }) => {
  await page.goto('/products')
  await expect(page.locator('.product-card')).toHaveCount(7)
  await openCatalogFilters(page)
  const taste = page.getByRole('button', { name: '드라이한 맛', exact: true })
  const aroma = page.getByRole('button', { name: '꽃향', exact: true })
  await taste.press('Enter')
  await aroma.press('Space')
  await expect(taste).toHaveAttribute('aria-pressed', 'true')
  await expect(aroma).toHaveAttribute('aria-pressed', 'true')
  expect(catalogCalls(tagsApi)).toHaveLength(1)
  await page.getByRole('button', { name: '세부 조건 적용', exact: true }).click()
  await expect(page.locator('.product-card')).toHaveCount(1)
  const query = new URLSearchParams(catalogCalls(tagsApi).at(-1).query)
  expect(query.getAll('tasteTag')).toEqual(['dry'])
  expect(query.getAll('aromaTag')).toEqual(['floral'])
})

test('맛·향 태그 행은 쉼표·개행을 한 값으로 정규화하고 모든 조건을 반복 query로 검색', async ({ page, tagsApi }) => {
  await page.goto('/products')
  await expect(page.locator('.product-card')).toHaveCount(7)
  await addTag(page, '맛', ' DRY,SWEET '); await addTag(page, '맛', 'Line\nBreak'); await addTag(page, '향', ' Floral ')
  await page.getByLabel('최소 가격(원)', { exact: true }).fill('0')
  await page.getByLabel('최대 가격(원)', { exact: true }).fill('10000')
  expect(catalogCalls(tagsApi)).toHaveLength(1)
  await page.getByRole('button', { name: '검색하기', exact: true }).click()
  await expect(page).toHaveURL((url) => JSON.stringify(url.searchParams.getAll('tasteTag')) === JSON.stringify(['dry,sweet', 'line\nbreak']) && url.searchParams.get('aromaTag') === 'floral' && url.searchParams.get('minPriceKrw') === '0')
  await expect(page.locator('.product-card')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: '태그 시연 0', exact: true })).toBeVisible()
  const query = new URLSearchParams(catalogCalls(tagsApi).at(-1).query)
  expect(query.getAll('tasteTag')).toEqual(['dry,sweet', 'line\nbreak']); expect(query.getAll('aromaTag')).toEqual(['floral'])
  await expect(page.getByLabel('현재 적용된 태그 조건', { exact: true })).toContainText('dry,sweet')
  await page.getByRole('button', { name: '빠른 담기', exact: true }).click()
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('pubburi-cart')))
  expect(cart[0].product).toEqual(products[0]); expect(Object.keys(cart[0].product)).toHaveLength(7)
})

test('직접 반복 태그 URL을 복원하고 원문 초안과 적용 조건을 구분', async ({ page, tagsApi }) => {
  await page.goto(`/products?${queryFor([' DRY,SWEET ', 'Line\nBreak'], ['Floral'])}`)
  await expect(page.locator('.product-card')).toHaveCount(1)
  await openCatalogFilters(page)
  await expect(page.getByLabel('맛 태그 조건 1', { exact: true })).toHaveValue(' DRY,SWEET ')
  await expect(page.getByLabel('맛 태그 조건 2', { exact: true })).toHaveValue('Line\nBreak')
  const applied = page.getByLabel('현재 적용된 태그 조건', { exact: true })
  await expect(applied).toContainText('dry,sweet')
  await page.getByLabel('맛 태그 조건 1', { exact: true }).fill('새 초안')
  await expect(applied).toContainText('dry,sweet'); await expect(applied).not.toContainText('새 초안')
  expect(catalogCalls(tagsApi)).toHaveLength(1)
  await page.reload(); await openCatalogFilters(page); await expect(page.getByLabel('맛 태그 조건 1', { exact: true })).toHaveValue(' DRY,SWEET ')
})

for (const values of [[''], ['Dry', ' dry '], ['x'.repeat(41)]]) {
  test(`잘못된 태그 초안 ${JSON.stringify(values)}는 입력·오류 설명·포커스를 보존하고 전송하지 않음`, async ({ page, tagsApi }) => {
    await page.goto('/products'); await expect(page.locator('.product-card')).toHaveCount(7)
    for (const value of values) await addTag(page, '맛', value)
    await page.getByRole('button', { name: '검색하기', exact: true }).click()
    const input = page.getByLabel(`맛 태그 조건 ${values.length}`, { exact: true })
    await expect(input).toHaveValue(values.at(-1)); await expect(input).toBeFocused(); await expect(input).toHaveAttribute('aria-invalid', 'true')
    const id = await input.getAttribute('aria-describedby'); await expect(page.locator(`#${id}`)).toBeVisible()
    expect(catalogCalls(tagsApi)).toHaveLength(1)
  })
}
for (const invalid of ['tasteTag=', 'tasteTag=dry&tasteTag=DRY', `aromaTag=${'x'.repeat(41)}`, new URLSearchParams(Array.from({ length: 21 }, (_, i) => ['tasteTag', `tag${i}`])).toString()]) {
  test(`잘못된 직접 태그 URL ${invalid}는 상품 조회 없이 수정과 전체 해제를 허용`, async ({ page, tagsApi }) => {
    await page.goto(`/products?${invalid}`)
    await expect(page.getByRole('heading', { name: '검색 조건을 확인해 주세요', exact: true })).toBeVisible()
    expect(catalogCalls(tagsApi)).toHaveLength(0)
    await page.getByRole('button', { name: '전체 해제', exact: true }).click()
    await expect(page.locator('.product-card')).toHaveCount(7)
    await expect(page.getByLabel('맛 태그 조건 1', { exact: true })).toHaveCount(0)
  })
}

test('쉼표가 든 한 태그와 별도 두 태그는 다른 결과이며 빈 조건은 unknown·빈 배열을 제외하지 않음', async ({ page }) => {
  await page.goto(`/products?${queryFor()}`); await expect(page.locator('.product-card')).toHaveCount(1)
  await openCatalogFilters(page)
  await page.getByLabel('맛 태그 조건 1', { exact: true }).fill('dry')
  await addTag(page, '맛', 'sweet')
  await page.getByRole('button', { name: '검색하기', exact: true }).click()
  await expect(page.getByRole('heading', { name: '태그 시연 1', exact: true })).toBeVisible()
  await expect(page.locator('.product-card')).toHaveCount(1)
  await page.getByRole('button', { name: '전체 해제', exact: true }).click()
  await expect(page.locator('.product-card')).toHaveCount(7)
  await expect(page.getByRole('heading', { name: '태그 시연 2', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '태그 시연 3', exact: true })).toBeVisible()
})

test('태그 페이지는 미제출 행 대신 적용 조건을 쓰고 Enter 검색·뒤로·행 삭제를 복원', async ({ page, tagsApi }) => {
  tagsApi.products = Array.from({ length: 14 }, (_, i) => ({ ...products[0], id: 1500 + i, name: `태그 페이지 ${i}` }))
  tagsApi.features = Object.fromEntries(tagsApi.products.map((p) => [p.id, features[0]]))
  await page.goto(`/products?${queryFor()}`); await expect(page.locator('.product-card')).toHaveCount(12)
  await openCatalogFilters(page)
  await page.getByLabel('맛 태그 조건 1', { exact: true }).fill('미제출')
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await expect(page.locator('.product-card')).toHaveCount(2)
  await expect(page.getByLabel('맛 태그 조건 1', { exact: true })).toHaveValue('dry,sweet')
  await page.getByRole('button', { name: '맛 태그 조건 1 삭제', exact: true }).click()
  await expect(page.getByLabel('현재 적용된 태그 조건', { exact: true })).toContainText('dry,sweet')
  await page.getByRole('button', { name: '검색하기', exact: true }).focus(); await page.getByRole('button', { name: '검색하기', exact: true }).press('Enter')
  await expect(page.locator('.product-card')).toHaveCount(12)
  await expect(page).toHaveURL((url) => url.searchParams.get('page') === '1' && url.searchParams.getAll('tasteTag').length === 1)
  await page.goBack(); await expect(page.locator('.product-card')).toHaveCount(2)
  await expect(page.getByLabel('맛 태그 조건 1', { exact: true })).toHaveValue('dry,sweet')
})

test('각 종류20개는 허용하고 추가를 막으며 행을 삭제하면 다시 입력', async ({ page, tagsApi }) => {
  const query = queryFor(Array.from({ length: 20 }, (_, i) => `taste${i}`), Array.from({ length: 20 }, (_, i) => `aroma${i}`))
  await page.goto(`/products?${query}`)
  await expect(page.getByRole('heading', { name: '조건에 맞는 상품이 없습니다', exact: true })).toBeVisible()
  expect(catalogCalls(tagsApi)).toHaveLength(1)
  await openCatalogFilters(page)
  await expect(page.getByRole('button', { name: '맛 조건 추가', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '향 조건 추가', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '맛 태그 조건 20 삭제', exact: true }).click()
  await expect(page.getByRole('button', { name: '맛 조건 추가', exact: true })).toBeEnabled()
  await expect(page.getByLabel('맛 태그 조건 19', { exact: true })).toBeFocused()
  expect(catalogCalls(tagsApi)).toHaveLength(1)
})

test('이전 태그의 보류 응답은 새 반복 태그 검색을 덮지 않음', async ({ page }) => {
  let release; const gate = new Promise((resolve) => { release = resolve }); let started = false
  await page.route('**/api/products?**', async (route) => {
    if (!new URL(route.request().url()).searchParams.getAll('tasteTag').includes('dry,sweet')) return route.fallback()
    started = true; await gate; return route.fulfill({ json: success(pageOf([products[0]])) })
  })
  try {
    await page.goto(`/products?${queryFor()}`); await expect.poll(() => started).toBe(true)
    await openCatalogFilters(page)
    await page.getByLabel('맛 태그 조건 1', { exact: true }).fill('dry'); await addTag(page, '맛', 'sweet')
    await page.getByRole('button', { name: '검색하기', exact: true }).click()
    await expect(page.getByRole('heading', { name: '태그 시연 1', exact: true })).toBeVisible()
    const old = page.waitForResponse((r) => new URL(r.url()).searchParams.getAll('tasteTag').includes('dry,sweet'))
    release(); await (await old).finished(); await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    await expect(page.getByRole('heading', { name: '태그 시연 1', exact: true })).toBeVisible()
  } finally { release() }
})

test('Unicode 태그의 코드포인트와 비ASCII 대소문자는 URL과 API에서 보존', async ({ page, tagsApi }) => {
  await page.goto('/products'); await expect(page.locator('.product-card')).toHaveCount(7)
  for (const value of ['\u1c89', 'A:Σ', 'AΣ:A', 'İ']) await addTag(page, '맛', value)
  await page.getByRole('button', { name: '검색하기', exact: true }).click()
  await expect(page.getByRole('heading', { name: '조건에 맞는 상품이 없습니다', exact: true })).toBeVisible()
  const expected = ['\u1c89', 'a:Σ', 'aΣ:a', 'İ']
  expect(new URL(page.url()).searchParams.getAll('tasteTag')).toEqual(expected)
  expect(new URLSearchParams(catalogCalls(tagsApi).at(-1).query).getAll('tasteTag')).toEqual(expected)
})

for (const terms of [['Ä', 'ä'], ['a'.repeat(39) + 'İ']]) {
  test(`제공자400 ${JSON.stringify(terms)}는 URL과 새 초안을 유지하고 명시 수정으로 복구`, async ({ page, tagsApi }) => {
    let release; const gate = new Promise((resolve) => { release = resolve }); let started = false
    await page.route('**/api/products?**', async (route) => {
      const requested = new URL(route.request().url()).searchParams.getAll('tasteTag')
      if (JSON.stringify(requested) !== JSON.stringify(terms)) return route.fallback()
      started = true; await gate; return route.fallback()
    })
    try {
      await page.goto(`/products?${queryFor(terms, [])}`)
      await expect.poll(() => started).toBe(true)
      await openCatalogFilters(page)
      await page.getByLabel('맛 태그 조건 1', { exact: true }).fill('아직 제출하지 않은 값')
      release()
      await expect(page.getByRole('heading', { name: '검색 조건을 확인해 주세요', exact: true })).toBeVisible()
      await expect(page.locator('.product-card')).toHaveCount(0)
      await expect(page.getByLabel('맛 태그 조건 1', { exact: true })).toHaveValue('아직 제출하지 않은 값')
      expect(new URL(page.url()).searchParams.getAll('tasteTag')).toEqual(terms)
      expect(catalogCalls(tagsApi)).toHaveLength(1)
      await page.context().setOffline(true); await page.context().setOffline(false)
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      expect(catalogCalls(tagsApi)).toHaveLength(1)
      await page.getByRole('button', { name: '태그 조건 수정', exact: true }).click()
      await expect(page.getByLabel('맛 태그 조건 1', { exact: true })).toBeFocused()
      await openCatalogFilters(page)
      await page.getByLabel('맛 태그 조건 1', { exact: true }).fill('dry,sweet')
      if (terms.length === 2) await page.getByRole('button', { name: '맛 태그 조건 2 삭제', exact: true }).click()
      await addTag(page, '맛', 'line\nbreak')
      await addTag(page, '향', 'floral')
      await page.getByRole('button', { name: '검색하기', exact: true }).click()
      await expect(page.locator('.product-card')).toHaveCount(1)
      expect(new URLSearchParams(catalogCalls(tagsApi).at(-1).query).getAll('tasteTag')).toEqual(['dry,sweet', 'line\nbreak'])
    } finally { release() }
  })
}

test('이전 Unicode조건400은 이미 성공한 새 태그 검색을 차폐하거나 초안을 바꾸지 않음', async ({ page, tagsApi }) => {
  let release; const gate = new Promise((resolve) => { release = resolve }); let started = false
  await page.route('**/api/products?**', async (route) => {
    if (!new URL(route.request().url()).searchParams.getAll('tasteTag').includes('Ä')) return route.fallback()
    started = true; await gate; return route.fallback()
  })
  try {
    await page.goto(`/products?${queryFor(['Ä', 'ä'])}`); await expect.poll(() => started).toBe(true)
    await openCatalogFilters(page)
    await page.getByLabel('맛 태그 조건 1', { exact: true }).fill('dry,sweet')
    await page.getByLabel('맛 태그 조건 2', { exact: true }).fill('line\nbreak')
    await page.getByRole('button', { name: '검색하기', exact: true }).click()
    await expect(page.locator('.product-card')).toHaveCount(1)
    const old = page.waitForResponse((r) => new URL(r.url()).searchParams.getAll('tasteTag').includes('Ä'))
    release(); await (await old).finished(); await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    await expect(page.getByRole('heading', { name: '검색 조건을 확인해 주세요', exact: true })).toHaveCount(0)
    await expect(page.getByLabel('맛 태그 조건 1', { exact: true })).toHaveValue('dry,sweet')
    await expect(page.locator('.product-card')).toHaveCount(1)
    expect(catalogCalls(tagsApi)).toHaveLength(2)
  } finally { release() }
})

test('태그503의 명시 재시도와390px 행 추가·개행·오류 수정·키보드 제출', async ({ page, tagsApi }) => {
  await page.setViewportSize({ width: 390, height: 844 }); tagsApi.failures = 1
  await page.goto(`/products?${queryFor()}`)
  await expect(page.getByRole('heading', { name: '상품을 불러오지 못했습니다', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '다시 시도', exact: true }).click(); await expect(page.locator('.product-card')).toHaveCount(1)
  const beforeNewline = catalogCalls(tagsApi).length
  await openCatalogFilters(page)
  await page.getByLabel('맛 태그 조건 2', { exact: true }).fill('line')
  await page.getByLabel('맛 태그 조건 2', { exact: true }).press('End')
  await page.getByLabel('맛 태그 조건 2', { exact: true }).press('Enter')
  await page.getByLabel('맛 태그 조건 2', { exact: true }).pressSequentially('break')
  await expect(page.getByLabel('맛 태그 조건 2', { exact: true })).toHaveValue('line\nbreak')
  expect(catalogCalls(tagsApi)).toHaveLength(beforeNewline)
  await page.getByRole('button', { name: '향 조건 추가', exact: true }).focus(); await page.getByRole('button', { name: '향 조건 추가', exact: true }).press('Enter')
  await expect(page.getByLabel('향 태그 조건 2', { exact: true })).toBeFocused()
  await page.getByRole('button', { name: '검색하기', exact: true }).click(); await expect(page.getByLabel('향 태그 조건 2', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  await page.getByRole('button', { name: '향 태그 조건 2 삭제', exact: true }).click()
  await page.getByRole('button', { name: '검색하기', exact: true }).focus(); await page.getByRole('button', { name: '검색하기', exact: true }).press('Enter')
  await expect(page.locator('.product-card')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
