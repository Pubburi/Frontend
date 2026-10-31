<template>
  <section class="view cart-view">
    <div class="shop-intro compact-intro">
      <div>
        <p class="section-kicker">Cart</p>
        <h1>장바구니</h1>
        <p>선택한 상품과 수량을 주문 전에 확인하세요.</p>
      </div>
      <span v-if="cart.items.length" class="result-count">총 <strong>{{ cart.count }}</strong>병</span>
    </div>

    <div v-if="cart.items.length" class="cart-layout">
      <div class="cart-list">
        <article v-for="item in cart.items" :key="item.product.id" class="cart-row">
          <RouterLink :to="`/products/${item.product.id}`" class="cart-image-link">
            <ImageWithFallback :src="productImage(item.product)" :alt="item.product.name" />
          </RouterLink>
          <div class="cart-product-copy">
            <span class="product-type">{{ item.product.type }}</span>
            <RouterLink :to="`/products/${item.product.id}`"><strong>{{ item.product.name }}</strong></RouterLink>
            <p class="muted">병당 {{ money(item.product.price) }}원</p>
          </div>
          <QuantityStepper
            :model-value="item.quantity"
            :label="`${item.product.name} 수량`"
            @update:model-value="cart.setQuantity(item.product.id, $event)"
          />
          <strong class="line-total">{{ money(item.product.price * item.quantity) }}원</strong>
          <button type="button" class="text-button danger-text" :aria-label="`${item.product.name} 삭제`" @click="cart.remove(item.product.id)">삭제</button>
        </article>
      </div>

      <aside class="checkout-card">
        <div>
          <p class="section-kicker">Order Summary</p>
          <h2>주문 요약</h2>
        </div>
        <dl class="summary-list">
          <div><dt>상품 수</dt><dd>{{ cart.count }}병</dd></div>
          <div><dt>상품 금액</dt><dd>{{ money(cart.total) }}원</dd></div>
          <div class="summary-total"><dt>결제 예정 금액</dt><dd>{{ money(cart.total) }}원</dd></div>
        </dl>
        <form class="checkout-form" @submit.prevent="checkout">
          <label class="field-group">
            <span>주문 방식</span>
            <select v-model="cart.orderForm.orderType" class="form-select">
              <option value="TAKEOUT">포장 주문</option>
              <option value="ONLINE">온라인 주문</option>
              <option value="OFFLINE">매장 주문</option>
            </select>
          </label>
          <p class="order-type-help">{{ orderTypeHelp }}</p>
          <label class="field-group">
            <span>테이블 또는 요청 사항 <small>(선택)</small></span>
            <input v-model="cart.orderForm.orderTable" class="form-control" maxlength="20" placeholder="20자 이내로 입력하세요" />
          </label>
          <button type="submit" class="btn btn-dark btn-wide" :disabled="ui.isPending('checkout')">
            {{ ui.isPending('checkout') ? '주문 접수 중…' : `${money(cart.total)}원 주문하기` }}
          </button>
        </form>
      </aside>
    </div>

    <EmptyState v-else icon="♧" title="장바구니가 비어 있습니다" description="다양한 주종을 둘러보고 취향에 맞는 상품을 담아보세요.">
      <RouterLink class="btn btn-dark" to="/products">전체 주류 둘러보기</RouterLink>
    </EmptyState>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import EmptyState from '../components/ui/EmptyState.vue'
import ImageWithFallback from '../components/ui/ImageWithFallback.vue'
import QuantityStepper from '../components/ui/QuantityStepper.vue'
import { useAuthStore } from '../stores/auth'
import { useCartStore } from '../stores/cart'
import { useCatalogStore } from '../stores/catalog'
import { useUiStore } from '../stores/ui'
import { money, productImage } from '../utils/format'

const auth = useAuthStore()
const cart = useCartStore()
const catalog = useCatalogStore()
const ui = useUiStore()
const router = useRouter()

const orderTypeHelp = computed(() => ({
  TAKEOUT: '준비가 완료되면 매장에서 바로 찾아갈 수 있어요.',
  ONLINE: '온라인 주문으로 접수하며 상세 요청은 메모에 남겨주세요.',
  OFFLINE: '매장 테이블에서 주문할 때 테이블 번호를 입력해 주세요.',
}[cart.orderForm.orderType]))

async function checkout() {
  if (!auth.user) {
    ui.setError(new Error('주문하려면 먼저 로그인해 주세요.'))
    await router.push({ name: 'account', query: { redirect: '/cart' } })
    return
  }
  const result = await ui.run(
    'checkout',
    async () => {
      await cart.checkout(auth.user.id)
      await Promise.all([catalog.loadPopularProducts(), auth.loadProfile(), auth.loadOrders()])
    },
    { success: '주문이 접수되었습니다.' },
  )
  if (result.ok) await router.push('/profile')
}
</script>
