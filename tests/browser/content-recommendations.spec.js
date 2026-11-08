import { test as base, expect } from '@playwright/test'

// Authored provider-shaped display facts, not real model or product evidence.
const users = [{ id: 'member', name: '회원A', role: 'USER' }, { id: 'other', name: '회원B', role: 'USER' }]
const product = { id: 7, name: '직접 작성한 검수 DEMO', type: '맥주', price: 0, abv: 0, img: null, orderCount: 0 }
const localProduct = { ...product, name: '직접 작성한 로컬 검수 상품' }
const ok = (data) => ({ data, message: 'ok', error: null })
const bad = (status) => ({ data: null, error: { code: status === 401 ? 'UNAUTHORIZED' : 'REQUEST_FAILED' } })
const pageOf = (items) => ({ items, page: 1, size: 12, total: items.length, totalPages: items.length ? 1 : 0, hasNext: false })
function wire(scope = 'REVIEWED_DEMO') {
  const facts = { version: 'r04-facts-v1', basis: 'content_similarity', comparison: { kind: 'profile' }, score_evidence: [
    { kind: 'taste_match', label: '맛 태그 일치', actual_value: 'dry,sweet\natom:<b>', target_value: 'dry,sweet\natom:<b>', contribution: 0.2 },
    { kind: 'abv_comparison', label: '도수 비교 근거', actual_value: 0, target_value: 0, unit: 'vol%', contribution: 0.3 },
  ], total_positive_contributions: 2, score_evidence_truncated: false, filter_evidence: [
    { kind: 'availability_filter', label: '입력 가용 조건 충족', actual_value: true },
    { kind: 'price_filter', label: '입력 가격 조건 충족', actual_value: 0, minimum: 0, maximum: null, unit: 'KRW' },
    { kind: 'abv_filter', label: '입력 도수 조건 충족', actual_value: 0, minimum: 0, maximum: 10, unit: 'vol%' },
  ], fallback_reason: null }
  if (scope === 'REVIEWED_FAMILY_BROWSE_DEMO') Object.assign(facts.score_evidence[0], { kind: 'category_match', label: '주종 일치', actual_value: '맥주', target_value: '맥주' })
  return { source: 'PROVIDER', catalogScope: scope, products: [product], result: { algorithm: 'b1-tfidf-minmax-v1', fit_scope: 'request_catalog', representation_fitted: true, model_fingerprint: 'a'.repeat(64), eligible_count: 1, supported_profile_tokens: 1, unknown_profile_tokens: 0, active_numeric_preferences: ['abv_percent'], fallback_reason: null, items: [{ product_id: 7, score: 0.5, reasons: ['available', 'price_within_range', 'abv_within_range', 'content_similarity'], contributions: [{ component: 'text', feature: scope === 'REVIEWED_FAMILY_BROWSE_DEMO' ? 'category:맥주' : 'taste:dry,sweet\natom:<b>', contribution: 0.2 }, { component: 'abv_percent', feature: 'abv_percent', contribution: 0.3 }], explanation: facts }] } }
}
function activityWire() {
  return { ...wire('REVIEWED_FAMILY_BROWSE_DEMO'), activityEvidence: { favoriteCategories: ['맥주'], highlyRatedCategories: ['맥주'] } }
}
const referenceName = '직접 표시한 <b>기준 상품'
function feedbackWire() {
  const value = activityWire(), reference = wire().result.items[0]
  value.catalogScope = 'REVIEWED_DEMO'
  value.products.push({ ...product, id: 8, name: '기준과 비슷한 검수 DEMO', type: '탁주' })
  reference.product_id = 8
  reference.explanation.comparison = { kind: 'reference_product', product_id: 13 }
  reference.explanation.score_evidence[1] = { kind: 'volume_comparison', label: '용량 비교 근거', actual_value: 330, target_value: 375, unit: 'mL', contribution: 0.3 }
  value.result.items.push(reference)
  value.result.eligible_count = 5
  value.feedbackEvidence = { rankingMode: 'positive_feedback', excludedNotInterestedCount: 2, positiveReferences: [{ productId: 13, name: referenceName }] }
  return value
}
function localWire() {
  const value = wire('REVIEWED_LOCAL_CATALOG'), item = value.result.items[0]
  value.products[0] = localProduct; item.score = 0.6984126984126984
  Object.assign(item.contributions[0], { feature: 'category:맥주', contribution: item.score - 0.3 })
  Object.assign(item.explanation.score_evidence[0], { kind: 'category_match', label: '주종 일치', actual_value: '맥주', target_value: '맥주', contribution: item.score - 0.3 })
  return value
}
const panel = (page) => page.getByRole('region', { name: '내 취향 추천', exact: true })
const button = (page) => panel(page).getByRole('button', { name: '취향 추천 보기', exact: true })
const cards = (page) => panel(page).locator('[data-content-product]')
const test = base.extend({
  fixture: [async ({ page, context }, use) => {
    const s = { user: users[0], replies: [], meReplies: [], calls: [], errors: [], unexpected: [], gates: [], logoutStatus: 200, products: [localProduct, { ...product, id: 8, name: '직접 작성한 로컬 검수 후보' }], feedback: {}, feedbackCalls: [] }
    s.posts = () => s.calls.filter((c) => c.path === '/users/me/recommendations/content')
    s.hold = (path, reply) => { let release; const wait = new Promise((r) => { release = r }); const gate = { path, reply, wait, release, started: false }; s.gates.push(gate); return gate }
    page.on('pageerror', (error) => s.errors.push(error.message))
    await context.route('**/api/**', async (route) => {
      if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/users/me/notifications') return route.fulfill({ status: 404, json: { data: null, error: { code: 'NOTIFICATIONS_NOT_SUPPORTED' } } })
      if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/users/me/cart') return route.fulfill({ status: 404, json: { data: null, error: { code: 'CART_NOT_SUPPORTED' } } })
      const r = route.request(), url = new URL(r.url()), path = url.pathname.slice(4), method = r.method()
      const body = r.postData() ? r.postDataJSON() : null
      s.calls.push({ path, method, query: [...url.searchParams], ...(path === '/users/me/recommendations/content' ? { body, owner: r.headers()['x-pubburi-feedback-owner'] } : {}) })
      let reply
      if (path === '/auth/me' && method === 'GET') reply = s.meReplies.shift() ?? { status: s.user ? 200 : 401, data: s.user }
      else if (path === '/auth/login' && method === 'POST') { s.user = users.find((u) => u.id === body.id); reply = { status: 200, data: s.user } }
      else if (path === '/auth/logout' && method === 'POST') { if (s.logoutStatus === 200) s.user = null; reply = { status: s.logoutStatus, data: true } }
      else if (path === '/users/me/recommendations/content' && method === 'POST') {
        reply = s.user && r.headers()['x-pubburi-feedback-owner'] === encodeURIComponent(s.user.id)
          ? s.replies.shift() ?? { status: 200, data: wire() } : { status: 401 }
      }
      else if (/^\/users\/me\/recommendations\/feedback\/[78]$/.test(path) && ['GET', 'PUT', 'DELETE'].includes(method)) {
        const productId = Number(path.split('/').at(-1)), owner = r.headers()['x-pubburi-feedback-owner']; s.feedbackCalls.push({ method, owner, productId, body })
        if (!s.user || owner !== encodeURIComponent(s.user.id)) reply = { status: 401 }
        else { const choices = s.feedback[s.user.id] ??= {}; if (method === 'PUT') choices[productId] = body.feedback; if (method === 'DELETE') delete choices[productId]; reply = { status: 200, data: { productId, feedback: choices[productId] ?? null } } }
      }
      else if (method === 'GET' && /^\/products\/[78]$/.test(path)) reply = { status: 200, data: s.products.find((p) => p.id === Number(path.split('/').at(-1))) }
      else if (method === 'GET' && /^\/products\/[78]\/features$/.test(path)) reply = { status: 200, data: { productId: Number(path.split('/').at(-2)), volumeMl: null, description: null, tasteTags: null, aromaTags: null, sourceName: null, sourceUrl: null, sourceNote: null } }
      else if (method === 'GET' && /^\/products\/[78]\/comments$/.test(path)) reply = { status: 200, data: { ...pageOf([]), size: 10, ratingSummary: { count: 0, average: null } } }
      else if (method === 'GET' && /^\/products\/[78]\/similar$/.test(path)) reply = { status: 200, data: { items: [] } }
      else if (method === 'GET' && /^\/users\/me\/favorites\/[78]$/.test(path)) reply = { status: 200, data: { productId: Number(path.split('/').at(-1)), favorited: false } }
      else if (path === '/products/popular') reply = { status: 200, data: [] }
      else if (path === '/products/suggestions' && method === 'GET') reply = { status: 200, data: { items: [] } }
      else if (path === '/markets' || /\/orders$/.test(path)) reply = { status: 200, data: pageOf([]) }
      else if (/\/profile$/.test(path)) reply = { status: 200, data: { user: s.user, grade: { title: '씨앗' } } }
      else if (path === '/products') reply = { status: 200, data: pageOf([product]) }
      else if (path === '/recommendations/default') reply = { status: 200, data: { items: [product], source: 'BASELINE' } }
      const gate = s.gates.find((g) => g.path === path && !g.started)
      if (gate) { gate.started = true; reply = structuredClone(gate.reply); await gate.wait }
      if (reply) return route.fulfill({ status: reply.status, json: reply.status === 200 ? ok(reply.data) : bad(reply.status) })
      s.unexpected.push({ path, method }); return route.fulfill({ status: 501, json: bad(501) })
    })
    try { await use(s) } finally { s.gates.forEach((g) => g.release()); expect(s.errors).toEqual([]); expect(s.unexpected).toEqual([]); expect(s.calls.filter((c) => c.method !== 'GET' && !['/auth/login', '/auth/logout', '/users/me/recommendations/content'].includes(c.path) && !/^\/users\/me\/recommendations\/feedback\/[78]$/.test(c.path))).toEqual([]) }
  }, { auto: true }],
})
async function open(page) { await page.goto('/'); await expect(panel(page)).toHaveCount(1); await expect(button(page)).toBeVisible() }
async function load(page) { await button(page).click(); await expect(cards(page)).toHaveCount(1) }
async function home(page) { await page.locator('.brand').click(); await expect(button(page)).toBeVisible() }
async function login(page, id) {
  await panel(page).getByRole('link', { name: '로그인하고 취향 추천 보기', exact: true }).click()
  await page.getByLabel('아이디', { exact: true }).fill(id); await page.getByLabel('비밀번호', { exact: true }).fill('fixture')
  await page.locator('form.auth-form').getByRole('button', { name: '로그인', exact: true }).click(); await expect(page).toHaveURL('/'); await expect(button(page)).toBeVisible()
}

for (const width of [1280, 390]) {
  test(`명시 요청과 실제 typed 사실만 표시하고 카트/비교를 유지 ${width}px`, async ({ page, fixture }, info) => {
    await page.setViewportSize({ width, height: 900 }); await page.addInitScript((product) => { localStorage.setItem('pubburi-cart', JSON.stringify([{ product, quantity: 2 }])) }, product)
    await open(page); expect(fixture.posts()).toHaveLength(0)
    await page.locator('.hero-cta').click(); await page.getByRole('button', { name: `${product.name} 비교 선택`, exact: true }).click(); await home(page)
    const compare = page.getByRole('link', { name: '상품 비교 1', exact: true, includeHidden: true }); await expect(compare).toHaveAttribute('href', '/compare?productId=7')
    await page.getByLabel('상품 검색', { exact: true }).fill('미제출 검색')
    await button(page).focus(); await button(page).press('Enter'); await expect(cards(page)).toHaveCount(1)
    expect(fixture.posts()).toHaveLength(1); expect(fixture.posts()[0]).toMatchObject({ method: 'POST', query: [], owner: 'member' }); expect(fixture.posts()[0].body).toEqual({ limit: 4, includeActivity: true }); await expect(button(page)).toBeFocused(); await page.keyboard.press('Tab'); const policy = panel(page).getByText('상품 정보·추천 안내', { exact: true }); await expect(policy).toBeFocused(); await page.keyboard.press('Enter'); await expect(panel(page).getByText(/검수용 표본 정보이며/)).toBeVisible(); await page.keyboard.press('Tab'); await expect(panel(page).getByRole('link', { name: '저장한 취향 설정', exact: true })).toBeFocused()
    await expect(page).toHaveURL('/'); await expect(page.getByLabel('상품 검색', { exact: true })).toHaveValue('미제출 검색')
    await expect(cards(page)).toContainText('DEMO 표시 가격 0원'); await expect(cards(page)).toContainText('도수 0%'); await expect(cards(page)).toContainText('비교 점수 0.5 (0–1)'); await expect(cards(page)).toContainText('dry,sweet\natom:<b>')
    await expect(cards(page).locator('b')).toHaveCount(0); await expect(cards(page).locator('a, button')).toHaveCount(0); await expect(cards(page)).not.toContainText('찜한 검수 상품의 주종')
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pubburi-cart'))[0].quantity)).toBe(2); await expect(compare).toHaveAttribute('href', '/compare?productId=7')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.getByRole('button', { name: '알림 닫기', exact: true }).click(); await panel(page).evaluate((element) => window.scrollBy(0, element.getBoundingClientRect().top - 96))
    const screenshot = info.outputPath(`content-${width}.png`); await page.screenshot({ path: screenshot }); await info.attach(`content-${width}.png`, { path: screenshot, contentType: 'image/png' })
    await page.reload(); await expect(button(page)).toBeVisible(); await expect(cards(page)).toHaveCount(0); expect(fixture.posts()).toHaveLength(1)
  })
  test(`활동 주종과 저장 도수를 구분하는 열람전용 상품군 ${width}px`, async ({ page, fixture }) => {
    await page.setViewportSize({ width, height: 900 }); const body = activityWire(); body.products[0] = { ...product, name: 'A'.repeat(100) }; fixture.replies.push({ status: 200, data: body })
    await open(page); await load(page); await expect(panel(page)).toContainText('검수 상품군 DEMO · 열람 전용'); await expect(panel(page)).toContainText('용량은 미확인'); await expect(cards(page).getByRole('heading', { level: 3 })).toHaveText('A'.repeat(100)); await expect(cards(page).locator('a, button')).toHaveCount(0)
    await expect(cards(page).getByText('주종 일치:', { exact: false })).toHaveText('주종 일치: 맥주 (찜한 검수 상품의 주종 · 최근 4점 이상 후기를 남긴 검수 상품의 주종)')
    await expect(cards(page).getByText('도수 비교 근거:', { exact: false })).toHaveText('도수 비교 근거: 후보 0 vol% / 저장 선호 0 vol%')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  })
}
for (const width of [1280, 390]) test(`로컬 검수 scope의 명시추천·현재상세·개인선택·제외 응답을 연결 ${width}px`, async ({ page, fixture }, info) => {
  fixture.user = { ...users[0], id: '회원+로컬%' }; fixture.replies.push({ status: 200, data: localWire() })
  await page.setViewportSize({ width, height: 900 }); await open(page); expect(fixture.posts()).toHaveLength(0)
  const received = page.waitForResponse((r) => r.url().endsWith('/api/users/me/recommendations/content')); await button(page).press('Enter'); expect((await (await received).json()).data.result.items[0].score).toBe(0.6984126984126984)
  await expect(cards(page)).toHaveCount(1); await expect(panel(page).locator('.eyebrow')).toHaveText('검수 로컬 상품'); await expect(cards(page)).toContainText('시연 가격 0원'); await expect(cards(page)).toContainText('비교 점수 0.698 (0–1)'); await expect(cards(page).locator('img')).toHaveCount(0)
  await expect(cards(page)).not.toContainText(/맛 태그 일치|향 태그 일치/); await panel(page).getByText('상품 정보·추천 안내', { exact: true }).click(); await expect(panel(page).getByText(/가격은 시연용이며/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  if (width === 390) await info.attach('local-content-390.png', { body: await panel(page).screenshot(), contentType: 'image/png' })
  await cards(page).getByRole('link', { name: localProduct.name, exact: true }).focus(); await page.keyboard.press('Enter'); await expect(page).toHaveURL('/products/7'); await expect(page.getByRole('heading', { name: localProduct.name, level: 1, exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: '상품 특성', exact: true }).getByText('미확인', { exact: true }).first()).toBeVisible()
  const feedback = page.locator('details.recommendation-feedback'); await feedback.locator('summary').press('Enter'); await feedback.getByRole('button', { name: '취향에 맞음', exact: true }).press('Enter'); await expect(feedback.getByRole('button', { name: '취향에 맞음', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const positive = localWire(); positive.products = [fixture.products[1]]; positive.result.items[0].product_id = 8; positive.result.items[0].explanation.comparison = { kind: 'reference_product', product_id: 7 }; positive.feedbackEvidence = { rankingMode: 'positive_feedback', excludedNotInterestedCount: 0, positiveReferences: [{ productId: 7, name: localProduct.name }] }; fixture.replies.push({ status: 200, data: positive })
  await page.goBack(); await expect(button(page)).toBeVisible(); await expect(cards(page)).toHaveCount(0); await load(page); await expect(cards(page)).toContainText(`취향에 맞음으로 표시한 ‘${localProduct.name}’과 비교했습니다.`)
  await cards(page).getByRole('link', { name: fixture.products[1].name, exact: true }).click(); await expect(page).toHaveURL('/products/8'); await expect(page.getByRole('heading', { name: fixture.products[1].name, level: 1, exact: true })).toBeVisible(); await feedback.locator('summary').click(); await feedback.getByRole('button', { name: '관심 없음', exact: true }).click(); await expect(feedback.getByRole('button', { name: '관심 없음', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const empty = localWire(); empty.products = []; Object.assign(empty.result, { items: [], eligible_count: 0, fallback_reason: 'no_eligible_products' }); empty.feedbackEvidence = { rankingMode: 'positive_feedback', excludedNotInterestedCount: 1, positiveReferences: [] }; fixture.replies.push({ status: 200, data: empty })
  await page.goBack(); await button(page).click(); await expect(panel(page)).toContainText('관심 없음 선택을 반영해 검수 후보군에서 1개를 제외했습니다.'); await expect(panel(page).getByRole('heading', { name: '조건에 맞는 검수 후보가 없습니다', exact: true })).toBeVisible(); await expect(cards(page)).toHaveCount(0)
  expect(fixture.feedbackCalls.filter((c) => c.method === 'PUT').map((c) => [c.owner, c.productId, c.body.feedback])).toEqual([[encodeURIComponent(fixture.user.id), 7, 'MATCHED'], [encodeURIComponent(fixture.user.id), 8, 'NOT_INTERESTED']]); expect(fixture.posts()).toHaveLength(3)
})
test('로컬 카탈로그 장애·정상 빈 결과는 기본순 자동요청이나 옛 링크로 바꾸지 않음', async ({ page, fixture }) => {
  fixture.replies.push({ status: 200, data: localWire() }); await open(page); await load(page); await page.getByLabel('상품 검색', { exact: true }).fill('미제출 로컬 검색')
  fixture.replies.push({ status: 200, data: { source: 'UNAVAILABLE', catalogScope: 'REVIEWED_LOCAL_CATALOG', result: null, products: [] } }); await button(page).click(); await expect(panel(page).getByRole('heading', { name: '취향 추천을 준비하지 못했습니다', exact: true })).toBeVisible(); await expect(cards(page)).toHaveCount(0)
  fixture.replies.push({ status: 503 }); await button(page).click(); await expect(panel(page).getByRole('heading', { name: '추천을 가져오지 못했습니다', exact: true })).toBeVisible(); await expect(page.getByLabel('상품 검색', { exact: true })).toHaveValue('미제출 로컬 검색'); expect(fixture.calls.filter((c) => c.path === '/recommendations/default')).toEqual([])
})
for (const status of [200, 401]) test(`로컬 scope의 이전 계정 지연${status}는 새 계정 카드/링크를 침범하지 않음`, async ({ page, fixture }) => {
  await open(page); const gate = fixture.hold('/users/me/recommendations/content', { status, data: localWire() }); await button(page).click(); await expect.poll(() => gate.started).toBe(true)
  await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await login(page, 'other'); await load(page); const old = page.waitForResponse((r) => r.url().endsWith('/api/users/me/recommendations/content') && r.status() === status); gate.release(); await (await old).finished()
  await expect(cards(page)).toHaveCount(1); await expect(cards(page).locator('a')).toHaveCount(0); await expect(panel(page).locator('.eyebrow')).toHaveText('검수 상품 DEMO · 열람 전용'); await expect(panel(page).getByRole('heading', { name: '추천을 보려면 다시 로그인해 주세요', exact: true })).toHaveCount(0)
})
test('guest/503 bootstrap는 개인POST 없이 기본 목록/명시 세션 복구', async ({ page, fixture }) => {
  fixture.user = null; fixture.meReplies.push({ status: 503 }); await page.goto('/')
  await expect(panel(page)).toContainText('로그인 상태를 확인하지 못했습니다.'); await expect(button(page)).toHaveCount(0); expect(fixture.posts()).toHaveLength(0)
  await panel(page).getByRole('button', { name: '추천 로그인 상태 다시 확인' }).click(); await expect(panel(page).getByRole('link', { name: '로그인하고 취향 추천 보기' })).toBeVisible()
  await panel(page).getByRole('link', { name: '취향 없이 기본 목록 보기' }).click(); await expect(page.getByRole('heading', { name: '기본 주류 둘러보기', exact: true })).toBeVisible(); expect(fixture.posts()).toHaveLength(0)
})
for (const [status, title] of [[400, '추천 조건을 확인해 주세요'], [409, '취향이나 검수 후보가 변경되었습니다'], [500, '추천을 가져오지 못했습니다'], [503, '추천을 가져오지 못했습니다']]) {
  test(`${status}는 기본 추천으로 위장하지 않고 명시 재요청`, async ({ page, fixture }) => {
    fixture.replies.push({ status }); await open(page); await button(page).click(); await expect(panel(page).getByRole('heading', { name: title, exact: true })).toBeVisible(); await expect(cards(page)).toHaveCount(0)
    await page.evaluate(() => { window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('focus')) }); expect(fixture.posts()).toHaveLength(1)
    await load(page); expect(fixture.posts()).toHaveLength(2)
  })
}
test('UNAVAILABLE과 정상 empty, 지원 선호 없는 기본순을 각각 표시', async ({ page, fixture }) => {
  fixture.replies.push({ status: 200, data: { source: 'UNAVAILABLE', catalogScope: 'REVIEWED_DEMO', result: null, products: [] } })
  await open(page); await button(page).click(); await expect(panel(page).getByRole('heading', { name: '취향 추천을 준비하지 못했습니다' })).toBeVisible()
  const empty = wire(); Object.assign(empty.result, { items: [], eligible_count: 0, fallback_reason: 'no_eligible_products' }); empty.products = []; fixture.replies.push({ status: 200, data: empty })
  await button(page).click(); await expect(panel(page).getByRole('heading', { name: '조건에 맞는 검수 후보가 없습니다' })).toBeVisible()
  const baseline = wire(); Object.assign(baseline.result, { fallback_reason: 'no_supported_preferences', supported_profile_tokens: 0 }); Object.assign(baseline.result.items[0], { score: 0, reasons: ['available', 'deterministic_baseline'], contributions: [], explanation: { ...baseline.result.items[0].explanation, basis: 'deterministic_baseline', score_evidence: [], total_positive_contributions: 0, fallback_reason: 'no_supported_preferences' } }); fixture.replies.push({ status: 200, data: baseline })
  await load(page); await expect(cards(page)).toContainText('비교 점수 0 (0–1)'); await expect(cards(page)).not.toContainText('추천에 사용한 비교 근거'); await expect(panel(page)).toContainText('비교할 수 있는 선호가 없어 기본순')
})
test('추천 피드백의 실제 기준과 활동 이유를 나누고 부족한 후보를 기본순으로 채우지 않음', async ({ page, fixture }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  fixture.user = { ...users[0], id: '회원+테스트%' }
  fixture.replies.push({ status: 200, data: feedbackWire() })
  await open(page)
  await button(page).press('Enter')
  await expect(cards(page)).toHaveCount(2)
  expect(fixture.posts()[0].owner).toBe(encodeURIComponent(fixture.user.id))
  await expect(button(page)).toBeFocused()
  await expect(cards(page).first()).toContainText('찜한 검수 상품의 주종')
  await expect(cards(page).last()).toContainText(`취향에 맞음으로 표시한 ‘${referenceName}’과 비교했습니다.`)
  await expect(cards(page).last()).toContainText('용량 비교 근거: 후보 330 mL / 비교 상품 375 mL')
  await expect(cards(page).last()).not.toContainText(/찜한 검수 상품|저장 선호|용량 미확인/)
  await expect(cards(page).locator('a, b, button')).toHaveCount(0)
  await expect(panel(page)).toContainText('관심 없음 선택을 반영해 검수 후보군에서 2개를 제외했습니다.')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

  const empty = feedbackWire()
  delete empty.activityEvidence
  empty.products = []; empty.result.items = []; empty.result.fallback_reason = 'no_matching_features'; empty.feedbackEvidence.positiveReferences = []
  fixture.replies.push({ status: 200, data: empty })
  await button(page).click()
  await expect(panel(page).getByRole('heading', { name: '비교 근거가 있는 검수 후보가 없습니다' })).toBeVisible()
  await expect(cards(page)).toHaveCount(0)
  await expect(panel(page)).not.toContainText(/기본순으로 표시|준비하지 못했습니다/)
})
for (const where of ['me', 'post']) {
  test(`${where} 현재401은 차폐하고 재로그인만 제공`, async ({ page, fixture }) => {
    await open(page); await load(page)
    if (where === 'me') {
      fixture.meReplies.push({ status: 401 })
      await button(page).click()
    } else {
      const oldSession = fixture.hold('/auth/me', { status: 200, data: users[0] })
      await button(page).click()
      await expect.poll(() => oldSession.started).toBe(true)
      fixture.user = users[1]
      oldSession.release()
    }
    await expect(panel(page).getByRole('heading', { name: '추천을 보려면 다시 로그인해 주세요' })).toBeVisible(); await expect(cards(page)).toHaveCount(0)
    if (where === 'post') expect(fixture.posts().at(-1).owner).toBe('member')
    const count = fixture.posts().length; await button(page).press('Enter'); expect(fixture.posts()).toHaveLength(count)
    await panel(page).getByRole('button', { name: '추천 다시 로그인' }).click(); await expect(page).toHaveURL('/account?redirect=%2F')
  })
}
for (const status of [200, 401]) {
  test(`다른 경로의 늦은${status}가 새 홈 결과를 바꾸지 않음`, async ({ page, fixture }) => {
    await open(page); const gate = fixture.hold('/users/me/recommendations/content', { status, data: wire() }); await button(page).click(); await expect.poll(() => gate.started).toBe(true)
    await button(page).press('Enter'); expect(fixture.posts()).toHaveLength(1)
    await page.locator('.hero-cta').click(); await expect(page).toHaveURL('/products'); await home(page); await load(page)
    const old = page.waitForResponse((r) => r.url().endsWith('/api/users/me/recommendations/content') && r.status() === status); gate.release(); await (await old).finished()
    await expect(cards(page)).toHaveCount(1); await expect(panel(page).getByRole('heading', { name: '추천을 보려면 다시 로그인해 주세요' })).toHaveCount(0)
  })
}
for (const [id, status] of [['member', 401], ['other', 401], ['other', 200]]) {
  test(`${id} 재로그인/계정전환에 옛 추천과 늦은 ${status} 격리`, async ({ page, fixture }) => {
    await open(page); const gate = fixture.hold('/users/me/recommendations/content', { status, data: feedbackWire() }); await button(page).click(); await expect.poll(() => gate.started).toBe(true)
    await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await expect(panel(page).getByRole('link', { name: '로그인하고 취향 추천 보기' })).toBeVisible(); await login(page, id); await expect(cards(page)).toHaveCount(0); await load(page)
    const old = page.waitForResponse((r) => r.url().endsWith('/api/users/me/recommendations/content') && r.status() === status); gate.release(); await (await old).finished(); await expect(cards(page)).toHaveCount(1); await expect(cards(page)).not.toContainText('찜한 검수 상품의 주종'); await expect(panel(page)).not.toContainText(referenceName)
  })
}
test('불확실 auth쓰기503 뒤 과거결과 차폐·쓰기이후 me401이면 새POST0', async ({ page, fixture }) => {
  await open(page); await load(page); fixture.logoutStatus = 503
  await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await expect(page.getByRole('alert')).toBeVisible(); await expect(cards(page)).toHaveCount(0)
  fixture.meReplies.push({ status: 401 }); await button(page).click(); await expect(panel(page).getByRole('heading', { name: '추천을 보려면 다시 로그인해 주세요' })).toBeVisible(); expect(fixture.posts()).toHaveLength(1)
})
test('me 대기 중 이탈이면 개인POST를 전송하지 않음', async ({ page, fixture }) => {
  await open(page); const gate = fixture.hold('/auth/me', { status: 200, data: users[0] }); await button(page).click(); await expect.poll(() => gate.started).toBe(true)
  await page.locator('.hero-cta').click(); const old = page.waitForResponse((r) => r.url().endsWith('/api/auth/me')); gate.release(); await (await old).finished(); expect(fixture.posts()).toHaveLength(0); await expect(page).toHaveURL('/products')
})

test('이전 me와 겹친 실패 auth쓰기는 원래 읽기로 추천을 재개하지 않음', async ({ page, fixture }) => {
  await open(page); const gate = fixture.hold('/auth/me', { status: 200, data: users[0] }); await button(page).click(); await expect.poll(() => gate.started).toBe(true)
  fixture.logoutStatus = 503; await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await expect(page.getByRole('alert')).toBeVisible()
  const old = page.waitForResponse((r) => r.url().endsWith('/api/auth/me')); gate.release(); await (await old).finished(); expect(fixture.posts()).toHaveLength(0); await expect(cards(page)).toHaveCount(0)
  fixture.meReplies.push({ status: 401 }); await button(page).click(); await expect(panel(page).getByRole('heading', { name: '추천을 보려면 다시 로그인해 주세요' })).toBeVisible(); expect(fixture.posts()).toHaveLength(0)
})
test('동일 홈 새경로key는 이전 요청·결과를 복원하지 않음', async ({ page, fixture }) => {
  await open(page); const gate = fixture.hold('/users/me/recommendations/content', { status: 200, data: wire('REVIEWED_FAMILY_BROWSE_DEMO') }); await button(page).click(); await expect.poll(() => gate.started).toBe(true)
  await home(page); await expect(cards(page)).toHaveCount(0); await load(page)
  const old = page.waitForResponse((r) => r.url().endsWith('/api/users/me/recommendations/content')); gate.release(); await (await old).finished(); await expect(cards(page)).toHaveCount(1); await expect(panel(page)).not.toContainText('검수 상품군 DEMO')
})
test('잘못 연결된 Product7 응답은 이전 카드로 대체하지 않고 명시 재요청', async ({ page, fixture }) => {
  await open(page); await load(page); const invalid = wire(); invalid.products[0] = { ...product, id: 8 }; fixture.replies.push({ status: 200, data: invalid })
  await button(page).click(); await expect(panel(page).getByRole('heading', { name: '추천을 가져오지 못했습니다' })).toBeVisible(); await expect(cards(page)).toHaveCount(0)
  const unearned = activityWire(); unearned.activityEvidence.highlyRatedCategories = ['탁주']; fixture.replies.push({ status: 200, data: unearned })
  await button(page).click(); await expect(panel(page).getByRole('heading', { name: '추천을 가져오지 못했습니다' })).toBeVisible(); await expect(cards(page)).toHaveCount(0)
  expect(fixture.posts()).toHaveLength(3); await load(page)
})
