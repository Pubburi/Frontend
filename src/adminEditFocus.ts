export interface AdminEditFocusOwner {
  revision: symbol
  auth: object | undefined
  account: object | undefined
  locationKey: string
}
export interface AdminEditFocusIntent extends AdminEditFocusOwner {
  trigger: HTMLElement
}
// One explicit keyboard activation owns one commit. The caller consumes the
// intent even when focus/ownership changed, so no later response can reuse it.
export function focusAdminEdit(
  intent: AdminEditFocusIntent,
  current: AdminEditFocusOwner & { ready: boolean; input: HTMLInputElement | null },
) {
  if (!current.ready || !intent.auth || !intent.account || current.auth !== intent.auth || current.account !== intent.account ||
      current.revision !== intent.revision || current.locationKey !== intent.locationKey ||
      !intent.trigger.isConnected || document.activeElement !== intent.trigger || !current.input?.isConnected)
    return false
  current.input.focus({ preventScroll: true })
  if (document.activeElement !== current.input) return false
  current.input.scrollIntoView({ block: 'center', behavior: 'instant' })
  return true
}
