import { afterEach, describe, expect, it, vi } from 'vitest'
import { focusAdminEdit, type AdminEditFocusOwner } from './adminEditFocus'

afterEach(() => { document.body.replaceChildren() })
function fixture() {
  const trigger = document.createElement('button'), input = document.createElement('input'), other = document.createElement('button')
  document.body.append(trigger, input, other); input.scrollIntoView = vi.fn(); trigger.focus()
  const owner: AdminEditFocusOwner = { revision: Symbol(), auth: {}, account: {}, locationKey: 'entry' }
  return { trigger, input, other, intent: { ...owner, trigger }, current: { ...owner, ready: true, input } }
}
describe('admin edit focus commit ownership', () => {
  it('focuses only the current connected first field and makes it visible without a response callback', () => {
    const { intent, current, input } = fixture(); expect(focusAdminEdit(intent, current)).toBe(true); expect(document.activeElement).toBe(input)
    expect(input.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'instant' })
    expect(focusAdminEdit(intent, current)).toBe(false); expect(input.scrollIntoView).toHaveBeenCalledTimes(1)
  })
  it.each(['revision', 'auth', 'account', 'locationKey', 'ready'] as const)('declines a changed %s owner without moving focus or scrolling', (key) => {
    const { intent, current, trigger, input } = fixture()
    const value = key === 'revision' ? Symbol() : key === 'locationKey' ? 'next' : key === 'ready' ? false : {}
    expect(focusAdminEdit(intent, { ...current, [key]: value })).toBe(false); expect(document.activeElement).toBe(trigger); expect(input.scrollIntoView).not.toHaveBeenCalled()
  })
  it('declines pointer/Tab departure and detached or unfocusable nodes', () => {
    const { intent, current, input, other, trigger } = fixture(); other.focus(); expect(focusAdminEdit(intent, current)).toBe(false); expect(document.activeElement).toBe(other)
    trigger.focus(); input.disabled = true; expect(focusAdminEdit(intent, current)).toBe(false); expect(input.scrollIntoView).not.toHaveBeenCalled()
    input.disabled = false; input.remove(); expect(focusAdminEdit(intent, current)).toBe(false)
    document.body.append(input); trigger.remove(); expect(focusAdminEdit(intent, current)).toBe(false)
  })
})
