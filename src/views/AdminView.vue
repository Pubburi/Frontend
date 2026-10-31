<template>
  <section class="view admin-layout">
    <div class="shop-intro compact-intro">
      <div>
        <p class="section-kicker">Operations</p>
        <h1>관리자 센터</h1>
        <p>상품, 매장, 주문과 회원 데이터를 한 곳에서 관리합니다.</p>
      </div>
      <button type="button" class="btn btn-outline-dark btn-sm" :disabled="ui.isPending('admin-refresh')" @click="refresh">현재 탭 새로고침</button>
    </div>

    <nav class="admin-tabs" aria-label="관리 메뉴">
      <button v-for="tab in adminTabs" :key="tab.key" type="button" :class="{ active: admin.tab === tab.key }" @click="selectTab(tab.key)">
        {{ tab.label }}
      </button>
    </nav>

    <AdminProducts v-if="admin.tab === 'products'" />
    <AdminMarkets v-else-if="admin.tab === 'markets'" />
    <AdminOrders v-else-if="admin.tab === 'orders'" />
    <AdminComments v-else-if="admin.tab === 'comments'" />
    <AdminUsers v-else />
  </section>
</template>

<script setup>
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminComments from '../components/admin/AdminComments.vue'
import AdminMarkets from '../components/admin/AdminMarkets.vue'
import AdminOrders from '../components/admin/AdminOrders.vue'
import AdminProducts from '../components/admin/AdminProducts.vue'
import AdminUsers from '../components/admin/AdminUsers.vue'
import { adminTabs, useAdminStore } from '../stores/admin'
import { useUiStore } from '../stores/ui'

const admin = useAdminStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const tabKeys = adminTabs.map((tab) => tab.key)

watch(
  () => route.query.tab,
  (tab) => {
    admin.tab = tabKeys.includes(tab) ? tab : 'products'
  },
  { immediate: true },
)

function selectTab(tab) {
  router.push({ name: 'admin', query: { tab, page: 1 } })
}

function refresh() {
  const page = Math.max(1, Number.parseInt(route.query.page, 10) || 1)
  return ui.run('admin-refresh', () => admin.loadActive({ page }))
}
</script>
