import type { QueryClient } from '@tanstack/react-query'

export interface EditorDraft<Form, Item> {
  form: Form
  editing: Item | null
  revision: symbol
  deleted?: boolean
}
export interface AdminDeletion {
  auth: object
  account: unknown
  actor: string
  tab: string
  id: string | number
  revision: symbol
}

export function reconcileDeletedEditor<Form, Item>(
  current: EditorDraft<Form, Item>,
  deletion: AdminDeletion,
  idOf: (item: Item) => string | number,
  empty: () => EditorDraft<Form, Item>,
): EditorDraft<Form, Item> {
  if (!current.editing || idOf(current.editing) !== deletion.id) return current
  return current.revision === deletion.revision ? empty() : { ...current, deleted: true }
}

// One-shot server deletion facts reach a remounted editor without retaining drafts
// or permanent ID tombstones (an account ID may later be registered again).
const listeners = new WeakMap<QueryClient, Set<(deletion: AdminDeletion) => void>>()
export function subscribeAdminDeletion(client: QueryClient, listener: (deletion: AdminDeletion) => void) {
  let group = listeners.get(client)
  if (!group) { group = new Set(); listeners.set(client, group) }
  group.add(listener)
  return () => {
    group.delete(listener)
    if (!group.size) listeners.delete(client)
  }
}
export function publishAdminDeletion(client: QueryClient, deletion: AdminDeletion) {
  for (const listener of [...(listeners.get(client) || [])]) listener(deletion)
}
