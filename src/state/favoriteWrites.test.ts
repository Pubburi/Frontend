import { beforeEach, describe, expect, it } from 'vitest'
import { createQueryClient } from '../queries'
import { useFavoriteWrites } from './favoriteWrites'
import { favoritesPageKey, favoriteStatusKey } from '../favorites'

describe('계정·상품별 찜 HTTP 소유와 읽기 세대', () => {
  beforeEach(() =>
    useFavoriteWrites.setState({ owners: new Map(), revisions: new Map() }),
  )
  it('같은 상품의 중복·반대 쓰기를 막고 다른 상품과 계정은 독립적으로 허용한다', () => {
    const writes = useFavoriteWrites.getState()
    const first = writes.begin('member', 901)!
    expect(writes.begin('member', 901)).toBeNull()
    const product = writes.begin('member', 902)!
    const other = writes.begin('other', 901)!
    expect(product).toBeTypeOf('symbol')
    expect(other).toBeTypeOf('symbol')
    writes.finish('member', 901, first)
    expect(useFavoriteWrites.getState().owners.get('member')?.has(902)).toBe(
      true,
    )
    expect(useFavoriteWrites.getState().owners.get('other')?.has(901)).toBe(
      true,
    )
  })
  it('캐시 초기화 뒤 같은 계정으로 돌아와도 진행 중인 HTTP를 기다린다', () => {
    const client = createQueryClient()
    const writes = useFavoriteWrites.getState()
    const owner = writes.begin('member', 901)!
    client.setQueryData(['session'], { id: 'member' })
    client.clear()
    client.setQueryData(['session'], { id: 'member' })
    expect(writes.begin('member', 901)).toBeNull()
    writes.finish('member', 901, owner)
    expect(writes.begin('member', 901)).toBeTypeOf('symbol')
  })
  it('해당 HTTP 소유자만 해제하고 완료 전의 늦은 GET은 새 읽기 키와 섞이지 않는다', () => {
    const client = createQueryClient()
    const writes = useFavoriteWrites.getState()
    const owner = writes.begin('member', 901)!
    const previous = favoritesPageKey('member', 1, 0)
    const previousStatus = favoriteStatusKey('member', 901, 0)
    writes.finish('member', 901, Symbol())
    expect(useFavoriteWrites.getState().revisions.size).toBe(0)
    writes.finish('member', 901, owner)
    const revision = useFavoriteWrites.getState().revisions.get('member')!
    expect(revision).toBe(1)
    const current = favoritesPageKey('member', 1, revision)
    const currentStatus = favoriteStatusKey('member', 901, revision)
    client.setQueryData(current, { items: [] })
    client.setQueryData(currentStatus, { productId: 901, favorited: false })
    client.setQueryData(previous, { items: [{ id: 901 }] })
    client.setQueryData(previousStatus, { productId: 901, favorited: true })
    expect(client.getQueryData(current)).toEqual({ items: [] })
    expect(client.getQueryData(currentStatus)).toEqual({
      productId: 901,
      favorited: false,
    })
    const next = writes.begin('member', 901)!
    writes.finish('member', 901, owner)
    expect(writes.begin('member', 901)).toBeNull()
    expect(useFavoriteWrites.getState().revisions.get('member')).toBe(1)
    writes.finish('member', 901, next)
    expect(useFavoriteWrites.getState().revisions.get('member')).toBe(2)
  })
})
