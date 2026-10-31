import { create } from 'zustand'

export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const fields =
      'fields' in error && error.fields && typeof error.fields === 'object'
        ? Object.values(error.fields).filter(Boolean).join(', ')
        : ''
    if (fields) return fields
    if ('message' in error) return String(error.message)
  }
  return String(error)
}
type Result<T> = { ok: true; data: T } | { ok: false; error: unknown }
interface UiState {
  notice: { type: 'success' | 'error'; message: string } | null
  pending: Record<string, boolean>
  clear: () => void
  status: (message: string) => void
  error: (error: unknown) => void
  run: <T>(
    key: string,
    action: () => Promise<T>,
    success?: string,
  ) => Promise<Result<T>>
}
export const useUi = create<UiState>((set, get) => ({
  notice: null,
  pending: {},
  clear: () => set({ notice: null }),
  status: (message) => set({ notice: { type: 'success', message } }),
  error: (error) =>
    set({ notice: { type: 'error', message: errorMessage(error) } }),
  async run(key, action, success) {
    if (get().pending[key])
      return { ok: false, error: new Error('이미 처리 중인 요청입니다.') }
    set({ pending: { ...get().pending, [key]: true }, notice: null })
    try {
      const data = await action()
      if (success) get().status(success)
      return { ok: true, data }
    } catch (error) {
      get().error(error)
      return { ok: false, error }
    } finally {
      const next = { ...get().pending }
      delete next[key]
      set({ pending: next })
    }
  },
}))
