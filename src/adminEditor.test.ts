import { describe, expect, it, vi } from 'vitest'
import { createQueryClient } from './queries'
import { publishAdminDeletion, reconcileDeletedEditor, subscribeAdminDeletion, type EditorDraft } from './adminEditor'

type Item = { id: string }
type Draft = EditorDraft<{ name: string }, Item>
const empty = (): Draft => ({ form: { name: '' }, editing: null, revision: Symbol() })
const idOf = (item: Item) => item.id
const event = (revision: symbol) => ({ auth: {}, account: {}, actor: 'admin', tab: 'users', id: 'target', revision })

describe('성공 삭제와 현재 편집 revision', () => {
  it('삭제를 제출한 그대로의 같은 편집만 초기화한다', () => {
    const revision = Symbol()
    const current: Draft = { form: { name: '원래 입력' }, editing: { id: 'target' }, revision }
    const next = reconcileDeletedEditor(current, event(revision), idOf, empty)
    expect(next.editing).toBeNull()
    expect(next.form.name).toBe('')
  })
  it('같은 대상의 새 revision은 입력을 유지하고 죽은 ID 저장을 차단하는 상태가 된다', () => {
    const old = Symbol()
    const current: Draft = { form: { name: '새 입력' }, editing: { id: 'target' }, revision: Symbol() }
    const next = reconcileDeletedEditor(current, event(old), idOf, empty)
    expect(next.form).toBe(current.form)
    expect(next.editing).toBe(current.editing)
    expect(next.revision).toBe(current.revision)
    expect(next.deleted).toBe(true)
  })
  it('값이 같아도 다시 연 편집은 별도 의도여서 지우지 않는다', () => {
    const current: Draft = { form: { name: '같은 값' }, editing: { id: 'target' }, revision: Symbol() }
    const next = reconcileDeletedEditor(current, event(Symbol()), idOf, empty)
    expect(next.form.name).toBe('같은 값')
    expect(next.deleted).toBe(true)
  })
  for (const editing of [null, { id: 'other' }]) {
    it(`${editing ? '다른 행' : '새 작성'}의 초안은 객체 그대로 보존한다`, () => {
      const current: Draft = { form: { name: '보존할 입력' }, editing, revision: Symbol() }
      expect(reconcileDeletedEditor(current, event(current.revision), idOf, empty)).toBe(current)
    })
  }
  it('삭제 사실은 현재 client의 활성 listener에만 전달하고 재구독에 재생하지 않는다', () => {
    const first = createQueryClient(), second = createQueryClient()
    const active = vi.fn(), other = vi.fn(), remounted = vi.fn()
    const stop = subscribeAdminDeletion(first, active)
    const stopOther = subscribeAdminDeletion(second, other)
    publishAdminDeletion(first, event(Symbol()))
    expect(active).toHaveBeenCalledTimes(1)
    expect(other).not.toHaveBeenCalled()
    stop()
    const stopNew = subscribeAdminDeletion(first, remounted)
    expect(remounted).not.toHaveBeenCalled()
    publishAdminDeletion(first, event(Symbol()))
    expect(active).toHaveBeenCalledTimes(1)
    expect(remounted).toHaveBeenCalledTimes(1)
    stopOther(); stopNew(); first.clear(); second.clear()
  })
})
