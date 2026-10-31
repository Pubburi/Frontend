import { defineStore } from 'pinia'
import { api } from '../services/api'

const emptyPage = () => ({ items: [], page: 1, size: 10, total: 0, totalPages: 0, hasNext: false })
let sessionRequest = null

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    profile: null,
    ordersPage: emptyPage(),
    authMode: 'login',
    initialized: false,
  }),
  getters: {
    isAdmin: (state) => state.user?.role === 'ADMIN',
    profileOrders: (state) => state.ordersPage.items,
  },
  actions: {
    async ensureSession() {
      if (this.initialized) return this.user
      if (!sessionRequest) {
        sessionRequest = api.me().catch(() => null)
      }
      this.user = await sessionRequest
      this.initialized = true
      sessionRequest = null
      return this.user
    },
    async refreshMe() {
      this.initialized = false
      return this.ensureSession()
    },
    async login(payload) {
      this.user = await api.login(payload)
      this.initialized = true
      await Promise.all([this.loadProfile(), this.loadOrders()])
      return this.user
    },
    async join(payload) {
      return api.join(payload)
    },
    async logout() {
      await api.logout()
      this.user = null
      this.profile = null
      this.ordersPage = emptyPage()
      this.initialized = true
    },
    async loadProfile() {
      if (!this.user) return null
      this.profile = await api.profile(this.user.id)
      return this.profile
    },
    async loadOrders(params = {}) {
      if (!this.user) return this.ordersPage
      this.ordersPage = await api.userOrders(this.user.id, { page: 1, size: 10, ...params })
      return this.ordersPage
    },
  },
})
