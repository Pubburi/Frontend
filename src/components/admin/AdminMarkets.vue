<template>
  <section class="admin-panel">
    <div class="admin-section-heading">
      <div><h2>매장 관리</h2><p>매장명과 위치 정보를 관리합니다.</p></div>
      <span class="result-count">총 {{ admin.marketsPage.total }}개</span>
    </div>
    <form class="admin-form" @submit.prevent="saveMarket">
      <label class="field-group"><span>매장명</span><input v-model.trim="form.name" class="form-control" maxlength="100" required /></label>
      <label class="field-group"><span>위도</span><input v-model.number="form.latitude" type="number" step="0.000001" min="-90" max="90" class="form-control" required /></label>
      <label class="field-group"><span>경도</span><input v-model.number="form.longitude" type="number" step="0.000001" min="-180" max="180" class="form-control" required /></label>
      <label class="field-group"><span>이미지 경로 <small>(선택)</small></span><input v-model.trim="form.image" class="form-control" maxlength="200" /></label>
      <div class="admin-form-actions">
        <button type="submit" class="btn btn-dark" :disabled="ui.isPending('admin-market-save')">{{ form.id ? '변경 저장' : '매장 등록' }}</button>
        <button type="button" class="btn btn-outline-secondary" @click="resetForm">{{ form.id ? '편집 취소' : '초기화' }}</button>
      </div>
    </form>

    <LoadingSkeleton v-if="ui.isPending('admin-markets')" :count="4" />
    <div v-else-if="admin.markets.length" class="admin-table">
      <div class="table-row table-head"><span>ID</span><span>매장명</span><span>위치</span><span>작업</span></div>
      <div v-for="market in admin.markets" :key="market.id" class="table-row">
        <span data-label="ID">{{ market.id }}</span>
        <strong data-label="매장명">{{ market.name }}</strong>
        <span data-label="위치">{{ Number(market.latitude).toFixed(5) }}, {{ Number(market.longitude).toFixed(5) }}</span>
        <div class="button-row table-actions" data-label="작업">
          <button type="button" class="btn btn-sm btn-outline-dark" @click="editMarket(market)">편집</button>
          <button type="button" class="btn btn-sm btn-outline-danger" @click="pendingDelete = market">삭제</button>
        </div>
      </div>
    </div>
    <EmptyState v-else title="등록된 매장이 없습니다" />
    <PaginationBar :page="admin.marketsPage" @change="changePage" />
  </section>

  <ConfirmDialog
    :open="Boolean(pendingDelete)"
    title="매장을 삭제할까요?"
    :description="`${pendingDelete?.name || ''} 매장 정보가 삭제됩니다.`"
    :pending="ui.isPending('admin-market-delete')"
    @cancel="pendingDelete = null"
    @confirm="deleteMarket"
  />
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import EmptyState from '../ui/EmptyState.vue'
import LoadingSkeleton from '../ui/LoadingSkeleton.vue'
import PaginationBar from '../ui/PaginationBar.vue'
import { useAdminStore } from '../../stores/admin'
import { useCatalogStore } from '../../stores/catalog'
import { useUiStore } from '../../stores/ui'

const admin = useAdminStore()
const catalog = useCatalogStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const form = reactive({ id: null, name: '', latitude: 0, longitude: 0, image: '' })
const pendingDelete = ref(null)

watch(() => route.query.page, (page) => loadPage(Math.max(1, Number.parseInt(page, 10) || 1)), { immediate: true })

function loadPage(page) {
  return ui.run('admin-markets', () => admin.loadMarkets({ page }))
}

function changePage(page) {
  router.push({ name: 'admin', query: { tab: 'markets', page } })
}

function editMarket(market) {
  Object.assign(form, { ...market })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function resetForm() {
  Object.assign(form, { id: null, name: '', latitude: 0, longitude: 0, image: '' })
}

async function saveMarket() {
  const result = await ui.run('admin-market-save', async () => {
    await admin.saveMarket({ ...form })
    await catalog.loadMarkets()
  }, { success: '매장이 저장되었습니다.' })
  if (result.ok) resetForm()
}

async function deleteMarket() {
  if (!pendingDelete.value) return
  const result = await ui.run('admin-market-delete', async () => {
    await admin.deleteMarket(pendingDelete.value.id)
    await catalog.loadMarkets()
  }, { success: '매장이 삭제되었습니다.' })
  if (result.ok) pendingDelete.value = null
}
</script>
