import { beforeEach, describe, expect, it } from 'vitest'
import { createQueryClient } from '../queries'
import { usePreferenceWrites } from './preferenceWrites'

describe('계정 캐시와 분리한 미완료 취향 쓰기 수명', () => {
  beforeEach(() => usePreferenceWrites.setState({ owners: new Map() }))
  it('로그인 캐시 초기화가 미완료 요청을 없애지 않고 다른 계정은 독립적이다', () => {
    const client = createQueryClient()
    const writes = usePreferenceWrites.getState()
    const owner = writes.begin('member')!
    client.setQueryData(['session'], { id: 'member' })
    client.clear()
    client.setQueryData(['session'], { id: 'member' })
    expect(writes.begin('member')).toBeNull()
    const other = writes.begin('other')!
    expect(other).toBeTypeOf('symbol')
    writes.finish('member', owner)
    expect(usePreferenceWrites.getState().owners.has('member')).toBe(false)
    expect(usePreferenceWrites.getState().owners.has('other')).toBe(true)
    writes.finish('other', other)
    expect(usePreferenceWrites.getState().owners.size).toBe(0)
  })
  it('이전 요청이나 다른 소유자의 finally가 현재 요청을 해제하지 못한다', () => {
    const writes = usePreferenceWrites.getState()
    const first = writes.begin('member')!
    writes.finish('member', Symbol())
    expect(writes.begin('member')).toBeNull()
    writes.finish('member', first)
    const second = writes.begin('member')!
    writes.finish('member', first)
    expect(writes.begin('member')).toBeNull()
    writes.finish('member', second)
    expect(usePreferenceWrites.getState().owners.size).toBe(0)
  })
})
