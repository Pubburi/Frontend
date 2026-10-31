<template>
  <LoadingSkeleton v-if="ui.isPending('product-detail')" :count="2" label="상품 상세를 불러오는 중입니다." />

  <section v-else-if="catalog.selectedProduct" class="view detail-layout">
    <div class="detail-media">
      <ImageWithFallback :src="productImage(catalog.selectedProduct)" :alt="catalog.selectedProduct.name" loading="eager" />
    </div>
    <div class="detail-panel">
      <div class="detail-copy">
        <p class="product-type">{{ catalog.selectedProduct.type }}</p>
        <h1>{{ catalog.selectedProduct.name }}</h1>
        <p class="detail-description">취향에 맞는 방식으로 천천히 즐겨보세요.</p>
      </div>
      <div class="detail-stats" aria-label="상품 정보">
        <span class="stat-pill"><strong>{{ money(catalog.selectedProduct.price) }}원</strong></span>
        <span class="stat-pill">도수 {{ catalog.selectedProduct.abv }}%</span>
        <span class="stat-pill">누적 주문 {{ catalog.selectedProduct.orderCount }}회</span>
      </div>
      <div class="purchase-box">
        <div>
          <span class="field-label">수량</span>
          <QuantityStepper v-model="quantity" :max="99" :label="`${catalog.selectedProduct.name} 수량`" />
        </div>
        <strong>{{ money(catalog.selectedProduct.price * quantity) }}원</strong>
      </div>
      <button type="button" class="btn btn-gold btn-wide detail-cart-button" @click="addToCart">{{ quantity }}개 장바구니에 담기</button>

      <div class="comment-box">
        <div class="comment-title">
          <div>
            <p class="section-kicker">Reviews</p>
            <h2>구매 후기 <span>{{ catalog.commentsPage.total }}</span></h2>
          </div>
        </div>

        <form v-if="auth.user" class="comment-form" @submit.prevent="submitComment">
          <label class="field-group compact-field">
            <span>평점</span>
            <select v-model.number="commentForm.rating" class="form-select">
              <option v-for="rating in [5, 4, 3, 2, 1]" :key="rating" :value="rating">{{ rating }}점</option>
            </select>
          </label>
          <label class="field-group comment-input">
            <span>후기</span>
            <textarea v-model="commentForm.comment" class="form-control" maxlength="200" placeholder="상품에 대한 솔직한 후기를 남겨주세요." required></textarea>
            <small>{{ commentForm.comment.length }} / 200</small>
          </label>
          <button type="submit" class="btn btn-dark" :disabled="ui.isPending('comment-create')">후기 등록</button>
        </form>
        <div v-else class="login-prompt">
          <p>로그인하고 이 상품의 후기를 남겨보세요.</p>
          <RouterLink class="btn btn-outline-dark btn-sm" :to="{ name: 'account', query: { redirect: route.fullPath } }">로그인</RouterLink>
        </div>

        <div v-if="catalog.comments.length" class="comment-list">
          <article v-for="comment in catalog.comments" :key="comment.id" class="comment-row">
            <div class="comment-head">
              <div>
                <strong>{{ comment.userId }}</strong>
                <span class="rating-stars" :aria-label="`${comment.rating}점`">{{ stars(comment.rating) }}</span>
              </div>
              <span class="badge">{{ Number(comment.rating).toFixed(1) }}점</span>
            </div>
            <form v-if="editingId === comment.id" class="comment-edit-form" @submit.prevent="saveComment(comment.id)">
              <label class="field-group compact-field">
                <span>평점</span>
                <select v-model.number="editForm.rating" class="form-select">
                  <option v-for="rating in [5, 4, 3, 2, 1]" :key="rating" :value="rating">{{ rating }}점</option>
                </select>
              </label>
              <label class="field-group">
                <span>후기 내용</span>
                <textarea v-model="editForm.comment" class="form-control" maxlength="200" required></textarea>
              </label>
              <div class="button-row">
                <button type="button" class="btn btn-sm btn-outline-secondary" @click="cancelEdit">취소</button>
                <button type="submit" class="btn btn-sm btn-dark" :disabled="ui.isPending(`comment-edit-${comment.id}`)">저장</button>
              </div>
            </form>
            <template v-else>
              <p>{{ comment.comment }}</p>
              <div v-if="canEditComment(comment)" class="button-row">
                <button type="button" class="text-button" @click="startEdit(comment)">수정</button>
                <button type="button" class="text-button danger-text" @click="pendingDelete = comment">삭제</button>
              </div>
            </template>
          </article>
          <PaginationBar :page="catalog.commentsPage" @change="loadComments" />
        </div>
        <EmptyState v-else icon="✦" title="아직 등록된 후기가 없습니다" description="첫 번째 후기를 남겨보세요." />
      </div>
    </div>
  </section>

  <EmptyState v-else-if="loadError?.status === 404" icon="404" title="상품을 찾을 수 없습니다" description="판매가 종료되었거나 존재하지 않는 상품입니다.">
    <RouterLink class="btn btn-dark" to="/products">전체 주류 보기</RouterLink>
  </EmptyState>
  <EmptyState v-else icon="!" title="상품을 불러오지 못했습니다" description="연결 상태를 확인한 뒤 다시 시도해 주세요.">
    <button type="button" class="btn btn-dark" @click="loadProduct">다시 시도</button>
  </EmptyState>

  <ConfirmDialog
    :open="Boolean(pendingDelete)"
    title="후기를 삭제할까요?"
    description="삭제한 후기는 복구할 수 없습니다."
    :pending="ui.isPending('comment-delete')"
    @cancel="pendingDelete = null"
    @confirm="removeComment"
  />
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import ConfirmDialog from '../components/ui/ConfirmDialog.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import ImageWithFallback from '../components/ui/ImageWithFallback.vue'
import LoadingSkeleton from '../components/ui/LoadingSkeleton.vue'
import PaginationBar from '../components/ui/PaginationBar.vue'
import QuantityStepper from '../components/ui/QuantityStepper.vue'
import { useAuthStore } from '../stores/auth'
import { useCartStore } from '../stores/cart'
import { useCatalogStore } from '../stores/catalog'
import { useUiStore } from '../stores/ui'
import { money, productImage } from '../utils/format'

const route = useRoute()
const auth = useAuthStore()
const cart = useCartStore()
const catalog = useCatalogStore()
const ui = useUiStore()
const quantity = ref(1)
const loadError = ref(null)
const editingId = ref(null)
const pendingDelete = ref(null)
const commentForm = reactive({ rating: 5, comment: '' })
const editForm = reactive({ rating: 5, comment: '' })

watch(() => route.params.id, loadProduct, { immediate: true })

async function loadProduct() {
  catalog.clearProduct()
  quantity.value = 1
  const result = await ui.run('product-detail', async () => {
    await catalog.loadProduct(route.params.id)
    await catalog.loadComments(route.params.id)
  })
  loadError.value = result.ok ? null : result.error
}

function loadComments(page) {
  return ui.run('comments', () => catalog.loadComments(route.params.id, { page }))
}

function addToCart() {
  cart.add(catalog.selectedProduct, quantity.value)
  ui.setStatus(`${catalog.selectedProduct.name} ${quantity.value}개를 장바구니에 담았습니다.`)
}

async function submitComment() {
  const result = await ui.run(
    'comment-create',
    () => catalog.createComment({ productId: catalog.selectedProduct.id, rating: commentForm.rating, comment: commentForm.comment.trim() }),
    { success: '후기가 등록되었습니다.' },
  )
  if (result.ok) commentForm.comment = ''
}

function canEditComment(comment) {
  return auth.isAdmin || auth.user?.id === comment.userId
}

function startEdit(comment) {
  editingId.value = comment.id
  Object.assign(editForm, { rating: Number(comment.rating), comment: comment.comment })
}

function cancelEdit() {
  editingId.value = null
}

async function saveComment(id) {
  const result = await ui.run(
    `comment-edit-${id}`,
    () => catalog.updateComment(id, { rating: editForm.rating, comment: editForm.comment.trim() }),
    { success: '후기가 수정되었습니다.' },
  )
  if (result.ok) cancelEdit()
}

async function removeComment() {
  if (!pendingDelete.value) return
  const result = await ui.run('comment-delete', () => catalog.deleteComment(pendingDelete.value.id), { success: '후기가 삭제되었습니다.' })
  if (result.ok) pendingDelete.value = null
}

function stars(rating) {
  return '★'.repeat(Math.max(1, Math.min(5, Math.round(Number(rating)))))
}
</script>
