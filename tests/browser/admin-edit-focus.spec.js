import { test as base, expect } from '@playwright/test'

const admin = { id: 'admin', name: '관리자', role: 'ADMIN', stamps: 0 }
const config = {
  products: { path: '/products', first: '상품명', next: '주종', items: [{ id: 901, name: 'P'.repeat(100), type: '맥주', price: 7777, abv: 6.25, img: 'beer1.webp', orderCount: 0 }, { id: 902, name: '두 번째 상품', type: '탁주', price: 6000, abv: 0, img: 'beer1.webp', orderCount: 0 }] },
  markets: { path: '/markets', first: '매장명', next: '위도', items: [{ id: 11, name: 'M'.repeat(100), latitude: 0, longitude: 127.1234567, image: null }, { id: 12, name: '두 번째 매장', latitude: 37.5, longitude: 127.5, image: null }] },
  users: { path: '/admin/users', first: '이름', next: '스탬프', items: [{ id: 'member', name: 'U'.repeat(100), role: 'USER', stamps: 0 }, { id: 'other', name: '두 번째 회원', role: 'USER', stamps: 5 }] },
}
const ok = (data) => ({ data, message: 'ok', error: null })
const bad = (status) => ({ data: null, message: null, error: { code: status === 401 ? 'UNAUTHORIZED' : 'SERVICE_UNAVAILABLE' } })
const pageOf = (items) => ({ items, page: 1, size: 20, total: items.length, totalPages: items.length ? 1 : 0, hasNext: false })
const test = base.extend({
  fixture: [async ({ page }, use) => {
    const s = { user: admin, calls: [], unexpected: [], errors: [], gates: [], rows: structuredClone(config) }
    s.hold = (path, data, status = 200) => { let release; const wait = new Promise((resolve) => { release = resolve }); const gate = { path, data: structuredClone(data), status, wait, release, started: false }; s.gates.push(gate); return gate }
    page.on('pageerror', (error) => s.errors.push(error.message))
    await page.route('**/api/**', async (route) => {
      if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/users/me/cart') return route.fulfill({ status: 404, json: { data: null, error: { code: 'CART_NOT_SUPPORTED' } } })
      const request = route.request(), path = new URL(request.url()).pathname.slice(4), method = request.method(); s.calls.push({ path, method })
      let data, status = 200
      if (method === 'GET' && path === '/auth/me') { data = s.user; status = s.user ? 200 : 401 }
      else if (method === 'POST' && path === '/auth/logout') { s.user = null; data = true }
      else if (method === 'POST' && path === '/auth/login') { s.user = { ...admin, id: request.postDataJSON().id }; data = s.user }
      else if (method === 'GET' && path === '/products/popular') data = []
      else {
        const tab = Object.keys(s.rows).find((tab) => s.rows[tab].path === path)
        if (method === 'GET' && tab) data = pageOf(s.rows[tab].items)
        else { s.unexpected.push({ path, method }); return route.fulfill({ status: 501, json: bad(501) }) }
      }
      const gate = s.gates.find((gate) => gate.path === path && !gate.started)
      if (gate) { gate.started = true; data = gate.data; status = gate.status; await gate.wait }
      await route.fulfill({ status, json: status === 200 ? ok(data) : bad(status) })
    })
    try { await use(s) } finally { s.gates.forEach((gate) => gate.release()); expect(s.errors).toEqual([]); expect(s.unexpected).toEqual([]); expect(s.calls.filter((call) => call.method !== 'GET' && !call.path.startsWith('/auth/'))).toEqual([]) }
  }, { auto: true }],
})
const form = (page) => page.locator('form.admin-form')
const first = (page, tab) => form(page).getByRole('textbox', { name: config[tab].first, exact: true })
const next = (page, tab) => form(page).getByRole(tab === 'products' ? 'combobox' : 'spinbutton', { name: config[tab].next, exact: true })
const edit = (page, index = 0) => page.locator('.admin-table .table-row').filter({ has: page.getByRole('button', { name: '편집', exact: true }) }).nth(index).getByRole('button', { name: '편집', exact: true })
async function open(page, tab) { await page.goto(`/admin?tab=${tab}&page=1`); await expect(edit(page)).toBeVisible() }
async function longNameLayout(page, tab) {
  return edit(page).locator('..').locator('..').evaluate((row) => {
    const rect = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } }
    const name = row.querySelector(':scope > strong'), range = document.createRange(); range.selectNodeContents(name)
    const style = getComputedStyle(name)
    return { width: document.documentElement.scrollWidth, viewport: innerWidth, name: name.textContent, nameBox: rect(name), cells: [...row.children].filter((node) => node !== name).map(rect), fragments: [...range.getClientRects()].map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })), style: { textOverflow: style.textOverflow, overflow: style.overflow, visibility: style.visibility }, controls: [...row.querySelectorAll('button'), ...document.querySelectorAll('form.admin-form input,form.admin-form select,form.admin-form button')].map(rect) }
  })
}
function expectLongNameFits(layout, expectedName, width) {
  expect(layout.name).toBe(expectedName); expect(layout.width).toBeLessThanOrEqual(width)
  expect(layout.style.textOverflow).not.toBe('ellipsis'); expect(['hidden', 'clip']).not.toContain(layout.style.overflow); expect(layout.style.visibility).toBe('visible')
  for (const box of [...layout.fragments, ...layout.controls]) { expect(box.left).toBeGreaterThanOrEqual(-0.5); expect(box.right).toBeLessThanOrEqual(width + 0.5) }
  for (const box of layout.controls) { expect(box.width).toBeGreaterThan(0); expect(box.height).toBeGreaterThan(0) }
  for (const box of layout.fragments) {
    expect(box.left).toBeGreaterThanOrEqual(layout.nameBox.left - 0.5); expect(box.right).toBeLessThanOrEqual(layout.nameBox.right + 0.5)
    expect(layout.cells.some((cell) => Math.min(box.right, cell.right) - Math.max(box.left, cell.left) > 0.5 && Math.min(box.bottom, cell.bottom) - Math.max(box.top, cell.top) > 0.5)).toBe(false)
  }
}

for (const width of [1280, 390]) {
  test(`100자 회원 ID를 목록·편집·삭제 확인에서 잘림 없이 표시 ${width}px`, async ({ page, fixture }, info) => {
    const id = 'a'.repeat(100)
    fixture.rows.users.items[0].id = id
    await page.setViewportSize({ width, height: 900 })
    await open(page, 'users')
    const observations = {}
    const assertFits = async (surface, target, expected) => {
      await expect(target).toHaveText(expected)
      const layout = await target.evaluate((node) => {
        const range = document.createRange()
        range.selectNodeContents(node)
        const bounds = node.getBoundingClientRect()
        const row = node.closest('.table-row')
        const adjacent = row ? [...row.children].filter((child) => child !== node).map((child) => child.getBoundingClientRect()) : []
        const fragments = [...range.getClientRects()]
        const style = getComputedStyle(node)
        return {
          documentWidth: document.documentElement.scrollWidth,
          lines: new Set(fragments.map((fragment) => fragment.top)).size,
          fullyVisible: style.visibility === 'visible' && style.textOverflow !== 'ellipsis' && !['hidden', 'clip'].includes(style.overflowX)
            && fragments.every((fragment) => fragment.left >= Math.max(0, bounds.left) - 0.5 && fragment.right <= Math.min(innerWidth, bounds.right) + 0.5),
          overlaps: fragments.some((fragment) => adjacent.some((cell) => Math.min(fragment.right, cell.right) - Math.max(fragment.left, cell.left) > 0.5
            && Math.min(fragment.bottom, cell.bottom) - Math.max(fragment.top, cell.top) > 0.5)),
        }
      })
      observations[surface] = layout
    }
    const row = page.locator('.admin-table .table-row').filter({ has: page.getByText(id, { exact: true }) })
    const remove = row.getByRole('button', { name: '삭제', exact: true })
    await assertFits('list', row.locator('[data-label="ID"]'), id)
    await edit(page).focus(); await edit(page).press('Enter'); await expect(first(page, 'users')).toBeFocused()
    await assertFits('edit', form(page).locator('.form-context strong'), `${id} 회원`)
    const cancel = form(page).getByRole('button', { name: '편집 취소', exact: true })
    await cancel.focus(); await cancel.press('Enter'); await expect(edit(page)).toBeFocused()
    await page.keyboard.press('Tab'); await expect(remove).toBeFocused(); await remove.press('Enter')
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeFocused()
    await assertFits('delete', dialog.locator('p').last(), `선택한 회원 #${id} 정보를 삭제합니다.`)
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(remove).toBeFocused()
    await info.attach('long-member-id-layout.json', { body: JSON.stringify(observations), contentType: 'application/json' })
    for (const [surface, layout] of Object.entries(observations)) {
      expect(layout.documentWidth, surface).toBe(width)
      expect(layout.lines, surface).toBeGreaterThan(1)
      expect(layout.fullyVisible, surface).toBe(true)
      expect(layout.overlaps, surface).toBe(false)
    }
  })
}

for (const tab of Object.keys(config)) {
  for (const width of [1280, 390]) {
    test(`keyboard entry ${tab} at${width} connects first current field and nextTab without submitting`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 }); await open(page, tab)
      const listLayout = await longNameLayout(page, tab)
      await edit(page).focus(); await edit(page).press('Enter'); await expect(first(page, tab)).toHaveValue(config[tab].items[0].name); await expect(first(page, tab)).toBeFocused()
      const geometry = await first(page, tab).evaluate((node) => { const box = node.getBoundingClientRect(), header = document.querySelector('.topbar').getBoundingClientRect(); return { top: box.top, bottom: box.bottom, header: header.bottom, height: innerHeight, width: document.documentElement.scrollWidth } })
      await info.attach('keyboard-form-geometry.json', { body: JSON.stringify(geometry), contentType: 'application/json' }); expect(geometry.top).toBeGreaterThanOrEqual(geometry.header); expect(geometry.bottom).toBeLessThanOrEqual(geometry.height)
      await page.keyboard.press('Tab'); await expect(next(page, tab)).toBeFocused()
      const editorLayout = await longNameLayout(page, tab)
      await info.attach('long-name-layout.json', { body: JSON.stringify({ list: listLayout, editor: editorLayout }), contentType: 'application/json' })
      expectLongNameFits(listLayout, config[tab].items[0].name, width); expectLongNameFits(editorLayout, config[tab].items[0].name, width)
      await first(page, tab).focus(); await page.keyboard.press('End'); await expect(first(page, tab)).toHaveValue(config[tab].items[0].name)
      expect(await first(page, tab).evaluate((node) => node.selectionStart)).toBe(100)
    })
    test(`normal-name ${tab} input and document fit${width} with current keyboard focus`, async ({ page, fixture }, info) => {
      fixture.rows[tab].items = fixture.rows[tab].items.map((item, index) => ({ ...item, name: `편집 표본 ${index}` }))
      await page.setViewportSize({ width, height: 900 }); await open(page, tab); await edit(page).focus(); await edit(page).press('Enter'); await expect(first(page, tab)).toBeFocused()
      const geometry = await first(page, tab).evaluate((node) => { const box = node.getBoundingClientRect(), header = document.querySelector('.topbar').getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, header: header.bottom, height: innerHeight, width: document.documentElement.scrollWidth } })
      await info.attach('normal-form-geometry.json', { body: JSON.stringify(geometry), contentType: 'application/json' }); expect(geometry.top).toBeGreaterThanOrEqual(geometry.header); expect(geometry.bottom).toBeLessThanOrEqual(geometry.height); expect(geometry.left).toBeGreaterThanOrEqual(0); expect(geometry.right).toBeLessThanOrEqual(width); expect(geometry.width).toBeLessThanOrEqual(width)
      await page.keyboard.press('Tab'); await expect(next(page, tab)).toBeFocused()
    })
  }
  test(`pointer entry ${tab} preserves its existing trigger focus`, async ({ page }) => {
    await open(page, tab); await edit(page).click(); await expect(first(page, tab)).toHaveValue(config[tab].items[0].name); await expect(edit(page)).toBeFocused()
  })
  test(`off-focus script entry ${tab} does not take focus from another control`, async ({ page }) => {
    await open(page, tab); const refresh = page.getByRole('button', { name: '현재 탭 새로고침', exact: true }); await refresh.focus(); await edit(page).evaluate((node) => node.click()); await expect(first(page, tab)).toHaveValue(config[tab].items[0].name); await expect(refresh).toBeFocused()
  })
  test(`repeated row/Space entry ${tab} owns each current draft,not the old field value`, async ({ page }) => {
    await open(page, tab); await edit(page).focus(); await edit(page).press('Space'); await expect(first(page, tab)).toBeFocused(); await first(page, tab).fill('다음 입력')
    await edit(page, 1).focus(); await edit(page, 1).press('Enter'); await expect(first(page, tab)).toHaveValue(config[tab].items[1].name); await expect(first(page, tab)).toBeFocused()
    await form(page).getByRole('button', { name: '편집 취소', exact: true }).click(); await edit(page, 1).focus(); await edit(page, 1).press('Enter'); await expect(first(page, tab)).toBeFocused()
  })
  test(`Tab departure during ${tab} refresh is not undone by a later current response`, async ({ page, fixture }) => {
    await open(page, tab); const gate = fixture.hold(config[tab].path, pageOf(config[tab].items))
    await page.getByRole('button', { name: '현재 탭 새로고침', exact: true }).click(); await expect.poll(() => gate.started).toBe(true)
    await edit(page).focus(); await edit(page).press('Enter'); await expect(first(page, tab)).toBeFocused(); await first(page, tab).fill('보존할 초안'); await page.keyboard.press('Tab'); await expect(next(page, tab)).toBeFocused()
    const response = page.waitForResponse((response) => new URL(response.url()).pathname === `/api${config[tab].path}`); gate.release(); await (await response).finished()
    await expect(first(page, tab)).toHaveValue('보존할 초안'); await expect(next(page, tab)).toBeFocused()
  })
}
