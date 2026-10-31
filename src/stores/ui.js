import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
  state: () => ({
    notice: null,
    pending: {},
    latestVersions: {},
    requestVersion: 0,
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
    async runLatest(key, action, options = {}) {
      const version = ++this.requestVersion
      this.latestVersions[key] = version
      this.pending[key] = true
      const isCurrent = () => this.latestVersions[key] === version
      if (options.clear !== false) this.clear()
      try {
        const data = await action(isCurrent)
        if (!isCurrent()) return { ok: false, stale: true }
        if (options.success) this.setStatus(options.success)
        return { ok: true, data }
      } catch (error) {
        if (!isCurrent()) return { ok: false, stale: true }
        this.setError(error)
        return { ok: false, error }
      } finally {
        if (isCurrent()) delete this.pending[key]
      }
    },
    cancelLatest(key) {
      this.latestVersions[key] = ++this.requestVersion
      delete this.pending[key]
    },
  },
})
