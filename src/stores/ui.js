import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
  state: () => ({
    notice: null,
    pending: {},
  }),
  getters: {
    status: (state) => (state.notice?.type === 'success' ? state.notice.message : ''),
    error: (state) => (state.notice?.type === 'error' ? state.notice.message : ''),
  },
  actions: {
    clear() {
      this.notice = null
    },
    setStatus(message) {
      this.notice = message ? { type: 'success', message } : null
    },
    setError(error) {
      const fields = error?.fields ? Object.values(error.fields).filter(Boolean).join(', ') : ''
      this.notice = { type: 'error', message: fields || error?.message || String(error) }
    },
    isPending(key) {
      return Boolean(this.pending[key])
    },
    async run(key, action, options = {}) {
      if (this.isPending(key)) {
        return { ok: false, error: new Error('이미 처리 중인 요청입니다.') }
      }
      this.pending[key] = true
      if (options.clear !== false) this.clear()
      try {
        const data = await action()
        if (options.success) this.setStatus(options.success)
        return { ok: true, data }
      } catch (error) {
        this.setError(error)
        return { ok: false, error }
      } finally {
        delete this.pending[key]
      }
    },
  },
})
