import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUiStore } from './ui'

describe('ui store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('tracks pending work and returns a stable result shape', async () => {
    const ui = useUiStore()
    let release
    const action = new Promise((resolve) => { release = resolve })
    const running = ui.run('save', () => action, { success: '저장됨' })

    expect(ui.isPending('save')).toBe(true)
    const duplicate = await ui.run('save', () => Promise.resolve('duplicate'))
    expect(duplicate.ok).toBe(false)

    release('done')
    await expect(running).resolves.toEqual({ ok: true, data: 'done' })
    expect(ui.isPending('save')).toBe(false)
    expect(ui.status).toBe('저장됨')
  })

  it('converts rejected actions into error results', async () => {
    const ui = useUiStore()
    const result = await ui.run('load', () => Promise.reject(new Error('실패')))

    expect(result.ok).toBe(false)
    expect(ui.error).toBe('실패')
  })

  it('runs the latest read while an older read is pending and hides its late error', async () => {
    const ui = useUiStore()
    let rejectOld
    const oldRequest = ui.runLatest('products', () => new Promise((resolve, reject) => { rejectOld = reject }))
    const latest = await ui.runLatest('products', () => Promise.resolve('현재 목록'), { success: '현재 조회 완료' })

    expect(latest).toEqual({ ok: true, data: '현재 목록' })
    rejectOld(new Error('이전 조회 실패'))
    await expect(oldRequest).resolves.toEqual({ ok: false, stale: true })
    expect(ui.error).toBe('')
    expect(ui.status).toBe('현재 조회 완료')
    expect(ui.isPending('products')).toBe(false)
  })

  it('keeps the latest loading state when an older read finishes first', async () => {
    const ui = useUiStore()
    let releaseOld
    let releaseLatest
    const oldRequest = ui.runLatest('products', () => new Promise((resolve) => { releaseOld = resolve }))
    const latest = ui.runLatest('products', () => new Promise((resolve) => { releaseLatest = resolve }))

    releaseOld('이전 목록')
    await expect(oldRequest).resolves.toEqual({ ok: false, stale: true })
    expect(ui.isPending('products')).toBe(true)
    releaseLatest('현재 목록')
    await latest
    expect(ui.isPending('products')).toBe(false)
  })

  it('invalidates reads on leaving a screen without overwriting another notice', async () => {
    const ui = useUiStore()
    let rejectOld
    const oldRequest = ui.runLatest('product-detail', () => new Promise((resolve, reject) => { rejectOld = reject }))
    ui.cancelLatest('product-detail')
    ui.setStatus('다른 화면 작업 완료')
    rejectOld(new Error('떠난 화면의 조회 실패'))

    await expect(oldRequest).resolves.toEqual({ ok: false, stale: true })
    expect(ui.status).toBe('다른 화면 작업 완료')
    expect(ui.error).toBe('')
    expect(ui.isPending('product-detail')).toBe(false)
  })
})
