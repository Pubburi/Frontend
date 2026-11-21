import { expect, test as base } from '@playwright/test'
// Authored consumer fixtures; final acceptance uses the actual PG provider separately.
const product = { id: 7, name: '기록 시연 상품', type: '탁주', price: 7000, abv: 6.25, img: null, orderCount: 0 }
const account = (id = 'member') => ({ id, name: id === 'member' ? '기록 회원' : '다른 회원', role: 'USER', stamps: 0 })
const ok = (data) => ({ data, message: 'ok', error: null })
const bad = (status) => ({ data: null, message: null, error: { code: status === 401 ? 'UNAUTHORIZED' : 'REQUEST_FAILED' } })
const entry = (extra = {}) => ({ id: '11111111-1111-4111-8111-111111111111', productId: 7, productName: product.name, currentProduct: product,
  experience: 'TRIED', rating: 0, tasteTags: [], aromaTags: null, memo: 'private original', version: 0, createdAt: 1, updatedAt: 1, ...extra })
const pageOf = (items, page = 1, size = 10) => ({ items: items.slice((page - 1) * size, page * size), page, size, total: items.length, totalPages: Math.ceil(items.length / size), hasNext: page * size < items.length })
const test = base.extend({ notebookApi: [async ({ page }, use) => {
  const s = { user: account(), notes: { member: [], other: [] }, calls: [], unexpected: [], errors: [], writeStatus: 0, meFailure: false }
  page.on('pageerror', (e) => s.errors.push(e.message))
  await page.route('**/api/**', async (route) => {
    if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/users/me/notifications') return route.fulfill({ status: 404, json: { data: null, error: { code: 'NOTIFICATIONS_NOT_SUPPORTED' } } })
      if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/users/me/cart') return route.fulfill({ status: 404, json: { data: null, error: { code: 'CART_NOT_SUPPORTED' } } })
    const r = route.request(), url = new URL(r.url()), path = url.pathname, method = r.method(), body = r.postData() ? r.postDataJSON() : undefined
    const owner = r.headers()['x-pubburi-account-owner']; s.calls.push({ path, method, body, owner, query: Object.fromEntries(url.searchParams) })
    const reply = (data, status = 200) => route.fulfill({ status, json: status < 400 ? ok(data) : bad(status) })
    if (path === '/api/auth/me') return reply(s.user, s.meFailure ? 503 : s.user ? 200 : 401)
    if (path === '/api/auth/logout') { s.user = null; return reply(null) }
    if (path === '/api/auth/login') { s.user = account(body.id); return reply(s.user) }
    if (path.startsWith('/api/users/me/notebook')) {
      if (!s.user || owner !== encodeURIComponent(s.user.id)) return reply(null, 401)
      const notes = s.notes[s.user.id] ??= []
      if (method !== 'GET' && s.writeStatus) return reply(null, s.writeStatus)
      if (path === '/api/users/me/notebook') {
        if (method === 'GET') return reply(pageOf(notes, Number(url.searchParams.get('page') || 1), Number(url.searchParams.get('size') || 10)))
        if (method === 'POST') {
          if (notes.some((note) => note.productId === body.productId)) return reply(null, 409)
          const note = entry(body); notes.unshift(note); return reply(note, 201)
        }
      }
      if (path.startsWith('/api/users/me/notebook/by-product/')) return reply(notes.find((note) => note.productId === Number(path.split('/').at(-1))) ?? null)
      const note = notes.find((note) => note.id === path.split('/').at(-1))
      if (!note) return reply(null, 404)
      if (method === 'GET') return reply(note)
      const version = method === 'DELETE' ? Number(url.searchParams.get('expectedVersion')) : body.expectedVersion
      if (version !== note.version) return reply(null, 409)
      if (method === 'DELETE') { notes.splice(notes.indexOf(note), 1); return reply(null) }
      if (method === 'PUT') { Object.assign(note, body, { version: note.version + 1, updatedAt: 2 }); delete note.expectedVersion; return reply(note) }
    }
    if (path === '/api/products/7') return reply(product)
    if (path === '/api/products/7/features') return reply({ productId: 7, volumeMl: null, description: null, tasteTags: null, aromaTags: null, sourceName: null, sourceUrl: null, sourceNote: null })
    if (path === '/api/products/7/comments') return reply(pageOf([]))
    if (path === '/api/users/me/favorites/7') return reply({ productId: 7, favorited: false })
    if (path === '/api/products/popular') return reply([product])
    if (path === '/api/products') return reply(pageOf([product]))
    if (path === '/api/markets') return reply(pageOf([]))
    if (/^\/api\/users\/[^/]+\/profile$/.test(path)) return reply({ user: s.user, grade: {} })
    if (/^\/api\/users\/[^/]+\/orders$/.test(path)) return reply(pageOf([]))
    s.unexpected.push(`${method} ${path}`); return reply(null, 503)
  })
  await use(s); expect(s.unexpected).toEqual([]); expect(s.errors).toEqual([])
}, { auto: true }] })
const form = (page) => page.getByRole('form', { name: '나만의 취향 기록 편집', exact: true })
const memo = (page) => form(page).getByLabel('나만의 메모 (선택)', { exact: true })
const writes = (s) => s.calls.filter((c) => c.path.startsWith('/api/users/me/notebook') && c.method !== 'GET')
async function open(page) {
  await page.goto('/products/7'); await page.locator('.notebook-panel summary').click(); await expect(form(page)).toBeVisible()
}
function gate() { let release; const promise = new Promise((r) => { release = r }); return { promise, release } }
async function nav(page, name) { const link = page.getByRole('link', { name, exact: true }); await expect(link).toBeVisible(); await link.click() }
const pagingEntries = () => Array.from({ length: 11 }, (_, i) => entry({
  id: `11111111-1111-4111-8111-${String(i + 1).padStart(12, '0')}`, productId: 7 + i,
  productName: `페이지 기록 ${i + 1}`, currentProduct: { ...product, id: 7 + i, name: `페이지 기록 ${i + 1}` }, memo: `페이지 메모 ${i + 1}`,
}))
const pagingHeading = (page) => page.getByRole('heading', { name: '내 취향 기록', exact: true })
const pagination = (page) => page.getByRole('navigation', { name: 'pagination', exact: true })

for (const width of [390, 1440]) test(`기록 페이지 키보드 왕복은 현재 결과와 페이지 제목에서 첫 기록 조작으로 이어짐 ${width}px`, async ({ page, notebookApi: s }) => {
  s.notes.member = pagingEntries(); await page.setViewportSize({ width, height: 900 }); await page.goto('/notebook?page=1')
  await expect(page.locator('.notebook-card')).toHaveCount(10)
  for (const destination of [{ page: 2, button: '다음', count: 1, name: '페이지 기록 11' }, { page: 1, button: '이전', count: 10, name: '페이지 기록 1' }]) {
    const button = pagination(page).getByRole('button', { name: destination.button, exact: true }); await button.focus(); await button.press('Enter')
    await expect(page).toHaveURL(`/notebook?page=${destination.page}`); await expect(page.locator('.notebook-card')).toHaveCount(destination.count)
    await expect(page.locator('.notebook-card').first().getByRole('heading', { name: destination.name, exact: true })).toBeVisible()
    await expect(pagingHeading(page)).toBeFocused(); await expect(pagingHeading(page)).toBeInViewport()
    const target = page.locator('.notebook-card').first().getByRole('link', { name: `현재 상품 보기 · ${destination.name}`, exact: true })
    for (let count = 0; count < 3 && !(await target.evaluate((element) => document.activeElement === element)); count++) await page.keyboard.press('Tab')
    await expect(target).toBeFocused()
    const visible = await target.evaluate((element) => { const rect = element.getBoundingClientRect(); return rect.top >= document.querySelector('.topbar').getBoundingClientRect().bottom && rect.bottom <= innerHeight })
    expect(visible).toBe(true); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  }
  expect(writes(s)).toEqual([])
})

test('기록 페이지 포인터 이동과 늦은 키보드 결과는 다른 현재 조작의 초점을 가져가지 않음', async ({ page, notebookApi: s }) => {
  s.notes.member = pagingEntries()
  for (const activation of ['pointer', 'keyboard']) {
    await page.goto('/notebook?page=1'); await expect(page.locator('.notebook-card')).toHaveCount(10)
    const g = gate(); let started = false
    const handler = async (route) => {
      if (new URL(route.request().url()).searchParams.get('page') !== '2') return route.fallback()
      started = true; await g.promise; await route.fallback()
    }
    await page.route('**/api/users/me/notebook?**', handler)
    try {
      const next = pagination(page).getByRole('button', { name: '다음', exact: true })
      if (activation === 'pointer') await next.click()
      else { await next.focus(); await next.press('Enter') }
      await expect.poll(() => started).toBe(true)
      if (activation === 'pointer') await expect(pagingHeading(page)).not.toBeFocused()
      const current = page.getByRole('link', { name: '마이페이지', exact: true }); await current.focus()
      g.release(); await expect(page.locator('.notebook-card')).toHaveCount(1)
      await expect(current).toBeFocused(); await expect(pagingHeading(page)).not.toBeFocused()
    } finally { g.release(); await page.unroute('**/api/users/me/notebook?**', handler) }
  }
  expect(writes(s)).toEqual([])
})

test('기록 키보드 페이지 읽기 실패는 제목과 명시 복구를 남기고 빈 목록으로 바꾸지 않음', async ({ page, notebookApi: s }) => {
  s.notes.member = pagingEntries(); let failures = 1
  await page.route('**/api/users/me/notebook?**', (route) => {
    if (new URL(route.request().url()).searchParams.get('page') === '2' && failures-- > 0) return route.fulfill({ status: 503, json: bad(503) })
    return route.fallback()
  })
  await page.goto('/notebook?page=1'); await expect(page.locator('.notebook-card')).toHaveCount(10)
  const next = pagination(page).getByRole('button', { name: '다음', exact: true }); await next.focus(); await next.press('Enter')
  await expect(page.getByText('내 취향 기록을 확인하지 못했습니다.', { exact: true })).toBeVisible()
  await expect(pagingHeading(page)).toBeFocused(); await expect(page.locator('.notebook-card')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '아직 저장한 취향 기록이 없습니다', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '내 기록 다시 불러오기', exact: true }).click(); await expect(page.locator('.notebook-card')).toHaveCount(1)
  await expect(page).toHaveURL('/notebook?page=2'); expect(writes(s)).toEqual([])
})

for (const departure of ['route', 'account']) test(`기록 페이지의 늦은 응답은 ${departure} 전환 뒤 현재 화면과 초점에 적용되지 않음`, async ({ page, notebookApi: s }) => {
  s.notes.member = pagingEntries(); s.notes.other = [entry({ productName: '다른 계정 기록', memo: '다른 계정 메모' })]
  const old = pageOf(structuredClone(s.notes.member), 2), g = gate(); let started = false
  await page.route('**/api/users/me/notebook?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('page') !== '2') return route.fallback()
    started = true; await g.promise; await route.fulfill({ json: ok(old) })
  })
  try {
    await page.goto('/notebook?page=1'); await expect(page.locator('.notebook-card')).toHaveCount(10)
    const next = pagination(page).getByRole('button', { name: '다음', exact: true }); await next.focus(); await next.press('Enter')
    await expect.poll(() => started).toBe(true)
    let current
    if (departure === 'route') {
      await nav(page, '장바구니'); await expect(page).toHaveURL('/cart')
      current = page.getByRole('link', { name: '전체 주류 보기', exact: true })
    } else {
      await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await expect(page).toHaveURL('/'); await nav(page, '로그인')
      await page.getByLabel('아이디', { exact: true }).fill('other'); await page.getByLabel('비밀번호', { exact: true }).fill('fixture-pass')
      await page.locator('.auth-form').getByRole('button', { name: '로그인', exact: true }).click(); await nav(page, '내 취향 기록')
      await expect(page.locator('.notebook-card')).toContainText('다른 계정 메모'); current = page.getByRole('button', { name: '내 기록 목록 새로고침', exact: true })
    }
    await current.focus()
    const settled = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/users/me/notebook' && new URL(response.url()).searchParams.get('page') === '2')
    g.release(); await (await settled).finished(); await page.evaluate(() => new Promise(requestAnimationFrame))
    await expect(current).toBeFocused(); await expect(page.getByText('페이지 메모 11', { exact: true })).toHaveCount(0)
    expect(writes(s)).toEqual([])
  } finally { g.release() }
})

for (const width of [1280, 390]) test(`비공개 기록 ${width}px 상세에서 경험0점·개인태그/메모 저장, 본인목록에서 관심 전환·삭제`, async ({ page, notebookApi: s }) => {
  await page.setViewportSize({ width, height: 900 }); await open(page)
  await page.getByRole('button', { name: '1개 장바구니에 담기', exact: true }).click(); await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pubburi-cart') || 'null')?.[0]?.quantity)).toBe(1); const cart = await page.evaluate(() => localStorage.getItem('pubburi-cart'))
  await form(page).getByLabel('기록 구분', { exact: true }).selectOption('TRIED')
  await form(page).getByLabel('나의 평점 (선택)', { exact: true }).fill('0')
  await form(page).getByRole('combobox', { name: '내가 느낀 맛 확인 상태', exact: true }).selectOption('empty')
  await memo(page).fill('  개인 메모\n그대로  ')
  await form(page).getByRole('button', { name: '내 기록 저장', exact: true }).focus(); await page.keyboard.press('Enter')
  await expect(page.getByText('비공개 기록을 저장했습니다.', { exact: true })).toBeVisible()
  expect(s.notes.member[0]).toMatchObject({ rating: 0, tasteTags: [], aromaTags: null, memo: '  개인 메모\n그대로  ' })
  await page.getByRole('link', { name: '내 취향 기록 모아보기', exact: true }).click()
  await expect(page.locator('.notebook-card')).toHaveCount(1); await expect(page.locator('.notebook-card')).toContainText('나의 평점 0점')
  await page.getByRole('button', { name: '내 기록 편집', exact: true }).click()
  await expect(memo(page)).toHaveValue('  개인 메모\n그대로  ')
  await form(page).getByLabel('기록 구분', { exact: true }).selectOption('INTERESTED')
  await memo(page).fill(''); await form(page).getByRole('button', { name: '내 기록 저장', exact: true }).click()
  await expect(page.getByText('비공개 기록을 저장했습니다.', { exact: true })).toBeVisible()
  expect(s.notes.member[0]).toMatchObject({ experience: 'INTERESTED', rating: null, tasteTags: null, aromaTags: null, memo: '', version: 1 })
  await form(page).getByRole('button', { name: '내 기록 삭제', exact: true }).click()
  const dialog = page.getByRole('alertdialog'); await dialog.getByRole('button', { name: '삭제', exact: true }).focus(); await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: '아직 저장한 취향 기록이 없습니다', exact: true })).toBeVisible()
  expect(writes(s).map((c) => c.method)).toEqual(['POST', 'PUT', 'DELETE'])
  expect(writes(s)[1].body.expectedVersion).toBe(0); expect(writes(s)[2].query.expectedVersion).toBe('1')
  expect(writes(s).every((c) => c.owner === encodeURIComponent('member'))).toBe(true)
  expect(s.calls.filter((c) => c.path.includes('/comments') && c.method !== 'GET')).toEqual([])
  expect(await page.evaluate(() => localStorage.getItem('pubburi-cart'))).toBe(cart)
  expect(await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]))).not.toContain('개인 메모')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('비회원과 세션503은 개인 API를 요청하지 않고 공개 상세·담기와 명시 복구를 유지', async ({ page, notebookApi: s }) => {
  s.user = null; await page.goto('/products/7'); await page.locator('.notebook-panel summary').click()
  const panel = page.locator('.notebook-panel')
  const description = panel.getByText(/^나만 보는 기록입니다\./)
  const collection = panel.getByRole('link', { name: '내 취향 기록 모아보기', exact: true })
  const login = panel.getByRole('link', { name: '로그인하고 내 기록 남기기', exact: true })
  await expect(login).toHaveAttribute('href', '/account?redirect=%2Fproducts%2F7')
  for (const width of [390, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    const [copyBox, collectionBox, loginBox] = await Promise.all([description.boundingBox(), collection.boundingBox(), login.boundingBox()])
    expect(collectionBox.y - (copyBox.y + copyBox.height)).toBeGreaterThanOrEqual(12)
    expect(loginBox.y - (collectionBox.y + collectionBox.height)).toBeGreaterThanOrEqual(12)
    expect(loginBox.height).toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  }
  expect(s.calls.filter((c) => c.path.startsWith('/api/users/me/notebook'))).toEqual([])
  await page.getByRole('button', { name: '1개 장바구니에 담기', exact: true }).click()
  s.user = account(); s.meFailure = true; await page.reload(); await page.locator('.notebook-panel summary').click()
  await expect(page.getByRole('button', { name: '기록 로그인 상태 다시 확인', exact: true })).toBeVisible(); expect(writes(s)).toEqual([])
  s.meFailure = false; await page.getByRole('button', { name: '기록 로그인 상태 다시 확인', exact: true }).click(); await expect(form(page)).toBeVisible()
})

for (const width of [390, 1440]) test(`400은 입력을 보존하고409 최신 기록 복구는 키보드 편집 문맥을 유지 ${width}px`, async ({ page, notebookApi: s }) => {
  await page.setViewportSize({ width, height: 900 })
  s.notes.member.push(entry()); await open(page); await memo(page).fill('나의 미제출 입력')
  s.writeStatus = 400; await form(page).getByRole('button', { name: '내 기록 저장', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('입력한 내용'); await expect(memo(page)).toHaveValue('나의 미제출 입력')
  s.writeStatus = 409; await form(page).getByRole('button', { name: '내 기록 저장', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('다른 곳에서'); await expect(memo(page)).toHaveValue('나의 미제출 입력')
  await form(page).getByRole('button', { name: '내 기록 저장', exact: true }).focus(); await page.keyboard.press('Enter'); expect(writes(s)).toHaveLength(2)
  s.notes.member[0] = entry({ version: 3, memo: '다른 창 최신값' }); s.writeStatus = 0
  const g = gate(); let started = false
  await page.route('**/api/users/me/notebook/by-product/7', async (route) => { started = true; await g.promise; await route.fallback() })
  try {
    const reads = s.calls.filter((call) => call.path === '/api/users/me/notebook/by-product/7').length
    await page.getByRole('button', { name: '최신 기록으로 다시 편집', exact: true }).press('Enter')
    await expect.poll(() => started).toBe(true)
    const editor = page.getByRole('region', { name: '내 취향 기록 편집 영역', exact: true })
    await expect(editor).toBeFocused(); await expect(form(page)).toHaveCount(0)
    await expect(editor).toContainText('내 취향 기록을 불러오는 중입니다.')
    g.release(); await expect(memo(page)).toHaveValue('다른 창 최신값')
    await expect(editor).toBeFocused()
    await page.keyboard.press('Tab'); await expect(form(page).getByRole('combobox', { name: '기록 구분', exact: true })).toBeFocused()
    expect(s.calls.filter((call) => call.path === '/api/users/me/notebook/by-product/7')).toHaveLength(reads + 1)
    expect(writes(s)).toHaveLength(2)
  } finally { g.release() }
  await memo(page).fill('명시적으로 합친 값'); await form(page).getByRole('button', { name: '내 기록 저장', exact: true }).click()
  await expect(page.getByText('비공개 기록을 저장했습니다.', { exact: true })).toBeVisible(); expect(writes(s).at(-1).body.expectedVersion).toBe(3)
})

test('생성은 실제 저장 뒤503이어도 자동 재전송 없이 원문을 보존하고 by-product 읽기로 확인', async ({ page, notebookApi: s }) => {
  await page.route('**/api/users/me/notebook', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    s.calls.push({ path: '/api/users/me/notebook', method: 'POST', body: route.request().postDataJSON() })
    s.notes.member.push(entry({ ...route.request().postDataJSON(), version: 0 }))
    return route.fulfill({ status: 503, json: bad(503) })
  })
  await open(page); await memo(page).fill('불확실 원문'); await form(page).getByRole('button', { name: '내 기록 저장', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('저장 결과를 확인하지 못했습니다.'); await expect(memo(page)).toHaveValue('불확실 원문')
  await form(page).getByRole('button', { name: '내 기록 저장', exact: true }).focus(); await page.keyboard.press('Enter'); expect(writes(s)).toHaveLength(1)
  await page.getByRole('button', { name: '최신 기록으로 다시 편집', exact: true }).click(); await expect(memo(page)).toHaveValue('불확실 원문')
  await expect(page.getByRole('region', { name: '내 취향 기록 편집 영역', exact: true })).not.toBeFocused()
  await expect(form(page).getByRole('button', { name: '내 기록 삭제', exact: true })).toBeVisible(); expect(writes(s)).toHaveLength(1)
})

for (const departure of ['other-control', 'route', 'account']) test(`최신 기록 복구의 늦은 응답은 ${departure}의 초점을 가져가지 않음`, async ({ page, notebookApi: s }) => {
  s.notes.member = [entry()]; s.notes.other = [entry({ memo: '다른 계정 메모' })]
  await open(page); await memo(page).fill('미제출 입력')
  const latest = entry({ version: 1, memo: '갱신된 기록' }); s.notes.member[0] = latest
  await form(page).getByRole('button', { name: '내 기록 저장', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('다른 곳에서')
  const g = gate(); let started = false, delivered = false
  await page.route('**/api/users/me/notebook/by-product/7', async (route) => {
    started = true; await g.promise; await route.fulfill({ json: ok(latest) }); delivered = true
  })
  try {
    await page.getByRole('button', { name: '최신 기록으로 다시 편집', exact: true }).press('Enter')
    await expect.poll(() => started).toBe(true)
    let current
    if (departure === 'other-control') current = page.getByRole('spinbutton', { name: `${product.name} 수량`, exact: true })
    else if (departure === 'route') {
      await nav(page, '장바구니'); await expect(page).toHaveURL('/cart')
      current = page.getByRole('navigation', { name: '주요 메뉴', exact: true }).getByRole('link', { name: '장바구니', exact: true })
    } else {
      await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await expect(page).toHaveURL('/'); await nav(page, '로그인')
      await page.getByLabel('아이디', { exact: true }).fill('other'); await page.getByLabel('비밀번호', { exact: true }).fill('fixture-pass')
      await page.locator('.auth-form').getByRole('button', { name: '로그인', exact: true }).click(); await nav(page, '내 취향 기록')
      await expect(page.locator('.notebook-card')).toContainText('다른 계정 메모')
      current = page.getByRole('button', { name: '내 기록 목록 새로고침', exact: true })
    }
    await current.focus(); await expect(current).toBeFocused(); g.release(); await expect.poll(() => delivered).toBe(true)
    if (departure === 'other-control') await expect(memo(page)).toHaveValue(latest.memo)
    else await expect(page.getByText(latest.memo, { exact: true })).toHaveCount(0)
    await expect(current).toBeFocused(); expect(writes(s)).toHaveLength(1)
  } finally { g.release() }
})

test('보류된 쓰기 중 새 입력과 disclosure 닫기/열기를 보존하고 중복 저장하지 않음', async ({ page, notebookApi: s }) => {
  const g = gate(); let started = false
  await page.route('**/api/users/me/notebook', async (route) => { if (route.request().method() !== 'POST') return route.fallback(); started = true; await g.promise; return route.fallback() })
  try {
    await open(page); await memo(page).fill('보낸 값'); await form(page).getByRole('button', { name: '내 기록 저장', exact: true }).click(); await expect.poll(() => started).toBe(true)
    await memo(page).fill('다음 입력'); await page.locator('.notebook-panel summary').click(); await page.locator('.notebook-panel summary').click(); await expect(memo(page)).toHaveValue('다음 입력')
    await form(page).getByRole('button', { name: '내 기록 저장', exact: true }).focus(); await page.keyboard.press('Enter'); g.release()
    await expect(page.getByText('비공개 기록을 저장했습니다.', { exact: true })).toBeVisible(); await expect(memo(page)).toHaveValue('다음 입력'); expect(writes(s)).toHaveLength(1)
    await form(page).getByRole('button', { name: '내 기록 저장', exact: true }).click(); await expect.poll(() => s.notes.member[0]?.memo).toBe('다음 입력')
    expect(writes(s).at(-1).body.expectedVersion).toBe(0)
  } finally { g.release() }
})

test('이탈한 상세의 쓰기가 끝난 후에 새 본인 목록을 읽어 오래된 빈 목록을 표시하지 않음', async ({ page, notebookApi: s }) => {
  const g = gate(); let started = false
  await page.route('**/api/users/me/notebook', async (route) => { if (route.request().method() !== 'POST') return route.fallback(); started = true; await g.promise; return route.fallback() })
  try {
    await open(page); await memo(page).fill('이탈 전 저장'); await form(page).getByRole('button', { name: '내 기록 저장', exact: true }).click(); await expect.poll(() => started).toBe(true)
    await page.getByRole('link', { name: '내 취향 기록 모아보기', exact: true }).click(); await expect(page).toHaveURL('/notebook')
    await expect(page.getByText('내 기록 목록을 불러오는 중입니다.', { exact: true })).toBeVisible()
    expect(s.calls.filter((c) => c.path === '/api/users/me/notebook' && c.method === 'GET')).toEqual([])
    g.release(); await expect(page.locator('.notebook-card')).toContainText('이탈 전 저장'); expect(writes(s)).toHaveLength(1)
  } finally { g.release() }
})

test('같은 계정 재로그인도 이전 HTTP 쓰기의 응답이 끝난 뒤 본인 목록을 다시 읽음', async ({ page, notebookApi: s }) => {
  const g = gate(); let started = false
  await page.route('**/api/users/me/notebook', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    s.notes.member.push(entry(route.request().postDataJSON())); started = true
    await g.promise; await route.fulfill({ status: 201, json: ok(s.notes.member[0]) })
  })
  try {
    await open(page); await memo(page).fill('이전 인증에서 승인된 기록'); await form(page).getByRole('button', { name: '내 기록 저장', exact: true }).click(); await expect.poll(() => started).toBe(true)
    await memo(page).fill('재로그인에 넘기면 안 되는 미제출 초안')
    await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await nav(page, '로그인')
    await page.getByLabel('아이디', { exact: true }).fill('member'); await page.getByLabel('비밀번호', { exact: true }).fill('fixture-pass')
    await page.locator('.auth-form').getByRole('button', { name: '로그인', exact: true }).click(); await page.getByRole('link', { name: '내 취향 기록', exact: true }).click()
    await expect(page.getByText('내 기록 목록을 불러오는 중입니다.', { exact: true })).toBeVisible()
    expect(s.calls.filter((c) => c.path === '/api/users/me/notebook' && c.method === 'GET')).toEqual([])
    g.release(); await expect(page.locator('.notebook-card')).toContainText('이전 인증에서 승인된 기록')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.getByRole('button', { name: '내 기록 편집', exact: true }).click(); await expect(memo(page)).toHaveValue('이전 인증에서 승인된 기록')
  } finally { g.release() }
})

test('상품 삭제 뒤 원문 기록은 UUID로 편집하고 마지막 페이지 삭제는 본인 앞 페이지로 보정', async ({ page, notebookApi: s }) => {
  s.notes.member = Array.from({ length: 11 }, (_, i) => entry({ id: `11111111-1111-4111-8111-${String(i + 1).padStart(12, '0')}`, productId: null, currentProduct: null, productName: `삭제 표본 ${i + 1}`, memo: '보존 메모' }))
  await page.setViewportSize({ width: 390, height: 900 }); await page.goto('/notebook?page=2')
  await expect(page.locator('.notebook-card')).toHaveCount(1); await expect(page.locator('.notebook-card')).toContainText('삭제된 상품 · 기록은 남아 있습니다.')
  await expect(page.locator('.notebook-card').getByRole('link', { name: /현재 상품 보기/ })).toHaveCount(0)
  await page.getByRole('button', { name: '내 기록 편집', exact: true }).click(); await memo(page).fill('삭제 후 수정')
  await form(page).getByRole('button', { name: '내 기록 저장', exact: true }).click(); await expect(page.getByText('비공개 기록을 저장했습니다.', { exact: true })).toBeVisible()
  await form(page).getByRole('button', { name: '내 기록 삭제', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: '삭제', exact: true }).click()
  await expect(page).toHaveURL('/notebook?page=1'); await expect(page.locator('.notebook-card')).toHaveCount(10)
})

test('Unicode 계정 owner는 canonical encodeURIComponent이며 emoji40자 태그/2000자 메모를 자르지 않음', async ({ page, notebookApi: s }) => {
  const id = '회원 /a'; s.user = account(id); s.notes[id] = []
  await open(page); await form(page).getByLabel('기록 구분', { exact: true }).selectOption('TRIED')
  await form(page).getByRole('combobox', { name: '내가 느낀 맛 확인 상태', exact: true }).selectOption('tags')
  await form(page).getByRole('textbox', { name: '내가 느낀 맛 1', exact: true }).fill('😀'.repeat(40))
  await memo(page).fill('😀'.repeat(2000)); await form(page).getByRole('button', { name: '내 기록 저장', exact: true }).click()
  await expect(page.getByText('비공개 기록을 저장했습니다.', { exact: true })).toBeVisible()
  expect(writes(s)[0].owner).toBe(encodeURIComponent(id)); expect(writes(s)[0].body.tasteTags[0]).toBe('😀'.repeat(40)); expect(writes(s)[0].body.memo).toBe('😀'.repeat(2000))
})

for (const oldStatus of [200, 401]) test(`늦은 이전 계정 읽기${oldStatus}는 새 계정 목록·편집에 나타나지 않고 현재401은 빈 기록으로 위장하지 않음`, async ({ page, notebookApi: s }) => {
  const g = gate(); let started = false
  await page.route('**/api/users/me/notebook/by-product/7', async (route) => { started = true; await g.promise; await route.fulfill({ status: oldStatus, json: oldStatus === 200 ? ok(entry({ memo: '옛 계정 비밀' })) : bad(oldStatus) }) })
  try {
    await page.goto('/products/7'); await page.locator('.notebook-panel summary').click(); await expect.poll(() => started).toBe(true)
    await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await nav(page, '로그인')
    await page.getByLabel('아이디', { exact: true }).fill('other'); await page.getByLabel('비밀번호', { exact: true }).fill('fixture-pass')
    await page.locator('.auth-form').getByRole('button', { name: '로그인', exact: true }).click(); await page.getByRole('link', { name: '내 취향 기록', exact: true }).click()
    await expect(page.getByRole('heading', { name: '아직 저장한 취향 기록이 없습니다', exact: true })).toBeVisible(); g.release()
    await expect(page.getByText('옛 계정 비밀', { exact: true })).toHaveCount(0)
    await page.route('**/api/users/me/notebook?*', (route) => route.fulfill({ status: 401, json: bad(401) }))
    await page.getByRole('button', { name: '내 기록 목록 새로고침', exact: true }).click()
    await expect(page.getByText('로그인 상태가 바뀌어 내 기록을 표시하지 않았습니다.', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '아직 저장한 취향 기록이 없습니다', exact: true })).toHaveCount(0)
  } finally { g.release() }
})

for (const method of ['PUT', 'DELETE', 'GET']) test(`P1 기록 ${method}401은 재확인 전 모든 카드의 비공개 원문·평점·태그와 편집을 차폐`, async ({ page, notebookApi: s }) => {
  const first = entry({ memo: '첫 번째 비공개 원문', tasteTags: ['내 비공개 맛'], rating: 4.25 })
  const second = entry({ id: '22222222-2222-4222-8222-222222222222', productId: 8, currentProduct: { ...product, id: 8 }, memo: '다른 카드의 비공개 원문', aromaTags: ['내 비공개 향'] })
  s.notes.member.push(first, second)
  await page.goto('/notebook'); await expect(page.locator('.notebook-card')).toHaveCount(2)
  if (method === 'GET') await page.route(`**/api/users/me/notebook/${first.id}`, (route) => route.fulfill({ status: 401, json: bad(401) }))
  await page.getByRole('button', { name: '내 기록 편집', exact: true }).first().click()
  if (method !== 'GET') {
    await expect(form(page)).toBeVisible(); s.writeStatus = 401
    if (method === 'PUT') { await memo(page).fill('보내려는 비공개 초안'); await form(page).getByRole('button', { name: '내 기록 저장', exact: true }).click() }
    else { await form(page).getByRole('button', { name: '내 기록 삭제', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: '삭제', exact: true }).click() }
  }
  await expect(page.getByText('로그인 상태가 바뀌어 내 기록을 표시하지 않았습니다.', { exact: true })).toBeVisible()
  await expect(page.locator('.notebook-card')).toHaveCount(0); await expect(form(page)).toHaveCount(0)
  const privateView = await page.locator('.notebook-view').textContent()
  for (const value of [first.memo, second.memo, '내 비공개 맛', '내 비공개 향', '나의 평점 4.25점']) expect(privateView).not.toContain(value)
  s.user = account('other')
  await page.getByRole('button', { name: '기록 로그인 상태 다시 확인', exact: true }).click()
  await expect(page.getByRole('heading', { name: '아직 저장한 취향 기록이 없습니다', exact: true })).toBeVisible()
  expect(s.calls.filter((call) => call.path === '/api/users/me/notebook' && call.method === 'GET').at(-1).owner).toBe('other')
})
