<template>
  <section class="view home-view">
    <section class="hero-carousel" aria-roledescription="carousel" aria-label="추천 주류">
      <div v-for="(image, index) in carouselImages" :key="image" class="hero-slide" :class="{ active: index === activeIndex }" :aria-hidden="index !== activeIndex">
        <ImageWithFallback :src="image" alt="" :loading="index === 0 ? 'eager' : 'lazy'" />
      </div>
      <div class="hero-copy">
        <p>오늘의 주류 셀렉션</p>
        <h1>취향과 순간에 어울리는 한 잔</h1>
        <span>가볍게 즐기는 맥주부터 천천히 음미하는 위스키까지 만나보세요.</span>
        <RouterLink class="btn btn-light hero-cta" to="/products">전체 주류 둘러보기</RouterLink>
      </div>
      <button class="carousel-control prev" type="button" aria-label="이전 배너" @click="previousSlide"><span aria-hidden="true">‹</span></button>
      <button class="carousel-control next" type="button" aria-label="다음 배너" @click="nextSlide"><span aria-hidden="true">›</span></button>
      <div class="carousel-dots" aria-label="배너 선택">
        <button
          v-for="(_, index) in carouselImages"
          :key="index"
          type="button"
          :class="{ active: index === activeIndex }"
          :aria-label="`${index + 1}번 배너 보기`"
          :aria-current="index === activeIndex ? 'true' : undefined"
          @click="activeIndex = index"
        ></button>
      </div>
    </section>

    <section class="section-band">
      <div class="section-heading">
        <div>
          <p class="section-kicker">Category</p>
          <h2>주종으로 빠르게 찾기</h2>
          <p class="muted heading-description">모든 주종을 같은 자리에서 비교해 보세요.</p>
        </div>
        <RouterLink class="btn btn-outline-dark btn-sm" to="/products">전체 보기</RouterLink>
      </div>
      <div class="category-strip">
        <button v-for="category in categories" :key="category.label" type="button" @click="filterCategory(category.label)">
          <ImageWithFallback :src="category.image" :alt="category.label" />
          <span>{{ category.label }}</span>
        </button>
      </div>
    </section>

    <section class="section-band">
      <div class="section-heading">
        <div>
          <p class="section-kicker">Popular</p>
          <h2>지금 많이 찾는 술</h2>
        </div>
        <RouterLink class="text-link" :to="{ name: 'products', query: { sort: 'popular' } }">더 보기 →</RouterLink>
      </div>
      <LoadingSkeleton v-if="ui.isPending('home-products')" :count="4" />
      <div v-else-if="catalog.popularProducts.length" class="product-grid">
        <ProductCard v-for="product in catalog.popularProducts" :key="product.id" :product="product" @add="addToCart" />
      </div>
      <EmptyState v-else :icon="popularError ? '!' : '✦'" :title="popularError ? '추천 상품을 불러오지 못했습니다' : '추천 상품을 준비하고 있습니다'" description="잠시 후 다시 확인해 주세요.">
        <button v-if="popularError" type="button" class="btn btn-outline-dark" @click="loadPopular">다시 시도</button>
      </EmptyState>
    </section>

    <section class="section-band">
      <div class="section-heading">
        <div>
          <p class="section-kicker">Stores</p>
          <h2>주점부리 매장</h2>
          <p class="muted heading-description">가까운 매장의 위치 정보를 확인하세요.</p>
        </div>
      </div>
      <LoadingSkeleton v-if="ui.isPending('home-markets')" :count="3" label="매장 정보를 불러오는 중입니다." />
      <div v-else-if="catalog.markets.length" class="market-grid">
        <article v-for="market in catalog.markets" :key="market.id" class="market-row">
          <div>
            <span class="eyebrow">Store {{ market.id }}</span>
            <strong>{{ market.name }}</strong>
          </div>
          <span class="muted">{{ Number(market.latitude).toFixed(5) }}, {{ Number(market.longitude).toFixed(5) }}</span>
        </article>
      </div>
      <EmptyState v-else :icon="marketsError ? '!' : '◌'" :title="marketsError ? '매장 정보를 불러오지 못했습니다' : '등록된 매장이 없습니다'" description="새로운 매장 정보를 준비하고 있습니다.">
        <button v-if="marketsError" type="button" class="btn btn-outline-dark" @click="loadMarkets">다시 시도</button>
      </EmptyState>
    </section>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ProductCard from '../components/product/ProductCard.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import ImageWithFallback from '../components/ui/ImageWithFallback.vue'
import LoadingSkeleton from '../components/ui/LoadingSkeleton.vue'
import { carouselImages, categories, useCatalogStore } from '../stores/catalog'
import { useCartStore } from '../stores/cart'
import { useUiStore } from '../stores/ui'

const catalog = useCatalogStore()
const cart = useCartStore()
const ui = useUiStore()
const router = useRouter()
const activeIndex = ref(0)
const popularError = ref(null)
const marketsError = ref(null)

onMounted(() => {
  Promise.all([loadPopular(), loadMarkets()])
})

async function loadPopular() {
  const result = await ui.run('home-products', () => catalog.loadPopularProducts())
  popularError.value = result.ok ? null : result.error
}

async function loadMarkets() {
  const result = await ui.run('home-markets', () => catalog.loadMarkets(), { clear: false })
  marketsError.value = result.ok ? null : result.error
}

function filterCategory(type) {
  router.push({ name: 'products', query: { type, sort: 'popular', page: 1 } })
}

function previousSlide() {
  activeIndex.value = (activeIndex.value + carouselImages.length - 1) % carouselImages.length
}

function nextSlide() {
  activeIndex.value = (activeIndex.value + 1) % carouselImages.length
}

function addToCart(product) {
  cart.add(product)
  ui.setStatus(`${product.name}을(를) 장바구니에 담았습니다.`)
}
</script>
