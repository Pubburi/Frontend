import { afterEach, describe, expect, it } from 'vitest'
import { validAccountName, validCurrentPassword, validPassword } from './settings'
import { useAccountWrites } from './state/accountWrites'
import { createQueryClient } from './queries'
import { recentProducts } from './state/recentProducts'
import { useUi } from './state/ui'

afterEach(() => { useAccountWrites.setState({ owners: new Map() }); useUi.setState({ pending: {} }) })
describe('F09 bounded literal input and transient ownership', () => {
  it('keeps literal passwords including spaces and UTF16 lengths', () => {
    expect(validPassword('    ')).toBe(false); expect(validPassword(' ab ')).toBe(true)
    expect(validPassword('abc')).toBe(false); expect(validPassword('a'.repeat(72))).toBe(true); expect(validPassword('a'.repeat(73))).toBe(false); expect(validPassword('a'.repeat(101))).toBe(false)
    expect(validPassword('😀😀')).toBe(true); expect(validCurrentPassword('a')).toBe(true); expect(validCurrentPassword('    ')).toBe(false)
  })
  it('matches the actual provider BCrypt byte ceiling without changing current credential compatibility', () => {
    expect(validPassword('한'.repeat(24))).toBe(true); expect(validPassword('한'.repeat(25))).toBe(false)
    expect(validPassword('😀'.repeat(18))).toBe(true); expect(validPassword('😀'.repeat(19))).toBe(false)
    expect(validCurrentPassword('한'.repeat(30))).toBe(true)
  })
  it('matches Java whitespace for required raw names without trimming literal text', () => {
    expect(validAccountName(' \t\u3000')).toBe(false); expect(validAccountName(' A ')).toBe(true)
    expect(validAccountName('\u00a0')).toBe(true); expect(validAccountName('a'.repeat(100))).toBe(true); expect(validAccountName('a'.repeat(101))).toBe(false)
  })
  it('serializes same-account requests across auth cache clearing; old finally cannot release a later owner', () => {
    const client = createQueryClient(), writes = useAccountWrites.getState()
    const first = writes.begin('a', true)!
    client.clear(); client.setQueryData(['session'], { id: 'a' })
    expect(writes.begin('a', false)).toBeNull(); expect(writes.begin('b', false)).toBeTypeOf('symbol')
    writes.finish('a', Symbol()); expect(writes.begin('a', false)).toBeNull()
    writes.finish('a', first); const second = writes.begin('a', false)!
    writes.finish('a', first); expect(writes.begin('a', true)).toBeNull()
    writes.finish('a', second); expect(useAccountWrites.getState().owners.has('b')).toBe(true); client.clear()
  })
  it('password uncertainty suspends F05 until a read begun after the write settles; overlap/manual cache cannot release it', async () => {
    const client = createQueryClient(), history = recentProducts(client), writes = useAccountWrites.getState()
    await client.fetchQuery({ queryKey: ['session'], queryFn: async () => ({ id: 'a' }) })
    const owner = history.getState().owner!; history.getState().record(owner, 7)
    const token = writes.begin('a', true)!
    expect(history.getState().ready).toBe(false)
    let release!: (value: { id: string }) => void
    const old = client.fetchQuery({ queryKey: ['session'], queryFn: () => new Promise<{id:string}>((resolve) => { release = resolve }) })
    writes.finishAuth('a', token); release({ id: 'a' }); await old; writes.finish('a', token)
    client.setQueryData(['session'], { id: 'a' }); expect(history.getState().ready).toBe(false)
    await client.fetchQuery({ queryKey: ['session'], queryFn: async () => ({ id: 'a' }) })
    expect(history.getState().ready).toBe(true); expect(history.getState().entries.map((entry) => entry.id)).toEqual([7]); client.clear()
  })
})
