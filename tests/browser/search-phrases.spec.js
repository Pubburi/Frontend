import { test as base, expect } from '@playwright/test'
import { openCatalogFilters } from './catalog-filters'

// Authored typed Backend/provider contracts; not real preference or drink facts.
const users = [{ id: 'member', name: '회원A', role: 'USER' }, { id: 'other', name: '회원B', role: 'USER' }]
const products = [{ id: 7, name: '검색 표본 0', type: '맥주', price: 0, abv: 0, img: null, orderCount: 0 }, { id: 8, name: '검색 대조', type: '탁주', price: 30000, abv: 30, img: null, orderCount: 0 }]
const ok = (data) => ({ data, message: 'ok', error: null })
const bad = (status) => ({ data: null, message: null, error: { code: ({ 400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 409: 'CONFLICT' })[status] || 'SERVICE_UNAVAILABLE' } })
const pageOf = (items) => ({ items, page: 1, size: 12, total: items.length, totalPages: items.length ? 1 : 0, hasNext: false })
function wire(fields = []) {
  const conditions = { type: fields.includes('categories') ? '맥주' : null, minPriceKrw: 0, maxPriceKrw: 20000, minAbvPercent: fields.includes('targetAbvPercent') ? '0' : '0.00', maxAbvPercent: fields.includes('targetAbvPercent') ? '0' : '20.00', tasteTag: fields.includes('tasteTags') ? ['dry,sweet', 'line\nbreak', 'A:Σ'] : [], aromaTag: fields.includes('aromaTags') ? ['floral'] : [] }
  const query_pairs = Object.entries(conditions).flatMap(([name, value]) => value === null ? [] : (Array.isArray(value) ? value : [String(value)]).map((value) => ({ name, value })))
  return { source: 'PROVIDER', result: { algorithm: 'r06-explicit-search-phrases-v1', items: [{ template_id: fields.length ? 'selected_preferences' : 'hard_conditions', label: conditions.type ? '맥주 조건으로 검색' : fields.length ? '선택한 취향 조건으로 검색' : '지정 조건으로 상품 보기', conditions, query_pairs, backend_unicode_revalidation_required: fields.includes('tasteTags') }], candidate_count: 1, omitted_count: 0, product_count: null, diagnostics: fields.includes('tasteTags') ? [{ field: 'tasteTags', code: 'backend_unicode_revalidation_required' }] : [], fallback_reason: fields.length ? null : 'no_search_opt_in' } }
}
const urlFor = (body) => { const q = new URLSearchParams(); body.result.items[0].query_pairs.forEach(({ name, value }) => q.append(name, value)); q.append('sort', 'name'); q.append('page', '1'); return `/products?${q}` }
const labels = ['선호 주종을 검색 조건으로 사용', '선호 맛 태그를 검색 조건으로 사용', '선호 향 태그를 검색 조건으로 사용', '목표 도수를 검색 조건으로 사용']
const panel = (page) => page.getByRole('region', { name: '취향 조건으로 검색', exact: true })
const button = (page) => panel(page).getByRole('button', { name: '검색 문구 가져오기', exact: true })
const links = (page) => panel(page).locator('a[data-search-phrase]')
const initial = '/products?q=old&type=탁주&minPriceKrw=1&sort=priceDesc&page=1'
const test = base.extend({
  fixture: [async ({ page, context }, use) => {
    const s = { user: users[0], replies: [], meReplies: [], calls: [], unexpected: [], errors: [], gates: [], logoutStatus: 200 }
    s.hold = (path, response) => { let release; const wait = new Promise((r) => { release = r }); const gate = { path, response, wait, release, started: false }; s.gates.push(gate); return gate }
    s.phrases = () => s.calls.filter((c) => c.path === '/users/me/search-phrases')
    s.products = () => s.calls.filter((c) => c.path === '/products')
    page.on('pageerror', (e) => s.errors.push(e.message))
    context.on('page', (target) => target.on('pageerror', (e) => s.errors.push(e.message)))
    await context.route('**/api/**', async (route) => {
      if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/users/me/notifications') return route.fulfill({ status: 404, json: { data: null, error: { code: 'NOTIFICATIONS_NOT_SUPPORTED' } } })
      if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/users/me/cart') return route.fulfill({ status: 404, json: { data: null, error: { code: 'CART_NOT_SUPPORTED' } } })
      const r = route.request(), url = new URL(r.url()), path = url.pathname.slice(4), method = r.method()
      const payload = method === 'POST' && r.postData() ? r.postDataJSON() : null
      s.calls.push({ path, method, query: [...url.searchParams], ...(path === '/users/me/search-phrases' ? { payload } : {}) })
      let response
      if (method === 'GET' && path === '/auth/me') response = s.meReplies.shift() ?? { status: s.user ? 200 : 401, data: s.user }
      else if (method === 'POST' && path === '/auth/login') { s.user = users.find((u) => u.id === payload.id); response = { status: 200, data: s.user } }
      else if (method === 'POST' && path === '/auth/logout') { if (s.logoutStatus === 200) s.user = null; response = { status: s.logoutStatus, data: true } }
      else if (method === 'POST' && path === '/users/me/search-phrases') response = s.replies.shift() ?? { status: 200, data: wire(payload.searchOptInFields) }
      else if (method === 'GET' && path === '/products') {
        const q = url.searchParams
        const items = products.filter((p) => (!q.has('q') || p.name.includes(q.get('q'))) && (!q.has('type') || p.type === q.get('type')) && (!q.has('maxPriceKrw') || p.price <= Number(q.get('maxPriceKrw'))) && (!q.has('minPriceKrw') || p.price >= Number(q.get('minPriceKrw'))) && (!q.has('maxAbvPercent') || p.abv <= Number(q.get('maxAbvPercent'))) && (!q.has('tasteTag') || p.id === 7))
        response = { status: 200, data: pageOf(items) }
      } else if (method === 'GET' && path === '/products/popular') response = { status: 200, data: [] }
      else if (method === 'GET' && path === '/markets') response = { status: 200, data: pageOf([]) }
      else if (method === 'GET' && /\/profile$/.test(path)) response = { status: 200, data: { user: s.user, grade: { title: '씨앗' } } }
      else if (method === 'GET' && /\/orders$/.test(path)) response = { status: 200, data: pageOf([]) }
      const gate = s.gates.find((gate) => gate.path === path && !gate.started)
      if (gate) { gate.started = true; response = structuredClone(gate.response); await gate.wait }
      if (response) return route.fulfill({ status: response.status, json: response.status === 200 ? ok(response.data) : bad(response.status) })
      s.unexpected.push({ path, method }); return route.fulfill({ status: 501, json: bad(501) })
    })
    try { await use(s) } finally { s.gates.forEach((g) => g.release()); expect(s.errors).toEqual([]); expect(s.unexpected).toEqual([]); expect(s.calls.filter((c) => c.method !== 'GET' && !['/auth/login', '/auth/logout', '/users/me/search-phrases'].includes(c.path))).toEqual([]) }
  }, { auto: true }],
})
async function open(page, url = initial) { await page.goto(url); await expect(button(page)).toBeVisible(); await expect(page.getByRole('heading', { name: url === initial ? '조건에 맞는 상품이 없습니다' : '전체 주류 둘러보기', exact: true })).toBeVisible() }
async function requestPhrase(page) { await button(page).click(); await expect(links(page)).toHaveCount(1) }
async function loginSPA(page, id) { await page.locator('.user-pill').getByRole('link', { name: '로그인', exact: true }).click(); await page.getByLabel('아이디', { exact: true }).fill(id); await page.getByLabel('비밀번호', { exact: true }).fill('fixture'); await page.locator('form.auth-form').getByRole('button', { name: '로그인', exact: true }).click(); await expect(page).toHaveURL('/profile'); await page.getByRole('link', { name: '전체 주류', exact: true }).click(); await expect(button(page)).toBeVisible() }

for (const width of [1280, 390]) {
  test(`explicit separate optins/draft replacement/literal0-and-tags/Back/reset/keyboard at${width}`, async ({ page, fixture }, info) => {
    await page.setViewportSize({ width, height: 900 }); await page.addInitScript((product) => { localStorage.setItem('pubburi-cart', JSON.stringify([{ product, quantity: 2 }])); localStorage.setItem('pubburi-recent-products-v1', JSON.stringify({ version: 1, entries: [{ id: 7, viewedAt: Date.now() }] })) }, products[0])
    await open(page); expect(fixture.phrases()).toHaveLength(0)
    for (const label of labels) await expect(panel(page).getByRole('checkbox', { name: label, exact: true })).not.toBeChecked()
    const cart = await page.evaluate(() => localStorage.getItem('pubburi-cart'))
    await page.getByLabel('상품 검색', { exact: true }).fill('미제출 초안')
    for (const label of labels) await panel(page).getByRole('checkbox', { name: label, exact: true }).check()
    const reads = fixture.products().length; await button(page).focus(); await button(page).press('Enter'); await expect(links(page)).toHaveCount(1)
    expect(fixture.phrases()).toHaveLength(1); expect(fixture.phrases()[0].payload).toEqual({ searchOptInFields: ['categories', 'tasteTags', 'aromaTags', 'targetAbvPercent'], limit: 5 })
    await expect(page).toHaveURL(initial); await expect(page.getByLabel('상품 검색', { exact: true })).toHaveValue('미제출 초안'); expect(fixture.products()).toHaveLength(reads)
    await expect(panel(page)).toContainText('0원'); await expect(panel(page)).toContainText('dry,sweet'); await expect(links(page)).toHaveAttribute('href', urlFor(wire(['categories', 'tasteTags', 'aromaTags', 'targetAbvPercent'])))
    await links(page).focus(); await links(page).press('Enter'); await expect(page).toHaveURL(urlFor(wire(['categories', 'tasteTags', 'aromaTags', 'targetAbvPercent']))); await expect(page.locator('.product-card')).toHaveCount(1)
    expect(new URL(page.url()).searchParams.getAll('tasteTag')).toEqual(['dry,sweet', 'line\nbreak', 'A:Σ']); await expect(page.getByLabel('상품 검색', { exact: true })).toHaveValue('')
    expect(await page.evaluate(() => localStorage.getItem('pubburi-cart'))).toBe(cart); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await info.attach(`phrases-${width}.png`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
    await page.reload(); await expect(page.locator('.product-card')).toHaveCount(1); expect(fixture.phrases()).toHaveLength(1)
    await page.goBack(); await expect(page).toHaveURL(initial); await expect(page.getByLabel('상품 검색', { exact: true })).toHaveValue('old')
    await page.getByRole('button', { name: '전체 해제', exact: true }).click(); await expect(page.locator('.product-card')).toHaveCount(2)
  })
}
test('guest fixed default has no privatePOST;failed bootstrap is not guest and explicit session recovery works', async ({ page, fixture }) => {
  fixture.user = null; fixture.meReplies.push({ status: 503 }); await page.goto('/products')
  await expect(panel(page).getByText('로그인 상태를 확인하지 못했습니다.', { exact: true })).toBeVisible(); await expect(panel(page).getByRole('link', { name: '전체 상품 보기', exact: true })).toHaveCount(0)
  await panel(page).getByRole('button', { name: '로그인 상태 다시 확인', exact: true }).click(); await expect(panel(page).getByRole('link', { name: '전체 상품 보기', exact: true })).toHaveAttribute('href', '/products'); expect(fixture.phrases()).toHaveLength(0)
})
for (const [fallback, code] of [['selected_preferences_unknown', 'selected_unknown'], ['selected_preferences_empty', 'selected_empty'], ['selected_target_outside_hard_bounds', null]]) {
  test(`${fallback} is an explicit empty template result,not an unconstrained search`, async ({ page, fixture }) => {
    const value = wire(['tasteTags']); Object.assign(value.result, { items: [], candidate_count: 0, diagnostics: code ? [{ field: 'tasteTags', code }] : [], fallback_reason: fallback }); fixture.replies.push({ status: 200, data: value })
    await open(page); await panel(page).getByRole('checkbox', { name: labels[1], exact: true }).check(); await button(page).click(); await expect(panel(page).getByRole('heading', { name: '적용할 검색 문구가 없습니다', exact: true })).toBeVisible(); await expect(links(page)).toHaveCount(0); await expect(page).toHaveURL(initial); expect(fixture.products()).toHaveLength(1)
  })
}
for (const [status, title] of [[400, '저장한 검색 조건을 확인해 주세요'], [409, '취향이 변경되었습니다'], [503, '검색 문구를 가져오지 못했습니다']]) {
  test(`${status} preserves URL/draft/choice,with explicit current-snapshot retry only`, async ({ page, fixture }) => {
    fixture.replies.push({ status }); await open(page); await page.getByLabel('상품 검색', { exact: true }).fill('남은 초안'); await panel(page).getByRole('checkbox', { name: labels[1], exact: true }).check(); await button(page).click()
    await expect(panel(page).getByRole('heading', { name: title, exact: true })).toBeVisible(); await expect(page.getByLabel('상품 검색', { exact: true })).toHaveValue('남은 초안'); await expect(links(page)).toHaveCount(0); await expect(page).toHaveURL(initial)
    await page.evaluate(() => { window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('focus')) }); expect(fixture.phrases()).toHaveLength(1)
    await requestPhrase(page); expect(fixture.phrases()).toHaveLength(2); await expect(links(page)).toHaveAttribute('href', urlFor(wire(['tasteTags']))); expect(fixture.products()).toHaveLength(1)
  })
}
for (const data of [{ source: 'UNAVAILABLE', result: null }, { source: 'PROVIDER', result: { ...wire().result, product_count: 0 } }]) {
  test(`${data.source}/${data.result?.product_count} cannot invent a default phrase or hide current search`, async ({ page, fixture }) => {
    fixture.replies.push({ status: 200, data }); await open(page); await button(page).click(); await expect(panel(page).getByRole('heading', { name: data.source === 'UNAVAILABLE' ? '검색 문구를 준비하지 못했습니다' : '검색 문구를 가져오지 못했습니다', exact: true })).toBeVisible(); await expect(links(page)).toHaveCount(0); await expect(page).toHaveURL(initial); expect(fixture.products()).toHaveLength(1)
  })
}
for (const status of [200, 401]) {
  test(`a late${status} after optin edits cannot replace newer phrases or trigger expiry/navigation`, async ({ page, fixture }) => {
    await open(page); const gate = fixture.hold('/users/me/search-phrases', { status, data: wire(['tasteTags']) })
    await panel(page).getByRole('checkbox', { name: labels[1], exact: true }).check(); await button(page).click(); await expect.poll(() => gate.started).toBe(true)
    await expect(button(page)).toHaveAttribute('aria-disabled', 'true'); await button(page).press('Enter'); expect(fixture.phrases()).toHaveLength(1)
    await panel(page).getByRole('checkbox', { name: labels[1], exact: true }).uncheck(); await requestPhrase(page); await expect(links(page)).toHaveAttribute('href', urlFor(wire()))
    const old = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/users/me/search-phrases' && r.status() === status); gate.release(); await (await old).finished()
    await expect(links(page)).toHaveAttribute('href', urlFor(wire())); await expect(panel(page).getByRole('heading', { name: '다시 로그인해 주세요', exact: true })).toHaveCount(0); await expect(page).toHaveURL(initial)
  })
}
test('fresh session authority401 hides templates and explicit login preserves current search,not the old result', async ({ page, fixture }) => {
  await open(page); await requestPhrase(page); fixture.meReplies.push({ status: 401 }); await button(page).click(); await expect(panel(page).getByRole('heading', { name: '다시 로그인해 주세요', exact: true })).toBeVisible(); await expect(links(page)).toHaveCount(0); expect(fixture.phrases()).toHaveLength(1)
  await panel(page).getByRole('button', { name: '다시 로그인', exact: true }).click(); expect(new URL(new URL(page.url()).searchParams.get('redirect'), 'http://local').href).toBe(new URL(initial, 'http://local').href)
})
for (const id of ['member', 'other']) {
  test(`auth transition to${id} drops old opts/result and late401;new UI owns fresh POST`, async ({ page, fixture }) => {
    await open(page); const gate = fixture.hold('/users/me/search-phrases', { status: 401 }); await button(page).click(); await expect.poll(() => gate.started).toBe(true)
    await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await expect(page).toHaveURL('/'); await loginSPA(page, id); await requestPhrase(page)
    const old = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/users/me/search-phrases' && r.status() === 401); gate.release(); await (await old).finished()
    await expect(links(page)).toHaveAttribute('href', urlFor(wire())); await expect(panel(page).getByRole('heading', { name: '다시 로그인해 주세요', exact: true })).toHaveCount(0)
  })
}
test('failed logout cannot reuse a previous phrase;new request must pass a post-write current me check', async ({ page, fixture }) => {
  await open(page); await requestPhrase(page); fixture.logoutStatus = 503
  await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await expect(page.getByRole('alert')).toBeVisible(); await expect(links(page)).toHaveCount(0)
  fixture.meReplies.push({ status: 401 }); await button(page).click(); await expect(panel(page).getByRole('heading', { name: '다시 로그인해 주세요', exact: true })).toBeVisible(); expect(fixture.phrases()).toHaveLength(1)
})
test('an optin edit during fresh me prevents the superseded private POST,even when old me returns200', async ({ page, fixture }) => {
  await open(page); const gate = fixture.hold('/auth/me', { status: 200, data: users[0] })
  await panel(page).getByRole('checkbox', { name: labels[1], exact: true }).check(); await button(page).click(); await expect.poll(() => gate.started).toBe(true)
  await panel(page).getByRole('checkbox', { name: labels[1], exact: true }).uncheck(); await panel(page).getByRole('checkbox', { name: labels[2], exact: true }).check(); await requestPhrase(page)
  const old = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/auth/me'); gate.release(); await (await old).finished()
  await expect(links(page)).toHaveAttribute('href', urlFor(wire(['aromaTags']))); expect(fixture.phrases()).toHaveLength(1); expect(fixture.phrases()[0].payload.searchOptInFields).toEqual(['aromaTags'])
})
test('current privatePOST401 hides old templates and does not auto-retry a cold request', async ({ page, fixture }) => {
  await open(page); await requestPhrase(page); fixture.replies.push({ status: 401 }); await button(page).click()
  await expect(panel(page).getByRole('heading', { name: '다시 로그인해 주세요', exact: true })).toBeVisible(); await expect(links(page)).toHaveCount(0)
  await button(page).press('Enter'); expect(fixture.phrases()).toHaveLength(2)
})
test('fresh session503 is an explicit request failure,not guest/default,with0privatePOST', async ({ page, fixture }) => {
  await open(page); fixture.meReplies.push({ status: 503 }); await button(page).click()
  await expect(panel(page).getByRole('heading', { name: '검색 문구를 가져오지 못했습니다', exact: true })).toBeVisible(); await expect(links(page)).toHaveCount(0); expect(fixture.phrases()).toHaveLength(0)
  await requestPhrase(page); expect(fixture.phrases()).toHaveLength(1)
})
for (const width of [1280, 390]) {
  test(`same URL phrase apply restores every draft field;modifier preserves current tab at${width}`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 }); const url = urlFor(wire(['tasteTags'])); await open(page, url)
    await panel(page).getByRole('checkbox', { name: labels[1], exact: true }).check(); await requestPhrase(page)
    await page.getByLabel('상품 검색', { exact: true }).fill('같은 URL의 미제출 입력'); await page.getByRole('combobox', { name: '주종', exact: true }).selectOption('탁주'); await openCatalogFilters(page); await page.getByLabel('최소 가격(원)', { exact: true }).fill('9999'); await page.getByLabel('맛 태그 조건 1', { exact: true }).fill('바뀐 태그'); await page.getByRole('combobox', { name: '정렬', exact: true }).selectOption('priceDesc')
    const popupReady = context.waitForEvent('page'); await links(page).click({ modifiers: ['ControlOrMeta'] }); const popup = await popupReady
    await expect(popup).toHaveURL(url); await expect(popup.getByRole('heading', { name: '전체 주류 둘러보기', exact: true })).toBeVisible(); await expect(page.getByLabel('상품 검색', { exact: true })).toHaveValue('같은 URL의 미제출 입력'); await expect(page.getByLabel('최소 가격(원)', { exact: true })).toHaveValue('9999'); await expect(page).toHaveURL(url); await popup.close()
    await links(page).focus(); await links(page).press('Enter'); await expect(page).toHaveURL(url)
    await expect(page.getByLabel('상품 검색', { exact: true })).toHaveValue(''); await expect(page.getByRole('combobox', { name: '주종', exact: true })).toHaveValue(''); await expect(page.getByLabel('최소 가격(원)', { exact: true })).toHaveValue('0'); await expect(page.getByLabel('맛 태그 조건 1', { exact: true })).toHaveValue('dry,sweet'); await expect(page.getByRole('combobox', { name: '정렬', exact: true })).toHaveValue('name')
  })
}
