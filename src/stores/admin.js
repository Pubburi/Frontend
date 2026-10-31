import { defineStore } from 'pinia'
import { api } from '../services/api'

const emptyPage = (size = 20) => ({ items: [], page: 1, size, total: 0, totalPages: 0, hasNext: false })

export const adminTabs = [
  { key: 'products', label: '상품' },
  { key: 'markets', label: '매장' },
  { key: 'orders', label: '주문' },
  { key: 'comments', label: '댓글' },
  { key: 'users', label: '회원' },
]

export const useAdminStore = defineStore('admin', {
  state: () => ({
    tab: 'products',
    productsPage: emptyPage(),
    marketsPage: emptyPage(),
    ordersPage: emptyPage(),
    commentsPage: emptyPage(),
    usersPage: emptyPage(),
  }),
  getters: {
    products: (state) => state.productsPage.items,
    markets: (state) => state.marketsPage.items,
    orders: (state) => state.ordersPage.items,
    comments: (state) => state.commentsPage.items,
    users: (state) => state.usersPage.items,
  },
  actions: {
    async loadProducts(params = {}) {
      this.productsPage = await api.products({ page: 1, size: 20, type: '', q: '', sort: 'popular', ...params })
      return this.productsPage
    },
    async loadMarkets(params = {}) {
      this.marketsPage = await api.markets({ page: 1, size: 20, ...params })
      return this.marketsPage
    },
    async loadOrders(params = {}) {
      this.ordersPage = await api.adminOrders({ page: 1, size: 20, ...params })
      return this.ordersPage
    },
    async loadComments(params = {}) {
      this.commentsPage = await api.adminComments({ page: 1, size: 20, ...params })
      return this.commentsPage
    },
    async loadUsers(params = {}) {
      this.usersPage = await api.adminUsers({ page: 1, size: 20, ...params })
      return this.usersPage
    },
    async loadActive(params = {}) {
      if (this.tab === 'products') return this.loadProducts(params)
      if (this.tab === 'markets') return this.loadMarkets(params)
      if (this.tab === 'orders') return this.loadOrders(params)
      if (this.tab === 'comments') return this.loadComments(params)
      return this.loadUsers(params)
    },
    async saveProduct(payload) {
      const result = payload.id ? await api.updateProduct(payload.id, payload) : await api.createProduct(payload)
      await this.loadProducts({ page: this.productsPage.page })
      return result
    },
    async deleteProduct(id) {
      await api.deleteProduct(id)
      await this.loadProducts({ page: this.productsPage.page })
    },
    async saveMarket(payload) {
      const result = payload.id ? await api.updateMarket(payload.id, payload) : await api.createMarket(payload)
      await this.loadMarkets({ page: this.marketsPage.page })
      return result
    },
    async deleteMarket(id) {
      await api.deleteMarket(id)
      await this.loadMarkets({ page: this.marketsPage.page })
    },
    async completeOrder(id) {
      await api.completeOrder(id)
      await this.loadOrders({ page: this.ordersPage.page })
    },
    async deleteOrder(id) {
      await api.deleteOrder(id)
      await this.loadOrders({ page: this.ordersPage.page })
    },
    async deleteComment(id) {
      await api.deleteComment(id)
      await this.loadComments({ page: this.commentsPage.page })
    },
    async updateUser(id, payload) {
      await api.updateUser(id, payload)
      await this.loadUsers({ page: this.usersPage.page })
    },
    async deleteUser(id) {
      await api.deleteUser(id)
      await this.loadUsers({ page: this.usersPage.page })
    },
  },
})
