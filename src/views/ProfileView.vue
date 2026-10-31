<template>
  <section class="view profile-view">
    <LoadingSkeleton v-if="ui.isPending('profile')" :count="2" label="마이페이지를 불러오는 중입니다." />
    <template v-else-if="auth.user">
      <section class="profile-hero">
        <div>
          <p class="section-kicker">My Pubburi</p>
          <h1>{{ auth.profile?.user?.name || auth.user.name }}님의 취향 기록</h1>
          <p>주문할 때마다 쌓이는 스탬프로 새로운 등급을 만나보세요.</p>
        </div>
        <button type="button" class="btn btn-outline-dark" :disabled="ui.isPending('profile')" @click="loadProfile">새로고침</button>
      </section>

      <section class="grade-card">
        <div class="grade-copy">
          <span class="badge gold-badge">{{ auth.profile?.grade?.title || '회원' }}</span>
          <h2>스탬프 {{ stamps }}개</h2>
          <p v-if="grade.to > 0">다음 등급까지 {{ grade.to }}개 남았어요.</p>
          <p v-else>현재 최고 등급입니다.</p>
        </div>
        <div class="grade-progress" :aria-label="`등급 진행도 ${progress}%`">
          <div><span :style="{ width: `${progress}%` }"></span></div>
          <small>{{ grade.step || 0 }} / {{ grade.stepMax || 0 }}</small>
        </div>
      </section>

      <section class="section-band">
        <div class="section-heading">
          <div>
            <p class="section-kicker">Orders</p>
            <h2>주문 내역</h2>
          </div>
          <span class="muted">총 {{ auth.ordersPage.total }}건</span>
        </div>

        <div v-if="auth.profileOrders.length" class="order-list">
          <article v-for="order in auth.profileOrders" :key="order.oId" class="order-row profile-order-row">
            <div class="order-summary-head">
              <div>
                <span class="eyebrow">Order #{{ order.oId }}</span>
                <strong>{{ orderType(order.orderType) }}</strong>
                <p>
                  <span class="badge" :class="{ muted: order.completed !== 'Y' }">{{ order.completed === 'Y' ? '완료' : '진행 중' }}</span>
                  <span class="muted">{{ date(order.orderTime) }}</span>
                </p>
              </div>
              <strong class="order-total">{{ money(orderTotal(order)) }}원</strong>
            </div>
            <div class="order-items">
              <div v-for="detail in order.details" :key="detail.id" class="order-item-line">
                <span>{{ detail.name }} × {{ detail.quantity }}</span>
                <strong>{{ money(detail.sumPrice) }}원</strong>
              </div>
            </div>
          </article>
          <PaginationBar :page="auth.ordersPage" @change="loadOrders" />
        </div>
        <EmptyState v-else title="아직 주문 내역이 없습니다" description="첫 번째 취향을 발견해 보세요.">
          <RouterLink class="btn btn-dark" to="/products">전체 주류 보기</RouterLink>
        </EmptyState>
      </section>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import EmptyState from '../components/ui/EmptyState.vue'
import LoadingSkeleton from '../components/ui/LoadingSkeleton.vue'
import PaginationBar from '../components/ui/PaginationBar.vue'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import { date, money, orderTotal, orderType } from '../utils/format'

const auth = useAuthStore()
const ui = useUiStore()
const grade = computed(() => auth.profile?.grade || {})
const stamps = computed(() => auth.profile?.user?.stamps ?? auth.user?.stamps ?? 0)
const progress = computed(() => {
  if (!grade.value.stepMax) return grade.value.to === 0 ? 100 : 0
  return Math.min(100, Math.round((Number(grade.value.step || 0) / Number(grade.value.stepMax)) * 100))
})

onMounted(loadProfile)

function loadProfile() {
  return ui.run('profile', () => Promise.all([auth.loadProfile(), auth.loadOrders()]))
}

function loadOrders(page) {
  return ui.run('profile-orders', () => auth.loadOrders({ page }), { clear: false })
}
</script>
