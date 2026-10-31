<template>
  <section class="view products-view">
    <div class="shop-intro">
      <div>
        <p class="section-kicker">Bottle Shop</p>
        <h1>전체 주류 둘러보기</h1>
        <p>탁주·청주부터 맥주, 위스키와 사케까지 한 곳에서 비교해 보세요.</p>
      </div>
      <span class="result-count">총 <strong>{{ catalog.productsPage.total }}</strong>개</span>
    </div>

    <form class="filter-panel" role="search" @submit.prevent="applyFilters">
      <label class="field-group">
        <span>주종</span>
        <select v-model="form.type" class="form-select">
          <option value="">전체 주종</option>
          <option v-for="category in categories" :key="category.label" :value="category.label">{{ category.label }}</option>
        </select>
      </label>
      <label class="field-group field-search">
        <span>상품 검색</span>
        <input v-model="form.q" class="form-control" placeholder="상품명 또는 주종을 입력하세요" maxlength="100" />
      </label>
      <label class="field-group">
        <span>정렬</span>
        <select v-model="form.sort" class="form-select">
          <option value="popular">인기순</option>
          <option value="priceAsc">낮은 가격순</option>
          <option value="priceDesc">높은 가격순</option>
          <option value="name">이름순</option>
        </select>
      </label>
      <button type="submit" class="btn btn-dark filter-submit" :disabled="ui.isPending('products')">검색하기</button>
    </form>

    <div v-if="activeFilters.length" class="active-filters" aria-label="적용된 필터">
      <span v-for="filter in activeFilters" :key="filter">{{ filter }}</span>
      <button type="button" class="text-link" @click="resetFilters">전체 해제</button>
    </div>

    <LoadingSkeleton v-if="ui.isPending('products')" :count="8" />
    <EmptyState v-else-if="loadError" icon="!" title="상품을 불러오지 못했습니다" description="연결 상태를 확인한 뒤 다시 시도해 주세요.">
      <button type="button" class="btn btn-dark" @click="loadCurrent">다시 시도</button>
    </EmptyState>
    <div v-else-if="catalog.products.length" class="product-grid">
      <ProductCard v-for="product in catalog.products" :key="product.id" :product="product" @add="addToCart" />
    </div>
    <EmptyState v-else icon="⌕" title="조건에 맞는 상품이 없습니다" description="검색어나 주종을 바꿔 다시 찾아보세요.">
      <button type="button" class="btn btn-outline-dark" @click="resetFilters">모든 상품 보기</button>
    </EmptyState>
    <PaginationBar :page="catalog.productsPage" @change="loadPage" />
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ProductCard from '../components/product/ProductCard.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import LoadingSkeleton from '../components/ui/LoadingSkeleton.vue'
import PaginationBar from '../components/ui/PaginationBar.vue'
import { categories, useCatalogStore } from '../stores/catalog'
import { useCartStore } from '../stores/cart'
import { useUiStore } from '../stores/ui'
import { buildProductQuery, parseProductQuery } from '../utils/productFilters'

const categoryNames = categories.map((category) => category.label)
const route = useRoute()
const router = useRouter()
const catalog = useCatalogStore()
const cart = useCartStore()
const ui = useUiStore()
const form = reactive({ type: '', q: '', sort: 'popular' })
const loadError = ref(null)

const activeFilters = computed(() => [form.type, form.q.trim() ? `검색: ${form.q.trim()}` : ''].filter(Boolean))

watch(
  () => route.query,
  async (query) => {
    const filters = parseProductQuery(query, categoryNames)
    Object.assign(form, { type: filters.type, q: filters.q, sort: filters.sort })
    const result = await ui.run('products', () => catalog.loadProducts(filters))
    loadError.value = result.ok ? null : result.error
  },
  { immediate: true },
)

function routeQuery(page = 1) {
  return buildProductQuery(form, page)
}

function applyFilters() {
  router.push({ name: 'products', query: routeQuery(1) })
}

async function loadCurrent() {
  const result = await ui.run('products', () => catalog.loadProducts(parseProductQuery(route.query, categoryNames)))
  loadError.value = result.ok ? null : result.error
}

function loadPage(page) {
  router.push({ name: 'products', query: routeQuery(page) })
}

function resetFilters() {
  Object.assign(form, { type: '', q: '', sort: 'popular' })
  router.push({ name: 'products', query: { sort: 'popular', page: 1 } })
}

function addToCart(product) {
  cart.add(product)
  ui.setStatus(`${product.name}을(를) 장바구니에 담았습니다.`)
}
</script>
