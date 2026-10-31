import { defineStore } from 'pinia'
import { api } from '../services/api'

const emptyPage = (size = 12) => ({ items: [], page: 1, size, total: 0, totalPages: 0, hasNext: false })

export const carouselImages = [
  '/images/carousel/banner1.webp',
  '/images/carousel/banner2.webp',
  '/images/carousel/banner3.webp',
  '/images/carousel/banner4.webp',
  '/images/carousel/banner5.webp',
  '/images/carousel/banner6.webp',
]

export const categories = [
  { image: '/images/category/탁주.webp', label: '탁주' },
  { image: '/images/category/청주.webp', label: '약 · 청주' },
  { image: '/images/category/과실주.webp', label: '과실주' },
  { image: '/images/category/증류주.webp', label: '증류주' },
  { image: '/images/category/맥주.webp', label: '맥주' },
  { image: '/images/category/양주.webp', label: '양주' },
  { image: '/images/category/위스키.webp', label: '위스키' },
  { image: '/images/category/사케.webp', label: '사케' },
]

export const useCatalogStore = defineStore('catalog', {
  state: () => ({
    productsPage: emptyPage(12),
    popularProducts: [],
    marketsPage: emptyPage(12),
    selectedProduct: null,
    commentsPage: emptyPage(10),
    filters: { type: '', q: '', sort: 'popular', page: 1, size: 12 },
  }),
  getters: {
    products: (state) => state.productsPage.items,
    markets: (state) => state.marketsPage.items,
    comments: (state) => state.commentsPage.items,
  },
  actions: {
    async loadProducts(params = {}) {
      this.filters = { ...this.filters, ...params }
      this.productsPage = await api.products(this.filters)
      return this.productsPage
    },
    async loadPopularProducts() {
      this.popularProducts = await api.popularProducts()
      return this.popularProducts
    },
    async loadMarkets(params = {}) {
      this.marketsPage = await api.markets({ page: 1, size: 12, ...params })
      return this.marketsPage
    },
    async loadProduct(id) {
      this.selectedProduct = null
      this.selectedProduct = await api.product(id)
      return this.selectedProduct
    },
    async loadComments(productId, params = {}) {
      this.commentsPage = await api.comments(productId, { page: 1, size: 10, ...params })
      return this.commentsPage
    },
    async createComment(payload) {
      const comment = await api.createComment(payload)
      await this.loadComments(payload.productId)
      return comment
    },
    async updateComment(commentId, payload) {
      const comment = await api.updateComment(commentId, payload)
      await this.loadComments(this.selectedProduct.id, { page: this.commentsPage.page })
      return comment
    },
    async deleteComment(commentId) {
      await api.deleteComment(commentId)
      const nextPage = this.comments.length === 1 && this.commentsPage.page > 1 ? this.commentsPage.page - 1 : this.commentsPage.page
      await this.loadComments(this.selectedProduct.id, { page: nextPage })
    },
    clearProduct() {
      this.selectedProduct = null
      this.commentsPage = emptyPage(10)
    },
  },
})
