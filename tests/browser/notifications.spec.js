import { expect, test as base } from '@playwright/test'

// Consumer fixtures; the coordinator separately verifies actual PG event transactions.
const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const user = (id = 'member') => ({ id, name: id === 'member' ? '알림 회원' : '다른 회원', role: 'USER', stamps: 0 })
const note = (n, extra = {}) => ({ id: uuid(n), type: n % 2 ? 'ORDER_COMPLETED' : 'REVIEW_REMOVED', createdAt: 1794100000000 - n, readAt: null, orderId: n % 2 ? 901 : null, productId: n % 2 ? null : 7, productName: n % 2 ? null : '원문 <상품> & 알림', targetAvailable: true, ...extra })
const ok = (data) => ({ data, error: null }), bad = (code) => ({ data: null, error: { code } })
const emptyPage = { items: [], page: 1, size: 12, total: 0, totalPages: 0, hasNext: false }
function gate() { let release; const promise = new Promise((resolve) => { release = resolve }); return { promise, release } }
const test = base.extend({ notifications: [async ({ page }, use) => {
  const s = { user: user(), notes: { member: [note(1), note(2)], other: [] }, calls: [], unexpected: [], errors: [], readStatus: 0, writeStatus: 0, afterWriteStatus: 0, meStatus: 0, logoutStatus: 200 }
  page.on('pageerror', (e) => s.errors.push(e.message))
  await page.route('**/api/**', async (route) => {
    const r = route.request(), url = new URL(r.url()), path = url.pathname, method = r.method(), body = r.postData() ? r.postDataJSON() : null, owner = r.headers()['x-pubburi-account-owner']
    s.calls.push({ path, method, owner, body, query: Object.fromEntries(url.searchParams) })
    const reply = (data, status = 200, code = 'SERVICE_UNAVAILABLE') => route.fulfill({ status, json: status < 400 ? ok(structuredClone(data)) : bad(code) })
    if (path === '/api/auth/me') return reply(s.user, s.meStatus || (s.user ? 200 : 401), s.user ? 'SERVICE_UNAVAILABLE' : 'UNAUTHORIZED')
    if (path === '/api/auth/logout') { if (s.logoutStatus === 200) s.user = null; return reply(true, s.logoutStatus) }
    if (path === '/api/auth/login') { s.user = user(body.id); return reply(s.user) }
    if (path === '/api/users/me/cart') return reply(null, 404, 'CART_NOT_SUPPORTED')
    if (path.startsWith('/api/users/me/notifications')) {
      if (!s.user || owner !== encodeURIComponent(s.user.id)) return reply(null, 401, 'UNAUTHORIZED')
      const notes = s.notes[s.user.id] ??= []
      if (method === 'GET') {
        if (s.readStatus) return reply(null, s.readStatus, s.readStatus === 401 ? 'UNAUTHORIZED' : 'SERVICE_UNAVAILABLE')
        const page = Number(url.searchParams.get('page')), size = Number(url.searchParams.get('size')), total = notes.length
        return reply({ items: notes.slice((page - 1) * size, page * size), page, size, total, totalPages: Math.ceil(total / size), hasNext: page * size < total, unreadCount: notes.filter((n) => n.readAt === null).length })
      }
      const ids = method === 'PUT' ? [path.split('/').at(-2)] : body.ids
      if (s.writeStatus) return reply(null, s.writeStatus, s.writeStatus === 401 ? 'UNAUTHORIZED' : 'NOT_FOUND')
      if (!ids.every((id) => notes.some((n) => n.id === id))) return reply(null, 404, 'NOT_FOUND')
      for (const id of ids) { const item = notes.find((n) => n.id === id); item.readAt ??= 1794100010000 }
      if (s.afterWriteStatus) { const status = s.afterWriteStatus; s.afterWriteStatus = 0; return reply(null, status) }
      return reply({ items: ids.map((id) => ({ id, readAt: notes.find((n) => n.id === id).readAt })), unreadCount: notes.filter((n) => n.readAt === null).length })
    }
    if (path === '/api/products/popular') return reply([])
    if (path === '/api/markets' || path === '/api/products') return reply(emptyPage)
    if (/^\/api\/users\/[^/]+\/profile$/.test(path)) return reply({ user: s.user, grade: {} })
    if (/^\/api\/users\/[^/]+\/orders$/.test(path)) return reply(emptyPage)
    if (path === '/api/orders/901') return reply({ oId: 901, userId: s.user.id, orderType: 'TAKEOUT', orderTime: '2026-11-08', completed: 'Y', totalPrice: 0, priceBasis: 'SNAPSHOT', details: [] })
    s.unexpected.push(`${method} ${path}`); return reply(null, 503)
  })
  await use(s); expect(s.errors).toEqual([]); expect(s.unexpected).toEqual([])
}, { auto: true }] })
const badge = (page) => page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: /^알림/ }).locator('.notification-count')
const cards = (page) => page.locator('.notification-card')
async function openMenu(page) { const link = page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: /^알림/ }); if (!await link.isVisible()) await page.getByRole('button', { name: '메뉴 열기', exact: true }).click(); return link }
async function signIn(page, id, target = '/notifications') { if (target === '/notifications') await (await openMenu(page)).click(); else await page.goto('/account?' + new URLSearchParams({ redirect: target })); await page.getByLabel('아이디', { exact: true }).fill(id); await page.getByLabel('비밀번호', { exact: true }).fill('fixture'); await page.locator('.auth-form').getByRole('button', { name: '로그인', exact: true }).click(); await expect(page).toHaveURL(target) }
const writes = (s) => s.calls.filter((c) => c.path.startsWith('/api/users/me/notifications') && c.method !== 'GET')

for (const width of [1280, 390]) {
  test(`헤더 최초 로그인 상태·reload에 미확인 수가 표시되고 직접 알림에 도달 ${width}`, async ({ page, notifications: s }) => {
    await page.setViewportSize({ width, height: 900 }); await page.goto('/'); await openMenu(page); await expect(badge(page)).toHaveText('2')
    expect(s.calls.filter((c) => c.path === '/api/users/me/notifications').every((c) => c.query.size === '1')).toBe(true)
    s.notes.member.push(note(3)); await page.reload(); const link = await openMenu(page); await expect(badge(page)).toHaveText('3')
    await link.focus(); await page.keyboard.press('Enter'); await expect(page).toHaveURL('/notifications'); await expect(cards(page)).toHaveCount(3); expect(writes(s)).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
  test(`두 사건·원문·현재/삭제 대상과 명시 개별/현재페이지 읽음 ${width}`, async ({ page, notifications: s }, info) => {
    s.notes.member = [note(1), note(2, { targetAvailable: false }), note(4)]
    await page.setViewportSize({ width, height: 900 }); await page.goto('/notifications'); await expect(cards(page)).toHaveCount(3)
    await expect(cards(page).nth(1)).toContainText('원문 <상품> & 알림'); await expect(cards(page).nth(1).getByRole('link')).toHaveCount(0)
    await expect(cards(page).nth(0).getByRole('link', { name: '주문 #901 보기', exact: true })).toHaveAttribute('href', '/orders/901')
    await expect(cards(page).nth(2).getByRole('link', { name: '관련 상품 보기', exact: true })).toHaveAttribute('href', '/products/7')
    expect(writes(s)).toEqual([])
    await cards(page).first().getByRole('button', { name: '읽음으로 표시', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(cards(page).first().getByText('읽음', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '알림', exact: true })).toBeFocused()
    expect(writes(s)[0].method).toBe('PUT'); expect(writes(s)[0].body).toBeNull()
    await page.getByRole('button', { name: '현재 페이지 읽음', exact: true }).click(); await expect(page.getByRole('button', { name: '현재 페이지 읽음', exact: true })).toBeDisabled(); await expect(badge(page)).toHaveCount(0)
    expect(writes(s)[1].body).toEqual({ ids: [uuid(2), uuid(4)] }); expect(s.notes.member.every((n) => n.readAt !== null)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width === 390) await info.attach('notifications-390.png', { body: await page.screenshot(), contentType: 'image/png' })
    await cards(page).first().getByRole('link', { name: '주문 #901 보기', exact: true }).click(); await expect(page.getByRole('heading', { name: '데모 주문 상세', exact: true })).toBeVisible()
    await page.goBack(); await expect(cards(page)).toHaveCount(3); expect(writes(s)).toHaveLength(2)
  })
}
test('guest는 알림 읽기/쓰기를 하지 않고 원래 알림주소로 로그인 복귀', async ({ page, notifications: s }) => {
  s.user = null; await page.goto('/notifications?page=2'); await expect(page.getByRole('heading', { name: '다시 만나 반가워요', exact: true })).toBeVisible()
  expect(new URL(page.url()).searchParams.get('redirect')).toBe('/notifications?page=2'); expect(s.calls.filter((c) => c.path.startsWith('/api/users/me/notifications'))).toEqual([])
})
test('cold UI로그인 직후 홈 헤더 수량을 읽고 계정 값을 디스크에 남기지 않음', async ({ page, notifications: s }) => {
  s.user = null; await signIn(page, 'member', '/'); await expect(badge(page)).toHaveText('2')
  expect(await page.evaluate(() => Object.keys(localStorage).some((k) => /notification|account|member/.test(k)))).toBe(false)
})
test('목록/현재페이지 읽음은 URL페이지와 보이지 않은 항목을 보존', async ({ page, notifications: s }) => {
  s.notes.member = Array.from({ length: 23 }, (_, i) => note(i + 1)); await page.goto('/notifications?page=2&from=header'); await expect(cards(page)).toHaveCount(3)
  await page.getByRole('button', { name: '현재 페이지 읽음', exact: true }).click(); await expect(cards(page).first().getByText('읽음', { exact: true })).toBeVisible()
  expect(s.notes.member.slice(0, 20).every((n) => n.readAt === null)).toBe(true); expect(writes(s)[0].body.ids).toEqual([uuid(21), uuid(22), uuid(23)])
  await page.getByRole('button', { name: '이전', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(page).toHaveURL('/notifications?page=1&from=header'); await expect(cards(page)).toHaveCount(20)
  await expect(page.getByRole('heading', { name: '알림', exact: true })).toBeFocused(); await page.goBack(); await expect(cards(page)).toHaveCount(3)
})
test('잘못된 페이지는 추정목록을 요청하지 않고 직접 고칠 수 있음', async ({ page, notifications: s }) => {
  await page.goto('/notifications?page=0'); await expect(page.getByRole('heading', { name: '페이지 번호를 확인해 주세요', exact: true })).toBeVisible()
  expect(s.calls.filter((c) => c.path === '/api/users/me/notifications').every((c) => c.query.size === '1')).toBe(true)
  await page.getByRole('button', { name: '첫 알림 페이지 보기', exact: true }).click(); await expect(cards(page)).toHaveCount(2)
})
test('범위를 넘는 페이지는 현재 마지막 페이지로 고치며 빈목록으로 오인하지 않음', async ({ page }) => {
  await page.goto('/notifications?page=5'); await expect(page).toHaveURL('/notifications?page=1'); await expect(cards(page)).toHaveCount(2)
})
test('받은 알림이 없는 계정은 실제 빈목록을 표시', async ({ page, notifications: s }) => {
  s.notes.member = []; await page.goto('/notifications'); await expect(page.getByRole('heading', { name: '아직 받은 알림이 없습니다', exact: true })).toBeVisible(); await expect(badge(page)).toHaveCount(0); expect(writes(s)).toEqual([])
})
for (const status of [404, 503]) test(`일반 ${status} 읽기실패는 빈 알림/미지원으로 바꾸지 않고 같은페이지에서 복구`, async ({ page, notifications: s }) => {
  s.readStatus = status; await page.goto('/notifications?from=error'); await expect(page.getByRole('heading', { name: '알림을 불러오지 못했습니다', exact: true })).toBeVisible(); await expect(cards(page)).toHaveCount(0); await expect(badge(page)).toHaveCount(0)
  s.readStatus = 0; await page.getByRole('button', { name: '알림 새로고침', exact: true }).click(); await expect(cards(page)).toHaveCount(2); await expect(badge(page)).toHaveText('2'); await expect(page).toHaveURL('/notifications?from=error')
})
for (const kind of ['GET', 'PUT', 'POST']) test(`${kind}401은 헤더와 개인목록을 함께 차폐하고 명시 재확인`, async ({ page, notifications: s }) => {
  await page.goto('/notifications'); await expect(cards(page)).toHaveCount(2); await expect(badge(page)).toHaveText('2')
  if (kind === 'GET') { s.readStatus = 401; await page.getByRole('button', { name: '알림 새로고침', exact: true }).click() }
  else { s.writeStatus = 401; await (kind === 'PUT' ? cards(page).first().getByRole('button', { name: '읽음으로 표시', exact: true }) : page.getByRole('button', { name: '현재 페이지 읽음', exact: true })).click() }
  await expect(cards(page)).toHaveCount(0); await expect(badge(page)).toHaveCount(0); await expect(page.getByText('원문 <상품> & 알림')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '알림 로그인 상태 다시 확인', exact: true })).toBeVisible(); s.readStatus = 0; s.writeStatus = 0
  await page.getByRole('button', { name: '알림 로그인 상태 다시 확인', exact: true }).click(); await expect(cards(page)).toHaveCount(2); await expect(badge(page)).toHaveText('2')
})
test('묶음404 일부실패를 성공처럼 표시하지 않고 원래페이지/미확인 상태를 보존', async ({ page, notifications: s }) => {
  await page.goto('/notifications?from=batch'); await expect(cards(page)).toHaveCount(2); s.writeStatus = 404
  await page.getByRole('button', { name: '현재 페이지 읽음', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('읽음으로 표시하지 못했습니다'); expect(s.notes.member.every((n) => n.readAt === null)).toBe(true)
  await expect(page).toHaveURL('/notifications?from=batch'); s.writeStatus = 0; await page.getByRole('button', { name: '알림 새로고침', exact: true }).click(); await page.getByRole('button', { name: '현재 페이지 읽음', exact: true }).click(); await expect(badge(page)).toHaveCount(0)
})
test('읽음 응답503 뒤 새로고침은 기존 최초 readAt을 보존하고 자동재전송하지 않음', async ({ page, notifications: s }) => {
  await page.goto('/notifications'); await expect(cards(page)).toHaveCount(2); s.afterWriteStatus = 503
  await cards(page).first().getByRole('button', { name: '읽음으로 표시', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('결과를 확인하지 못했습니다'); const readAt = s.notes.member[0].readAt
  expect(writes(s)).toHaveLength(1); await page.getByRole('button', { name: '알림 새로고침', exact: true }).click(); await expect(cards(page).first().getByText('읽음', { exact: true })).toBeVisible(); expect(s.notes.member[0].readAt).toBe(readAt); expect(writes(s)).toHaveLength(1)
})
for (const status of [200, 401]) test(`지연 A 목록${status}는 B/ABA 새 로그인에 알림/수량을 노출하지 않음`, async ({ page, notifications: s }) => {
  const g = gate(); let started = false
  await page.route('**/api/users/me/notifications?**', async (route) => {
    const u = new URL(route.request().url()); if (u.searchParams.get('size') !== '20' || started) return route.fallback()
    started = true; await g.promise; await route.fulfill({ status, json: status === 200 ? ok({ items: s.notes.member, page: 1, size: 20, total: 2, totalPages: 1, hasNext: false, unreadCount: 2 }) : bad('UNAUTHORIZED') })
  })
  try {
    await page.goto('/notifications'); await expect.poll(() => started).toBe(true); await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await signIn(page, 'other'); await expect(page.getByRole('heading', { name: '아직 받은 알림이 없습니다', exact: true })).toBeVisible()
    g.release(); await expect(cards(page)).toHaveCount(0); await expect(badge(page)).toHaveCount(0); await expect(page.getByRole('button', { name: '알림 로그인 상태 다시 확인', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '로그아웃', exact: true }).click(); s.notes.member = [note(5)]; await signIn(page, 'member'); await expect(cards(page)).toHaveCount(1); await expect(badge(page)).toHaveText('1')
  } finally { g.release() }
})
test('이전페이지의 늦은 읽음 응답은 새 URL·현재 목록·전역 알림을 덮지 않음', async ({ page, notifications: s }) => {
  s.notes.member = Array.from({ length: 22 }, (_, i) => note(i + 1)); const g = gate(); let started = false
  await page.route('**/api/users/me/notifications/read', async (route) => { started = true; await g.promise; await route.fallback() })
  try {
    await page.goto('/notifications'); await expect(cards(page)).toHaveCount(20); await page.getByRole('button', { name: '현재 페이지 읽음', exact: true }).click(); await expect.poll(() => started).toBe(true)
    await page.getByRole('button', { name: '다음', exact: true }).click(); await expect(page).toHaveURL('/notifications?page=2'); g.release(); await expect(cards(page)).toHaveCount(2)
    await expect(page.getByText('현재 페이지의 알림을 읽음으로 표시했습니다.', { exact: true })).toHaveCount(0); await expect(cards(page).first().getByText('읽지 않음', { exact: true })).toBeVisible()
  } finally { g.release() }
})
test('초기 인증 읽기 전에는 알림 GET/개인 수를 노출하지 않음', async ({ page, notifications: s }) => {
  const g = gate(); let started = false
  await page.route('**/api/auth/me', async (route) => { started = true; await g.promise; await route.fallback() })
  try { await page.goto('/notifications'); await expect.poll(() => started).toBe(true); await expect(cards(page)).toHaveCount(0); await expect(badge(page)).toHaveCount(0); expect(s.calls.filter((c) => c.path.startsWith('/api/users/me/notifications'))).toEqual([]); g.release(); await expect(cards(page)).toHaveCount(2) }
  finally { g.release() }
})
test('인증503은 guest/빈알림으로 바꾸지 않고 재확인 뒤 현재목록을 읽음', async ({ page, notifications: s }) => {
  s.meStatus = 503; await page.goto('/notifications'); await expect(page.getByRole('heading', { name: '로그인 상태를 확인하지 못했습니다', exact: true })).toBeVisible()
  expect(s.calls.filter((c) => c.path.startsWith('/api/users/me/notifications'))).toEqual([]); s.meStatus = 0; await page.getByRole('button', { name: '알림 로그인 상태 다시 확인', exact: true }).click(); await expect(cards(page)).toHaveCount(2)
})
test('지연 헤더401도 먼저 보인 개인목록 전체를 차폐', async ({ page }) => {
  const g = gate(); let started = false
  await page.route('**/api/users/me/notifications?**', async (route) => { if (new URL(route.request().url()).searchParams.get('size') !== '1') return route.fallback(); started = true; await g.promise; await route.fulfill({ status: 401, json: bad('UNAUTHORIZED') }) })
  try { await page.goto('/notifications'); await expect(cards(page)).toHaveCount(2); await expect.poll(() => started).toBe(true); g.release(); await expect(cards(page)).toHaveCount(0); await expect(badge(page)).toHaveCount(0); await expect(page.getByRole('button', { name: '알림 로그인 상태 다시 확인', exact: true })).toBeVisible() }
  finally { g.release() }
})
test('저장후401은 자동 읽음재전송 없이 인증확인 뒤 최초readAt을 다시 조회', async ({ page, notifications: s }) => {
  await page.goto('/notifications'); await expect(cards(page)).toHaveCount(2); s.afterWriteStatus = 401
  await cards(page).first().getByRole('button', { name: '읽음으로 표시', exact: true }).click(); await expect(cards(page)).toHaveCount(0); await expect(badge(page)).toHaveCount(0); const readAt = s.notes.member[0].readAt
  await page.getByRole('button', { name: '알림 로그인 상태 다시 확인', exact: true }).click(); await expect(cards(page).first().getByText('읽음', { exact: true })).toBeVisible(); await expect(badge(page)).toHaveText('1'); expect(s.notes.member[0].readAt).toBe(readAt); expect(writes(s)).toHaveLength(1)
})
for (const status of [200, 401]) test(`지연 A 읽음${status}의 HTTP가 A→B→A 인증세대를 넘어도 새화면을 침범하지 않음`, async ({ page, notifications: s }) => {
  const g = gate(); let started = false
  await page.route('**/api/users/me/notifications/*/read', async (route) => {
    const r = route.request(); s.calls.push({ path: new URL(r.url()).pathname, method: r.method(), owner: r.headers()['x-pubburi-account-owner'], body: r.postData() ? r.postDataJSON() : null, query: {} })
    started = true; await g.promise
    if (status === 200) { s.notes.member[0].readAt = 1794100010000; await route.fulfill({ json: ok({ items: [{ id: uuid(1), readAt: 1794100010000 }], unreadCount: 1 }) }) }
    else await route.fulfill({ status: 401, json: bad('UNAUTHORIZED') })
  })
  try {
    await page.goto('/notifications'); await expect(cards(page)).toHaveCount(2); await cards(page).first().getByRole('button', { name: '읽음으로 표시', exact: true }).click(); await expect.poll(() => started).toBe(true)
    await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await signIn(page, 'other'); await expect(page.getByRole('heading', { name: '아직 받은 알림이 없습니다', exact: true })).toBeVisible(); await expect(badge(page)).toHaveCount(0)
    await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await signIn(page, 'member'); await expect(cards(page)).toHaveCount(0); g.release(); await expect(cards(page)).toHaveCount(2)
    await expect(badge(page)).toHaveText(status === 200 ? '1' : '2'); await expect(page.getByRole('button', { name: '알림 로그인 상태 다시 확인', exact: true })).toHaveCount(0); await expect(page.getByText('알림을 읽음으로 표시했습니다.', { exact: true })).toHaveCount(0); expect(writes(s)).toHaveLength(1)
  } finally { g.release() }
})
test('canonical owner는 비ASCII/기호 계정에서도 직접 percent encode한 현재 본인', async ({ page, notifications: s }) => {
  const id = '회원 /%@'; s.user = user(id); s.notes[id] = [note(1)]; await page.goto('/notifications'); await expect(cards(page)).toHaveCount(1)
  await page.getByRole('button', { name: '현재 페이지 읽음', exact: true }).click(); await expect(badge(page)).toHaveCount(0)
  expect(s.calls.filter((c) => c.path.startsWith('/api/users/me/notifications')).every((c) => c.owner === encodeURIComponent(id))).toBe(true)
})
test('명시 legacy marker404만 미지원으로 표시하고 일반 오류와 구분', async ({ page }) => {
  await page.route('**/api/users/me/notifications?**', (route) => route.fulfill({ status: 404, json: bad('NOTIFICATIONS_NOT_SUPPORTED') }))
  await page.goto('/notifications'); await expect(page.getByRole('heading', { name: '현재 서버는 내부 알림을 지원하지 않습니다', exact: true })).toBeVisible(); await expect(cards(page)).toHaveCount(0); await expect(badge(page)).toHaveCount(0)
})
