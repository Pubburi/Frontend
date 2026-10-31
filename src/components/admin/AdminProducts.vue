<template>
  <section class="admin-panel">
    <div class="admin-section-heading">
      <div>
        <h2>상품 관리</h2>
        <p>판매 상품을 등록하고 기본 정보를 수정합니다.</p>
      </div>
      <span class="result-count">총 {{ admin.productsPage.total }}개</span>
    </div>

    <form class="admin-form" @submit.prevent="saveProduct">
      <label class="field-group"><span>상품명</span><input v-model.trim="form.name" class="form-control" maxlength="100" required /></label>
      <label class="field-group">
        <span>주종</span>
        <select v-model="form.type" class="form-select" required>
          <option value="" disabled>주종 선택</option>
          <option v-for="category in categories" :key="category.label" :value="category.label">{{ category.label }}</option>
        </select>
      </label>
      <label class="field-group"><span>가격</span><input v-model.number="form.price" type="number" min="1" class="form-control" required /></label>
      <label class="field-group"><span>이미지 파일명</span><input v-model.trim="form.img" class="form-control" maxlength="100" placeholder="takju1.webp" required /></label>
      <label class="field-group"><span>도수</span><input v-model.number="form.abv" type="number" step="0.1" min="0" max="100" class="form-control" required /></label>
      <label class="field-group"><span>누적 주문 수</span><input v-model.number="form.orderCount" type="number" min="0" class="form-control" required /></label>
      <div class="admin-form-actions">
        <button type="submit" class="btn btn-dark" :disabled="ui.isPending('admin-product-save')">{{ form.id ? '변경 저장' : '상품 등록' }}</button>
        <button type="button" class="btn btn-outline-secondary" @click="resetForm">{{ form.id ? '편집 취소' : '초기화' }}</button>
      </div>
    </form>

    <LoadingSkeleton v-if="ui.isPending('admin-products')" :count="4" />
    <div v-else-if="admin.products.length" class="admin-table">
      <div class="table-row table-head"><span>ID</span><span>상품명</span><span>주종</span><span>가격</span><span>작업</span></div>
      <div v-for="product in admin.products" :key="product.id" class="table-row">
        <span data-label="ID">{{ product.id }}</span>
        <strong data-label="상품명">{{ product.name }}</strong>
        <span data-label="주종">{{ product.type }}</span>
        <span data-label="가격">{{ money(product.price) }}원</span>
        <div class="button-row table-actions" data-label="작업">
          <button type="button" class="btn btn-sm btn-outline-dark" @click="editProduct(product)">편집</button>
          <button type="button" class="btn btn-sm btn-outline-danger" @click="pendingDelete = product">삭제</button>
        </div>
      </div>
    </div>
    <EmptyState v-else title="등록된 상품이 없습니다" />
    <PaginationBar :page="admin.productsPage" @change="changePage" />
  </section>

  <ConfirmDialog
    :open="Boolean(pendingDelete)"
    title="상품을 삭제할까요?"
    :description="`${pendingDelete?.name || ''} 상품과 연결된 데이터에 영향을 줄 수 있습니다.`"
    :pending="ui.isPending('admin-product-delete')"
    @cancel="pendingDelete = null"
    @confirm="deleteProduct"
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
import { categories, useCatalogStore } from '../../stores/catalog'
import { useUiStore } from '../../stores/ui'
import { money } from '../../utils/format'

const admin = useAdminStore()
const catalog = useCatalogStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const form = reactive({ id: null, name: '', type: '', price: 0, img: '', abv: 0, orderCount: 0 })
const pendingDelete = ref(null)

watch(() => route.query.page, (page) => loadPage(Math.max(1, Number.parseInt(page, 10) || 1)), { immediate: true })

function loadPage(page) {
  return ui.run('admin-products', () => admin.loadProducts({ page }))
}

function changePage(page) {
  router.push({ name: 'admin', query: { tab: 'products', page } })
}

function editProduct(product) {
  Object.assign(form, { ...product })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function resetForm() {
  Object.assign(form, { id: null, name: '', type: '', price: 0, img: '', abv: 0, orderCount: 0 })
}

async function saveProduct() {
  const result = await ui.run('admin-product-save', async () => {
    await admin.saveProduct({ ...form })
    await catalog.loadPopularProducts()
  }, { success: '상품이 저장되었습니다.' })
  if (result.ok) resetForm()
}

async function deleteProduct() {
  if (!pendingDelete.value) return
  const result = await ui.run('admin-product-delete', async () => {
    await admin.deleteProduct(pendingDelete.value.id)
    await catalog.loadPopularProducts()
  }, { success: '상품이 삭제되었습니다.' })
  if (result.ok) pendingDelete.value = null
}
</script>
