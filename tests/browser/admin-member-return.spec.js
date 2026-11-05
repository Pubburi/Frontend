import { expect, test as base } from '@playwright/test'

// Authored admin/member envelopes; actual Backend acceptance is separate.
const admin = { id: 'operator', name: '운영 관리자', role: 'ADMIN', stamps: 0 }
const members = Array.from({ length: 21 }, (_, i) => ({ id: `member-${String(i).padStart(2, '0')}`, name: `관리 표본 ${i}`, role: 'USER', stamps: i }))
const ok = (data) => ({ data, message: 'ok', error: null })
const bad = (status) => ({ data: null, message: null, error: { code: status === 401 ? 'UNAUTHORIZED' : status === 400 ? 'BAD_REQUEST' : 'SERVICE_UNAVAILABLE', message: '관리 fixture 응답' } })
const test = base.extend({
  memberApi: [async ({ page }, use) => {
    const s = { user: admin, members: structuredClone(members), calls: [], errors: [], unexpected: [], status: 200, gates: [] }
    s.hold = (method, path) => { let release; const wait = new Promise((resolve) => { release = resolve }); const gate = { method, path, wait, release, started: false }; s.gates.push(gate); return gate }
    page.on('pageerror', (error) => s.errors.push(error.message))
    await page.route('**/api/**', async (route) => {
      const request = route.request(), url = new URL(request.url()), method = request.method(), path = url.pathname
      const body = method === 'PUT' || method === 'POST' ? request.postDataJSON() : undefined
      s.calls.push({ method, path, query: [...url.searchParams], body })
      const gate = s.gates.find((g) => g.method === method && g.path === path && !g.started)
      if (gate) { gate.started = true; await gate.wait }
      if (method === 'GET' && path === '/api/auth/me') return route.fulfill({ status: s.user ? 200 : 401, json: s.user ? ok(s.user) : bad(401) })
      if (method === 'POST' && path === '/api/auth/logout') { s.user = null; return route.fulfill({ json: ok(true) }) }
      if (method === 'POST' && path === '/api/auth/login') { s.user = { ...admin, id: body.id }; return route.fulfill({ json: ok(s.user) }) }
      if (method === 'GET' && path === '/api/products/popular') return route.fulfill({ json: ok([]) })
      if (method === 'GET' && path === '/api/markets') return route.fulfill({ json: ok({ items: [], total: 0, size: 12, page: 1, totalPages: 0, hasNext: false }) })
      if (method === 'GET' && path === '/api/admin/users') {
        const current = Number(url.searchParams.get('page') || 1), size = 20, total = s.members.length
        return route.fulfill({ json: ok({ items: s.members.slice((current - 1) * size, current * size), total, size, page: current, totalPages: Math.ceil(total / size), hasNext: current * size < total }) })
      }
      if (method === 'PUT' && path.startsWith('/api/admin/users/')) {
        if (s.status !== 200) return route.fulfill({ status: s.status, json: bad(s.status) })
        const id = decodeURIComponent(path.split('/').at(-1)); s.members = s.members.map((m) => m.id === id ? { ...m, ...body } : m)
        if (s.user?.id === id) s.user = { ...s.user, ...body }
        return route.fulfill({ json: ok(s.members.find((m) => m.id === id)) })
      }
      s.unexpected.push({ method, path }); return route.fulfill({ status: 501, json: bad(501) })
    })
    try { await use(s) } finally { s.gates.forEach((g) => g.release()); expect(s.errors).toEqual([]); expect(s.unexpected).toEqual([]) }
  }, { auto: true }],
})
const row = (page, id = 'member-07') => page.locator('.admin-table .table-row').filter({ has: page.getByText(id, { exact: true }) })
const edit = (page, id = 'member-07') => row(page, id).getByRole('button', { name: '편집', exact: true })
const form = (page) => page.locator('form.admin-form')
async function open(page, width) {
  await page.setViewportSize({ width, height: 900 }); await page.goto('/admin?tab=users&page=1&context=owned')
  await expect(edit(page)).toBeVisible(); await edit(page).focus(); await edit(page).press('Enter')
  await expect(form(page).getByLabel('이름', { exact: true })).toBeFocused()
}
async function returned(page, info, action, width) {
  const observed = { action, width, expectedRowFocused: await edit(page).evaluate((el) => el === document.activeElement), active: await page.evaluate(() => ({ tag: document.activeElement.tagName, row: document.activeElement.closest('.table-row')?.querySelector('[data-label="ID"]')?.textContent })) }
  await page.keyboard.press('Tab')
  observed.nextTab = await page.evaluate(() => ({ tag: document.activeElement.tagName, text: document.activeElement.textContent, row: document.activeElement.closest('.table-row')?.querySelector('[data-label="ID"]')?.textContent }))
  await info.attach('member-return.json', { body: JSON.stringify(observed), contentType: 'application/json' })
  await info.attach('member-return.png', { body: await page.screenshot(), contentType: 'image/png' })
  expect(observed.expectedRowFocused).toBe(true)
  await expect(row(page).getByRole('button', { name: '삭제', exact: true })).toBeFocused()
  const geometry = await row(page).getByRole('button', { name: '삭제', exact: true }).evaluate((el) => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom, header: document.querySelector('.topbar').getBoundingClientRect().bottom }))
  expect(geometry.top).toBeGreaterThanOrEqual(geometry.header); expect(geometry.bottom).toBeLessThanOrEqual(900)
}

for (const width of [1280, 390]) for (const action of ['cancel', 'save']) test(`member-return-baseline: ${action} 후 현재 회원 목록으로 키보드 연결 ${width}px`, async ({ page, memberApi }, info) => {
  await open(page, width)
  await form(page).getByLabel('이름', { exact: true }).fill('수정한 회원 이름')
  const button = form(page).getByRole('button', { name: action === 'cancel' ? '편집 취소' : '변경 저장', exact: true })
  await button.focus(); await button.press('Enter'); await expect(form(page)).toHaveCount(0)
  await expect(row(page)).toContainText(action === 'cancel' ? '관리 표본 7' : '수정한 회원 이름')
  await returned(page, info, action, width)
  expect(memberApi.calls.filter((c) => c.method === 'PUT')).toHaveLength(action === 'cancel' ? 0 : 1)
  await expect(page).toHaveURL('/admin?tab=users&page=1&context=owned')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
})

for (const width of [1280, 390]) for (const label of ['이름', '스탬프']) test(`implicit Enter: ${label} 입력에서 저장해도 같은 회원으로 복귀 ${width}px`, async ({ page, memberApi }, info) => {
  await open(page, width)
  await form(page).getByLabel('이름', { exact: true }).fill('Enter로 저장한 이름')
  await form(page).getByLabel('스탬프', { exact: true }).fill('12')
  await form(page).getByLabel(label, { exact: true }).focus(); await form(page).getByLabel(label, { exact: true }).press('Enter')
  await expect(form(page)).toHaveCount(0); await expect(row(page)).toContainText('Enter로 저장한 이름')
  await returned(page, info, `implicit-${label}`, width)
  expect(memberApi.calls.filter((c) => c.method === 'PUT')).toHaveLength(1)
})

const save = (page) => form(page).getByRole('button', { name: '변경 저장', exact: true })
const memberTab = (page) => page.getByRole('navigation', { name: '관리 메뉴', exact: true }).getByRole('button', { name: '회원', exact: true })
async function keyboardSave(page) { await save(page).focus(); await save(page).press('Enter') }
async function settle(page, gate, method = 'PUT', path = '/api/admin/users/member-07') {
  const response = page.waitForResponse((r) => r.request().method() === method && new URL(r.url()).pathname === path)
  gate.release(); await (await response).finished(); await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
}

test('required 검증은 입력에 머물고 실패 응답은 초안 보존·명시 재저장만 수행', async ({ page, memberApi }) => {
  await open(page, 390)
  const name = form(page).getByLabel('이름', { exact: true }); await name.fill(''); await keyboardSave(page)
  await expect(name).toBeFocused(); expect(memberApi.calls.filter((c) => c.method === 'PUT')).toHaveLength(0)
  await name.fill('재시도할 이름'); memberApi.status = 400; await keyboardSave(page)
  await expect(page.getByRole('alert')).toContainText('입력한 내용을 다시 확인해 주세요.')
  await expect(name).toHaveValue('재시도할 이름'); await expect(form(page)).toBeFocused()
  expect(memberApi.calls.filter((c) => c.method === 'PUT')).toHaveLength(1)
  memberApi.status = 200; await keyboardSave(page); await expect(form(page)).toHaveCount(0)
  await expect(edit(page)).toBeFocused(); await expect(row(page)).toContainText('재시도할 이름')
})

test('저장 대기 중 새 입력·다른 회원 편집은 늦은 성공의 초기화/복귀 대상이 아님', async ({ page, memberApi }) => {
  await open(page, 1280)
  const gate = memberApi.hold('PUT', '/api/admin/users/member-07')
  try {
    await form(page).getByLabel('이름', { exact: true }).fill('서버 제출 이름'); await keyboardSave(page)
    await expect.poll(() => gate.started).toBe(true); await expect(form(page)).toBeFocused()
    await edit(page, 'member-08').focus(); await edit(page, 'member-08').press('Enter')
    const name = form(page).getByLabel('이름', { exact: true }); await name.fill('다른 회원 새 초안')
    await settle(page, gate); await expect(name).toHaveValue('다른 회원 새 초안'); await expect(name).toBeFocused()
    await expect(form(page)).toContainText('member-08 회원')
    expect(memberApi.calls.filter((c) => c.method === 'PUT').map((c) => c.path)).toEqual(['/api/admin/users/member-07'])
  } finally { gate.release() }
})

for (const phase of ['write', 'refresh']) test(`저장 ${phase} 대기 중 다른 조작의 포커스를 늦은 완료가 훔치지 않음`, async ({ page, memberApi }) => {
  await open(page, 1280)
  const gate = memberApi.hold(phase === 'write' ? 'PUT' : 'GET', phase === 'write' ? '/api/admin/users/member-07' : '/api/admin/users')
  try {
    await keyboardSave(page); await expect.poll(() => gate.started).toBe(true)
    const target = memberTab(page); await target.focus()
    await settle(page, gate, phase === 'write' ? 'PUT' : 'GET', phase === 'write' ? '/api/admin/users/member-07' : '/api/admin/users')
    await expect(form(page)).toHaveCount(0); await expect(target).toBeFocused()
  } finally { gate.release() }
})

for (const action of ['cancel', 'save']) test(`편집하던 행이 목록에서 사라진 ${action}은 현재 회원 제목으로 복귀`, async ({ page, memberApi }) => {
  await open(page, 390)
  if (action === 'cancel') {
    memberApi.members = memberApi.members.filter((m) => m.id !== 'member-07')
    await page.getByRole('button', { name: '현재 탭 새로고침', exact: true }).click(); await expect(row(page)).toHaveCount(0)
    const cancel = form(page).getByRole('button', { name: '편집 취소', exact: true }); await cancel.focus(); await cancel.press('Enter')
  } else {
    const gate = memberApi.hold('GET', '/api/admin/users')
    try {
      await keyboardSave(page); await expect.poll(() => gate.started).toBe(true)
      memberApi.members = memberApi.members.filter((m) => m.id !== 'member-07')
      await settle(page, gate, 'GET', '/api/admin/users')
    } finally { gate.release() }
  }
  await expect(form(page)).toHaveCount(0); await expect(page.getByRole('heading', { name: '회원 관리', exact: true })).toBeFocused()
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: '현재 탭 새로고침', exact: true })).toBeFocused()
})

for (const departure of ['page', 'route', 'sameURL']) test(`늦은 저장은 ${departure} 이동의 URL·목록·포커스를 되돌리지 않음`, async ({ page, memberApi }) => {
  await open(page, 1280)
  if (departure === 'sameURL') { await memberTab(page).click(); await expect(page).toHaveURL('/admin?tab=users&page=1'); await edit(page).focus(); await edit(page).press('Enter') }
  const gate = memberApi.hold('PUT', '/api/admin/users/member-07')
  try {
    await keyboardSave(page); await expect.poll(() => gate.started).toBe(true)
    if (departure === 'page') {
      await page.getByRole('button', { name: '다음', exact: true }).click(); await expect(page).toHaveURL('/admin?tab=users&page=2')
      await expect(row(page, 'member-20')).toBeVisible(); await memberTab(page).focus()
    } else if (departure === 'sameURL') await memberTab(page).click()
    else { await page.locator('header').getByRole('link', { name: '장바구니', exact: true }).click(); await expect(page).toHaveURL(/\/cart$/) }
    const current = page.url(), target = departure === 'route' ? page.locator('header').getByRole('link', { name: '장바구니', exact: true }) : memberTab(page)
    await expect(target).toBeFocused(); await settle(page, gate)
    await expect(page).toHaveURL(current); await expect(target).toBeFocused()
    if (departure === 'page') await expect(row(page, 'member-20')).toBeVisible()
  } finally { gate.release() }
})

for (const account of ['operator', 'other-operator']) test(`${account} 재로그인 뒤 새 회원 초안/포커스는 이전 HTTP 수명과 분리`, async ({ page, memberApi }) => {
  await open(page, 1280)
  const gate = memberApi.hold('PUT', '/api/admin/users/member-07')
  try {
    await keyboardSave(page); await expect.poll(() => gate.started).toBe(true)
    await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await expect(page).toHaveURL('/')
    await page.goBack(); await expect(page.getByLabel('아이디', { exact: true })).toBeVisible()
    await page.getByLabel('아이디', { exact: true }).fill(account); await page.getByLabel('비밀번호', { exact: true }).fill('fixture-pass'); await page.getByLabel('비밀번호', { exact: true }).press('Enter')
    await expect(edit(page)).toBeVisible(); await edit(page).focus(); await edit(page).press('Enter')
    const name = form(page).getByLabel('이름', { exact: true }); await name.fill('새 인증 세대의 입력')
    await settle(page, gate); await expect(name).toHaveValue('새 인증 세대의 입력'); await expect(name).toBeFocused()
    await expect(page.locator('header')).toContainText('운영 관리자님')
  } finally { gate.release() }
})

test('pointer/script 취소는 다른 현재 조작으로 포커스를 강제 복귀하지 않음', async ({ page }) => {
  await open(page, 1280)
  const target = memberTab(page); await target.focus()
  await form(page).getByRole('button', { name: '편집 취소', exact: true }).evaluate((el) => el.click())
  await expect(form(page)).toHaveCount(0); await expect(target).toBeFocused()
})

for (const action of ['pointer', 'script-click', 'requestSubmit']) test(`${action} 저장을 새 키보드 의도로 오인하지 않음`, async ({ page, memberApi }) => {
  await open(page, 1280)
  const name = form(page).getByLabel('이름', { exact: true }); await name.fill('명시 저장 이름')
  if (action === 'pointer') await save(page).click()
  else if (action === 'script-click') { await name.focus(); await save(page).evaluate((el) => el.click()) }
  else {
    // A blocked native submission must not leave an intent for a later programmatic one.
    await name.evaluate((el) => el.setCustomValidity('fixture validation boundary')); await name.press('Enter')
    expect(memberApi.calls.filter((c) => c.method === 'PUT')).toHaveLength(0)
    await name.evaluate((el) => el.setCustomValidity(''))
    await save(page).evaluate((el) => el.form.requestSubmit(el))
  }
  await expect(form(page)).toHaveCount(0); await expect(row(page)).toContainText('명시 저장 이름')
  await expect(edit(page)).not.toBeFocused(); expect(memberApi.calls.filter((c) => c.method === 'PUT')).toHaveLength(1)
})

test('관리자 본인 정보 갱신의 새 me도 같은 인증 소유 안에서 현재 본인 행으로 복귀', async ({ page, memberApi }, info) => {
  memberApi.members.splice(10, 0, structuredClone(admin))
  await page.setViewportSize({ width: 390, height: 900 }); await page.goto('/admin?tab=users&page=1')
  await edit(page, admin.id).focus(); await edit(page, admin.id).press('Enter')
  await form(page).getByLabel('이름', { exact: true }).fill('이름을 바꾼 관리자'); await keyboardSave(page)
  await expect(form(page)).toHaveCount(0); await expect(page.locator('header')).toContainText('이름을 바꾼 관리자님')
  const observed = { active: await page.evaluate(() => document.activeElement.tagName), currentRowFocused: await edit(page, admin.id).evaluate((el) => el === document.activeElement) }
  await info.attach('self-update-return.json', { body: JSON.stringify(observed), contentType: 'application/json' })
  await expect(edit(page, admin.id)).toBeFocused()
  expect(memberApi.calls.filter((c) => c.method === 'PUT').map((c) => c.path)).toEqual(['/api/admin/users/operator'])
})
