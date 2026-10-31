import { beforeEach, describe, expect, it } from 'vitest'
import { useUi } from './ui'

describe('Zustand mutation ownership', () => {
  beforeEach(() => useUi.setState({ notice: null, pending: {} }))
  it('blocks duplicate writes synchronously and releases only its pending key', async () => {
    let release: (value: string) => void = () => {}
    const writing = useUi.getState().run(
      'checkout',
      () =>
        new Promise<string>((resolve) => {
          release = resolve
        }),
      '접수 완료',
    )
    const duplicate = await useUi.getState().run('checkout', async () => '중복')
    expect(duplicate.ok).toBe(false)
    expect(useUi.getState().pending.checkout).toBe(true)
    await useUi.getState().run('independent', async () => true)
    expect(useUi.getState().pending.checkout).toBe(true)
    release('주문1')
    await expect(writing).resolves.toEqual({ ok: true, data: '주문1' })
    expect(useUi.getState().pending.checkout).toBeUndefined()
    expect(useUi.getState().notice).toEqual({
      type: 'success',
      message: '접수 완료',
    })
  })
  it('keeps field errors visible and permits a verified retry after failure', async () => {
    await useUi.getState().run('save', async () => {
      throw { fields: { name: '이름을 입력하세요' } }
    })
    expect(useUi.getState().notice?.message).toBe('이름을 입력하세요')
    const retry = await useUi.getState().run('save', async () => true)
    expect(retry.ok).toBe(true)
    expect(useUi.getState().pending.save).toBeUndefined()
  })
})
