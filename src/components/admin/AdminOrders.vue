<template>
  <section class="admin-panel">
    <div class="admin-section-heading">
      <div><h2>주문 관리</h2><p>주문 구성과 처리 상태를 확인합니다.</p></div>
      <span class="result-count">총 {{ admin.ordersPage.total }}건</span>
    </div>

    <LoadingSkeleton v-if="ui.isPending('admin-orders')" :count="4" />
    <div v-else-if="admin.orders.length" class="admin-table order-admin-table">
      <div class="table-row wide table-head"><span>주문</span><span>회원</span><span>방식</span><span>상태</span><span>금액</span><span>작업</span></div>
      <template v-for="order in admin.orders" :key="order.oId">
        <div class="table-row wide">
          <button type="button" class="text-button order-id" data-label="주문" :aria-expanded="expandedId === order.oId" @click="toggleOrder(order.oId)">#{{ order.oId }} {{ expandedId === order.oId ? '▴' : '▾' }}</button>
          <strong data-label="회원">{{ order.userId }}</strong>
          <span data-label="방식">{{ orderType(order.orderType) }}</span>
          <span data-label="상태" class="badge" :class="{ muted: order.completed !== 'Y' }">{{ order.completed === 'Y' ? '완료' : '진행 중' }}</span>
          <strong data-label="금액">{{ money(orderTotal(order)) }}원</strong>
          <div class="button-row table-actions" data-label="작업">
            <button type="button" class="btn btn-sm btn-outline-dark" :disabled="order.completed === 'Y' || ui.isPending(`admin-order-complete-${order.oId}`)" @click="completeOrder(order.oId)">완료</button>
            <button type="button" class="btn btn-sm btn-outline-danger" @click="pendingDelete = order">삭제</button>
          </div>
        </div>
        <div v-if="expandedId === order.oId" class="admin-order-detail">
          <div class="order-detail-meta">
            <span>주문 시각 {{ date(order.orderTime) }}</span>
            <span v-if="order.orderTable">요청: {{ order.orderTable }}</span>
          </div>
          <div v-for="detail in order.details" :key="detail.id" class="order-item-line">
            <span>{{ detail.name }} · {{ detail.type }} × {{ detail.quantity }}</span>
            <strong>{{ money(detail.sumPrice) }}원</strong>
          </div>
        </div>
      </template>
    </div>
    <EmptyState v-else title="접수된 주문이 없습니다" />
    <PaginationBar :page="admin.ordersPage" @change="changePage" />
  </section>

  <ConfirmDialog
    :open="Boolean(pendingDelete)"
    title="주문을 삭제할까요?"
    :description="`주문 #${pendingDelete?.oId || ''} 내역이 영구적으로 삭제됩니다.`"
    :pending="ui.isPending('admin-order-delete')"
    @cancel="pendingDelete = null"
    @confirm="deleteOrder"
  />
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import EmptyState from '../ui/EmptyState.vue'
import LoadingSkeleton from '../ui/LoadingSkeleton.vue'
import PaginationBar from '../ui/PaginationBar.vue'
import { useAdminStore } from '../../stores/admin'
import { useUiStore } from '../../stores/ui'
import { date, money, orderTotal, orderType } from '../../utils/format'

const admin = useAdminStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const expandedId = ref(null)
const pendingDelete = ref(null)

watch(() => route.query.page, (page) => loadPage(Math.max(1, Number.parseInt(page, 10) || 1)), { immediate: true })

function loadPage(page) {
  expandedId.value = null
  return ui.run('admin-orders', () => admin.loadOrders({ page }))
}

function changePage(page) {
  router.push({ name: 'admin', query: { tab: 'orders', page } })
}

function toggleOrder(id) {
  expandedId.value = expandedId.value === id ? null : id
}

function completeOrder(id) {
  return ui.run(`admin-order-complete-${id}`, () => admin.completeOrder(id), { success: '주문을 완료 처리했습니다.' })
}

async function deleteOrder() {
  if (!pendingDelete.value) return
  const result = await ui.run('admin-order-delete', () => admin.deleteOrder(pendingDelete.value.oId), { success: '주문이 삭제되었습니다.' })
  if (result.ok) pendingDelete.value = null
}
</script>
