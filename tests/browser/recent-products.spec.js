import { expect, test as base } from '@playwright/test'

const KEY = 'pubburi-recent-products-v1'
const product = (id) => ({ id, name: `최근 표본 ${id}`, type: '탁주', price: id === 7 ? 0 : 7777, abv: id === 7 ? 0 : 12.5, img: null, orderCount: 0 })
const success = (data) => ({ data, message: 'ok', error: null })
const failure = (code) => ({ data: null, message: null, error: { code, message: code } })
const test = base.extend({
  recentApi: [async ({ page }, use) => {
    const state = { user: null, sessionFailures: 0, catalog: new Map(Array.from({ length: 25 }, (_, i) => [i + 1, product(i + 1)])), productErrors: new Map(), calls: [], unexpected: [], errors: [] }
    page.on('pageerror', (error) => state.errors.push(error.message))
    await page.route('**/api/**', async (route) => {
      if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/users/me/cart') return route.fulfill({ status: 404, json: { data: null, error: { code: 'CART_NOT_SUPPORTED' } } })
      const r = route.request(), url = new URL(r.url()), path = url.pathname
      state.calls.push({ method: r.method(), path })
      if (r.method() === 'POST' && path === '/api/auth/login') { state.user = { id: r.postDataJSON().id, name: r.postDataJSON().id, role: 'USER' }; return route.fulfill({ json: success(state.user) }) }
      if (r.method() === 'POST' && path === '/api/auth/logout') { state.user = null; return route.fulfill({ json: success(true) }) }
      if (r.method() === 'GET' && path === '/api/auth/me') {
        if (state.sessionFailures) { state.sessionFailures--; return route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') }) }
        return route.fulfill({ status: state.user ? 200 : 401, json: state.user ? success(state.user) : failure('UNAUTHORIZED') })
      }
      if (r.method() === 'GET' && path === '/api/products/popular') return route.fulfill({ json: success([...state.catalog.values()].slice(0, 4)) })
      if (r.method() === 'GET' && path === '/api/markets') return route.fulfill({ json: success({ items: [], page: 1, size: 12, total: 0, totalPages: 0, hasNext: false }) })
      if (r.method() === 'GET' && path === '/api/products') {
        const items = [...state.catalog.values()].filter((p) => !url.searchParams.get('q') || p.name === url.searchParams.get('q')).slice(0, 12)
        return route.fulfill({ json: success({ items, page: 1, size: 12, total: items.length, totalPages: 1, hasNext: false }) })
      }
      const match = path.match(/^\/api\/products\/(\d+)(\/features|\/comments|\/similar)?$/)
      if (r.method() === 'GET' && match) {
        const id = Number(match[1])
        if (match[2] === '/features') return route.fulfill({ json: success({ productId: id, volumeMl: null, description: null, tasteTags: null, aromaTags: null, sourceName: null, sourceUrl: null, sourceNote: null }) })
        if (match[2] === '/comments') return route.fulfill({ json: success({ items: [], page: 1, size: 10, total: 0, totalPages: 0, hasNext: false }) })
        if (match[2] === '/similar') return route.fulfill({ json: success({ items: [] }) })
        const status = state.productErrors.get(id)
        if (status) return route.fulfill({ status, json: failure(status === 403 ? 'FORBIDDEN' : 'SERVICE_UNAVAILABLE') })
        return state.catalog.has(id) ? route.fulfill({ json: success(state.catalog.get(id)) }) : route.fulfill({ status: 404, json: failure('NOT_FOUND') })
      }
      const favorite = path.match(/^\/api\/users\/me\/favorites\/(\d+)$/)
      if (r.method() === 'GET' && favorite) return route.fulfill({ json: success({ productId: Number(favorite[1]), favorited: false }) })
      state.unexpected.push(`${r.method()} ${path}`); return route.fulfill({ status: 501, json: failure('UNEXPECTED_TEST_REQUEST') })
    })
    await use(state)
    expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([])
    expect(state.calls.filter((r) => r.method !== 'GET' && !['/api/auth/login', '/api/auth/logout'].includes(r.path))).toEqual([])
  }, { auto: true }],
})
async function seed(page, ids, extra = {}) {
  await page.addInitScript(({ key, ids, extra }) => localStorage.setItem(key, JSON.stringify({ version: 1, entries: ids.map((id, i) => ({ id, viewedAt: Date.now() - i * 1000, ...extra })) })), { key: KEY, ids, extra })
}
const ids = (page) => page.locator('.recent-item').evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute('aria-label').split(' ').at(-1))))
const itemReads = (state) => state.calls.filter((call) => /^\/api\/products\/\d+$/.test(call.path))
async function navigate(page, name) {
  const link = page.getByRole('link', { name, exact: true })
  if (!await link.isVisible()) await page.getByRole('button', { name: '메뉴 열기', exact: true }).click()
  await link.click()
}
async function visit(page, id) {
  await navigate(page, '전체 주류')
  await page.getByLabel('상품 검색', { exact: true }).fill(`최근 표본 ${id}`); await page.getByLabel('상품 검색', { exact: true }).press('Enter')
  await expect(page).toHaveURL((url) => url.searchParams.get('q') === `최근 표본 ${id}`)
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/products/${id}`)
  await page.locator('.product-card').filter({ has: page.locator(`a.product-image[href="/products/${id}"]`) }).getByRole('link', { name: '상세 보기', exact: true }).click()
  await (await response).finished()
  await expect(page.getByRole('heading', { name: `최근 표본 ${id}`, exact: true })).toBeVisible()
}
async function login(page, id) {
  await page.goto('/account?redirect=/recent')
  await page.getByLabel('아이디', { exact: true }).fill(id); await page.getByLabel('비밀번호', { exact: true }).fill('test-password')
  await page.locator('form.auth-form').getByRole('button', { name: '로그인', exact: true }).click()
  await expect(page.getByRole('heading', { name: '최근 본 상품이 없습니다', exact: true })).toBeVisible()
}
async function logout(page) {
  const response = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/logout' && response.request().method() === 'POST')
  await page.getByRole('button', { name: '로그아웃', exact: true }).click()
  expect((await response).status()).toBe(200)
  await expect(page).toHaveURL('/')
  await expect(page.locator('.user-name')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '취향과 순간에 어울리는 한 잔', exact: true })).toBeVisible()
}

test('유효한 상세만 최근 순서로 기록하고 재방문은 맨 앞으로 이동·비회원 새로고침은 시각 그대로 복원', async ({ page }) => {
  await page.goto('/products/7'); await expect(page.getByRole('heading', { name: '최근 표본 7', exact: true })).toBeVisible()
  await visit(page, 8); await visit(page, 7)
  await navigate(page, '최근 본 상품')
  await expect(page.locator('.recent-item')).toHaveCount(2)
  expect(await ids(page)).toEqual([7, 8])
  await expect(page.locator('.recent-item').first()).toContainText('0원')
  const raw = await page.evaluate((key) => localStorage.getItem(key), KEY)
  expect(JSON.parse(raw).entries.every((entry) => Object.keys(entry).sort().join(',') === 'id,viewedAt')).toBe(true)
  await page.reload(); await expect(page.locator('.recent-item')).toHaveCount(2)
  expect(await ids(page)).toEqual([7, 8]); expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(raw)
})

test('스무 개 보관과 현재 값 재조회는 과거 상품 스냅샷·태그를 저장하지 않음', async ({ page, recentApi }) => {
  await seed(page, Array.from({ length: 20 }, (_, i) => 20 - i))
  await page.goto('/products/21'); await expect(page.getByRole('heading', { name: '최근 표본 21', exact: true })).toBeVisible()
  recentApi.catalog.set(20, { ...product(20), name: '현재 이름', price: 9191 })
  await navigate(page, '최근 본 상품'); await expect(page.locator('.recent-item')).toHaveCount(20)
  expect(await ids(page)).toEqual([21, ...Array.from({ length: 19 }, (_, i) => 20 - i)])
  await expect(page.getByRole('heading', { name: '현재 이름', exact: true })).toBeVisible()
  await expect(page.locator('[aria-label="최근 상품 20"]')).toContainText('9,191원')
})

test('390px 키보드 삭제/전체 삭제는 초점을 보존하고 비교 선택·원문 장바구니·필터 주소를 바꾸지 않음', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/products/7')
  await page.getByRole('button', { name: '최근 표본 7 비교 선택', exact: true }).click()
  await page.getByRole('button', { name: '수량 늘리기', exact: true }).click(); await page.getByRole('button', { name: '2개 장바구니에 담기', exact: true }).click()
  const cart = await page.evaluate(() => localStorage.getItem('pubburi-cart'))
  await navigate(page, '최근 본 상품'); await expect(page.locator('.recent-item')).toHaveCount(1)
  await test.info().attach('recent-390', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
  const remove = page.getByRole('button', { name: '상품 7 최근 기록 삭제', exact: true }); await remove.focus(); await remove.press('Enter')
  await expect(page.getByRole('heading', { name: '최근 본 상품', exact: true })).toBeFocused()
  await expect(page.getByRole('heading', { name: '최근 본 상품이 없습니다', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  expect(await page.evaluate(() => localStorage.getItem('pubburi-cart'))).toBe(cart)
  await visit(page, 8); await navigate(page, '최근 본 상품')
  const clear = page.getByRole('button', { name: '최근 기록 전체 삭제', exact: true }); await clear.focus(); await clear.press('Enter')
  await expect(page.getByRole('heading', { name: '최근 본 상품', exact: true })).toBeFocused()
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull()
  await page.getByRole('button', { name: '메뉴 열기', exact: true }).click()
  await expect(page.getByRole('link', { name: '상품 비교 1', exact: true })).toHaveAttribute('href', '/compare?productId=7')
})

test('최초 인증 보류·503을 비회원으로 간주하지 않고 디스크/상품 조회를 차단', async ({ page, recentApi }) => {
  await seed(page, [7]); recentApi.sessionFailures = 1
  await page.addInitScript((key) => { window.__recentDiskReads = 0; const read = Storage.prototype.getItem; Storage.prototype.getItem = function (name) { if (name === key) window.__recentDiskReads++; return read.call(this, name) } }, KEY)
  let release; const gate = new Promise((resolve) => { release = resolve }); let started = false; let count = 0
  await page.route('**/api/auth/me', async (route) => { if (++count === 1) { started = true; await gate }; await route.fallback() })
  try {
    await page.goto('/recent'); await expect.poll(() => started).toBe(true)
    await expect(page.getByText('로그인 상태를 확인하는 동안 최근 기록을 표시하지 않습니다.', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => window.__recentDiskReads)).toBe(0); expect(itemReads(recentApi)).toEqual([])
    release(); await expect(page.getByRole('heading', { name: '로그인 상태를 확인하지 못했습니다', exact: true })).toBeVisible()
    expect(await page.evaluate(() => window.__recentDiskReads)).toBe(0); expect(itemReads(recentApi)).toEqual([])
    await page.getByRole('button', { name: '로그인 상태 다시 확인', exact: true }).click()
    await expect(page.locator('.recent-item')).toHaveCount(1)
  } finally { release() }
})

for (const raw of ['{broken', JSON.stringify({ version: 1, entries: [{ id: 7, viewedAt: 1, product: { tasteTags: ['old invented'] } }] })]) {
  test(`손상/스냅샷 저장 형식은 복원·상품 조회 없이 폐기 ${raw.slice(0, 20)}`, async ({ page, recentApi }) => {
    await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key: KEY, raw })
    await page.goto('/recent'); await expect(page.getByRole('heading', { name: '최근 본 상품이 없습니다', exact: true })).toBeVisible()
    await expect(page.getByText('저장된 기록 형식을 확인하지 못해 복원하지 않았습니다. 새로 본 상품부터 기록합니다.', { exact: true })).toBeVisible()
    expect(itemReads(recentApi)).toEqual([])
  })
}

test('30일 만료/미래 시각은 상품을 조회하지 않고 빈 기록으로 정리', async ({ page, recentApi }) => {
  await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ version: 1, entries: [{ id: 7, viewedAt: Date.now() - 31 * 86400000 }, { id: 8, viewedAt: Date.now() + 86400000 }] })), KEY)
  await page.goto('/recent'); await expect(page.getByRole('heading', { name: '최근 본 상품이 없습니다', exact: true })).toBeVisible()
  expect(itemReads(recentApi)).toEqual([])
})

test('localStorage 접근 거부도 메모리 기록/삭제를 막지 않고 새로고침 한계를 안내', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked getter') } }))
  await page.goto('/products/7'); await navigate(page, '최근 본 상품'); await expect(page.locator('.recent-item')).toHaveCount(1)
  await expect(page.getByText('이 브라우저에 기록 변경을 저장하지 못했습니다.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '최근 기록 전체 삭제', exact: true }).click()
  await expect(page.getByRole('heading', { name: '최근 본 상품이 없습니다', exact: true })).toBeVisible()
  await page.reload(); await expect(page.getByRole('heading', { name: '최근 본 상품이 없습니다', exact: true })).toBeVisible()
})

test('회원 기록은 디스크0·새로고침/로그아웃/다른계정/같은계정 재로그인에서 복원되지 않음', async ({ page }) => {
  await login(page, 'member'); await visit(page, 7); await navigate(page, '최근 본 상품')
  await expect(page.locator('.recent-item')).toHaveCount(1); expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull()
  await page.reload(); await expect(page.getByRole('heading', { name: '최근 본 상품이 없습니다', exact: true })).toBeVisible()
  await visit(page, 7); await navigate(page, '최근 본 상품'); await expect(page.locator('.recent-item')).toHaveCount(1)
  await logout(page); await navigate(page, '최근 본 상품')
  await expect(page.getByRole('heading', { name: '최근 본 상품이 없습니다', exact: true })).toBeVisible()
  await login(page, 'other'); await visit(page, 8); await navigate(page, '최근 본 상품'); await expect(page.locator('.recent-item')).toHaveCount(1); expect(await ids(page)).toEqual([8])
  await logout(page); await login(page, 'member')
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull()
})

test('guest 삭제 저장 거부에도 같은SPA의 로그인/로그아웃은 익명 디스크를 다시 합치지 않음', async ({ page }) => {
  await page.addInitScript((key) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, entries: [{ id: 7, viewedAt: Date.now() }] })); const remove = Storage.prototype.removeItem; const write = Storage.prototype.setItem; Storage.prototype.removeItem = function (name) { if (name === key) throw new Error('denied clear'); return remove.call(this, name) }; Storage.prototype.setItem = function (name, value) { if (name === key) throw new Error('denied write'); return write.call(this, name, value) } }, KEY)
  await page.goto('/account?redirect=/recent')
  await page.getByLabel('아이디', { exact: true }).fill('member'); await page.getByLabel('비밀번호', { exact: true }).fill('pass')
  await page.locator('form.auth-form').getByRole('button', { name: '로그인', exact: true }).click()
  await expect(page.getByRole('heading', { name: '최근 본 상품이 없습니다', exact: true })).toBeVisible()
  await visit(page, 8); await navigate(page, '최근 본 상품'); await expect(page.locator('.recent-item')).toHaveCount(1); expect(await ids(page)).toEqual([8])
  await logout(page); await navigate(page, '최근 본 상품')
  await expect(page.getByRole('heading', { name: '최근 본 상품이 없습니다', exact: true })).toBeVisible()
  expect(JSON.parse(await page.evaluate((key) => localStorage.getItem(key), KEY)).entries.map((entry) => entry.id)).toEqual([7])
  await page.reload(); await expect(page.locator('.recent-item')).toHaveCount(1); expect(await ids(page)).toEqual([7])
  await expect(page.getByText('새로고침하면 이전 비회원 기록이 다시 나타나거나 최근 기록이 사라질 수 있습니다.', { exact: false })).toBeVisible()
})

test('이탈한 상세의 늦은 성공과 로그인 전환 중 연 상세는 새 계정 기록으로 재귀속하지 않음', async ({ page }) => {
  let release; const gate = new Promise((resolve) => { release = resolve }); let started = false
  await page.route('**/api/products/7', async (route) => { started = true; await gate; await route.fallback() })
  try {
    await page.goto('/products/7'); await expect.poll(() => started).toBe(true)
    await navigate(page, '최근 본 상품'); await expect(page.getByRole('heading', { name: '최근 본 상품이 없습니다', exact: true })).toBeVisible()
    release(); await expect(page.locator('.recent-item')).toHaveCount(0)
    await login(page, 'member'); await expect(page.locator('.recent-item')).toHaveCount(0)
  } finally { release() }
})

test('인증쓰기 보류 중 새 상세를 열어도 늦은 로그인 성공이 그 탐색을 회원 기록에 넣지 않음', async ({ page }) => {
  let release; const gate = new Promise((resolve) => { release = resolve }); let started = false
  await page.route('**/api/auth/login', async (route) => { started = true; await gate; await route.fallback() })
  try {
    await page.goto('/account?redirect=/recent'); await page.getByLabel('아이디', { exact: true }).fill('member'); await page.getByLabel('비밀번호', { exact: true }).fill('pass')
    await page.locator('form.auth-form').getByRole('button', { name: '로그인', exact: true }).click(); await expect.poll(() => started).toBe(true)
    await visit(page, 8); release()
    await expect(page.locator('.user-name')).toHaveText('member님')
    await navigate(page, '최근 본 상품'); await expect(page.getByRole('heading', { name: '최근 본 상품이 없습니다', exact: true })).toBeVisible()
  } finally { release() }
})

test('이미 표시한 계정도 최근경로 재진입의 현재401/503 확인 전에는 과거 기록을 노출하지 않음', async ({ page, recentApi }) => {
  await login(page, 'member'); await visit(page, 7); recentApi.sessionFailures = 1
  await navigate(page, '최근 본 상품'); await expect(page.getByRole('heading', { name: '로그인 상태를 확인하지 못했습니다', exact: true })).toBeVisible()
  await expect(page.locator('.recent-item')).toHaveCount(0)
  recentApi.user = null; await page.getByRole('button', { name: '로그인 상태 다시 확인', exact: true }).click()
  await expect(page.getByRole('heading', { name: '최근 본 상품이 없습니다', exact: true })).toBeVisible()
})

for (const status of [403, 503]) {
  test(`상품${status}·삭제404는 다른 기록과 분리하고 명시 재시도는 현재 응답만 표시`, async ({ page, recentApi }) => {
    await seed(page, [7, 8, 99]); recentApi.productErrors.set(7, status)
    await page.goto('/recent'); await expect(page.locator('[aria-label="최근 상품 99"]')).toContainText('상품을 찾을 수 없습니다')
    await expect(page.locator('[aria-label="최근 상품 7"]')).toContainText('상품을 불러오지 못했습니다')
    await expect(page.getByRole('heading', { name: '최근 표본 8', exact: true })).toBeVisible()
    recentApi.productErrors.delete(7); recentApi.catalog.set(7, { ...product(7), price: 9191 })
    await page.locator('[aria-label="최근 상품 7"]').getByRole('button', { name: '상품 다시 불러오기', exact: true }).click()
    await expect(page.locator('[aria-label="최근 상품 7"]')).toContainText('9,191원')
  })
}

test('삭제한 기록의 늦은 상품 성공은 기록을 부활시키거나 사용자의 다음 포커스를 옮기지 않음', async ({ page }) => {
  await seed(page, [7, 8]); let release; const gate = new Promise((resolve) => { release = resolve }); let started = false
  await page.route('**/api/products/7', async (route) => { started = true; await gate; await route.fallback() })
  try {
    await page.goto('/recent'); await expect.poll(() => started).toBe(true)
    await page.getByRole('button', { name: '상품 7 최근 기록 삭제', exact: true }).click()
    const link = page.getByRole('link', { name: '전체 주류 보기', exact: true }); await link.focus(); release()
    await expect(page.locator('.recent-item')).toHaveCount(1); expect(await ids(page)).toEqual([8]); await expect(link).toBeFocused()
  } finally { release() }
})

test('cached 재진입의 offline/조회 실패는 이전 상품명·가격을 현재 성공으로 표시하지 않음', async ({ page, recentApi }) => {
  await seed(page, [7]); await page.goto('/recent'); await expect(page.getByRole('heading', { name: '최근 표본 7', exact: true })).toBeVisible()
  await navigate(page, '전체 주류'); await page.context().setOffline(true)
  try { await navigate(page, '최근 본 상품'); await expect(page.locator('.recent-item')).toHaveCount(0); recentApi.productErrors.set(7, 503) }
  finally { await page.context().setOffline(false) }
  await expect(page.locator('[aria-label="최근 상품 7"]')).toContainText('상품을 불러오지 못했습니다')
  await expect(page.getByRole('heading', { name: '최근 표본 7', exact: true })).toHaveCount(0)
})

test('auth bootstrap보다 먼저 끝난 상세도 이탈한 뒤 새 owner 기록으로 뒤늦게 넣지 않음', async ({ page }) => {
  let release; const gate = new Promise((resolve) => { release = resolve }); let count = 0
  await page.route('**/api/auth/me', async (route) => { if (++count === 1) await gate; await route.fallback() })
  try {
    await page.goto('/products/7'); await expect(page.getByRole('heading', { name: '최근 표본 7', exact: true })).toBeVisible()
    await navigate(page, '최근 본 상품'); release()
    await expect(page.getByRole('heading', { name: '최근 본 상품이 없습니다', exact: true })).toBeVisible()
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull()
  } finally { release() }
})

test('다른 ID의 상품 응답은 현재 기록의 이름/가격으로 사용하지 않음', async ({ page, recentApi }) => {
  await seed(page, [7, 8]); recentApi.catalog.set(7, product(25))
  await page.goto('/recent'); await expect(page.locator('[aria-label="최근 상품 7"]')).toContainText('상품을 불러오지 못했습니다')
  await expect(page.getByRole('heading', { name: '최근 표본 25', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '최근 표본 8', exact: true })).toBeVisible()
})

for (const kind of ['same-link', 'back-from-catalog']) {
  test(`같은 최근 경로의 새 key ${kind}도 현재세션 확인 전 이전 계정 기록을 숨김`, async ({ page, recentApi }) => {
    await login(page, 'member'); await visit(page, 7); await navigate(page, '최근 본 상품')
    await expect(page.locator('.recent-item')).toHaveCount(1)
    if (kind === 'back-from-catalog') {
      await navigate(page, '전체 주류'); await expect(page).toHaveURL('/products')
      await expect(page.getByRole('heading', { name: '전체 주류 둘러보기', exact: true })).toBeVisible()
    }
    const checks = recentApi.calls.filter((r) => r.path === '/api/auth/me').length
    recentApi.user = null
    if (kind === 'same-link') await navigate(page, '최근 본 상품')
    else await page.goBack()
    await expect(page.getByRole('heading', { name: '최근 본 상품이 없습니다', exact: true })).toBeVisible()
    await expect(page.locator('.recent-item')).toHaveCount(0)
    expect(recentApi.calls.filter((r) => r.path === '/api/auth/me').length).toBeGreaterThan(checks)
  })
}

test('불확실 logout503 뒤에는 실제 현재세션 확인 전 과거 기록이 다시 나타나지 않음', async ({ page, recentApi }) => {
  await login(page, 'member'); await visit(page, 7); await navigate(page, '최근 본 상품'); await expect(page.locator('.recent-item')).toHaveCount(1)
  let block = false, release; const gate = new Promise((resolve) => { release = resolve }); let checking = false
  await page.route('**/api/auth/logout', async (route) => { block = true; recentApi.user = null; await route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') }) })
  await page.route('**/api/auth/me', async (route) => { if (block) { checking = true; await gate }; await route.fallback() })
  try {
    await page.getByRole('button', { name: '로그아웃', exact: true }).click()
    await expect(page.locator('.recent-item')).toHaveCount(0)
    await expect.poll(() => checking).toBe(true)
    release(); await expect(page.getByRole('heading', { name: '최근 본 상품이 없습니다', exact: true })).toBeVisible()
  } finally { release() }
})

test('불확실 login503 뒤 새 상세를 이전 guest 소유로 디스크에 기록하지 않음', async ({ page, recentApi }) => {
  await seed(page, [7])
  await page.route('**/api/auth/login', async (route) => { recentApi.user = { id: 'member', name: 'member', role: 'USER' }; await route.fulfill({ status: 503, json: failure('SERVICE_UNAVAILABLE') }) })
  await page.goto('/account?redirect=/recent'); await page.getByLabel('아이디', { exact: true }).fill('member'); await page.getByLabel('비밀번호', { exact: true }).fill('pass')
  await page.locator('form.auth-form').getByRole('button', { name: '로그인', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('서버에 문제가 발생했습니다.')
  await visit(page, 8)
  expect(JSON.parse(await page.evaluate((key) => localStorage.getItem(key), KEY)).entries.map((entry) => entry.id)).toEqual([7])
  await navigate(page, '최근 본 상품'); await expect(page.getByRole('heading', { name: '최근 본 상품이 없습니다', exact: true })).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull()
})

test('기존계정 재확인 중 연 상세는 늦게 확인된 다른 계정의 열람으로 옮기지 않음', async ({ page, recentApi }) => {
  await login(page, 'member'); await visit(page, 7); await navigate(page, '최근 본 상품'); await expect(page.locator('.recent-item')).toHaveCount(1)
  let release; const gate = new Promise((resolve) => { release = resolve }); let started = false; let hold = true
  await page.route('**/api/auth/me', async (route) => { if (hold) { started = true; await gate }; await route.fallback() })
  try {
    await navigate(page, '최근 본 상품'); await expect.poll(() => started).toBe(true)
    await visit(page, 8)
    recentApi.user = { id: 'other', name: 'other', role: 'USER' }; hold = false; release()
    await expect(page.locator('.user-name')).toHaveText('other님')
    await navigate(page, '최근 본 상품')
    await expect(page.getByRole('heading', { name: '최근 본 상품이 없습니다', exact: true })).toBeVisible()
  } finally { hold = false; release() }
})
