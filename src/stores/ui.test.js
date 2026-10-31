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
})
