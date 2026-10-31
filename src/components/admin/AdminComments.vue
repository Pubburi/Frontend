<template>
  <section class="admin-panel">
    <div class="admin-section-heading">
      <div><h2>후기 관리</h2><p>전체 상품 후기를 확인하고 관리합니다.</p></div>
      <span class="result-count">총 {{ admin.commentsPage.total }}개</span>
    </div>
    <LoadingSkeleton v-if="ui.isPending('admin-comments')" :count="4" />
    <div v-else-if="admin.comments.length" class="admin-table">
      <div class="table-row wide table-head"><span>ID</span><span>회원</span><span>상품</span><span>평점</span><span>내용</span><span>작업</span></div>
      <div v-for="comment in admin.comments" :key="comment.id" class="table-row wide">
        <span data-label="ID">{{ comment.id }}</span>
        <strong data-label="회원">{{ comment.userId }}</strong>
        <RouterLink data-label="상품" :to="`/products/${comment.productId}`">상품 #{{ comment.productId }}</RouterLink>
        <span data-label="평점" class="rating-stars">{{ stars(comment.rating) }} {{ Number(comment.rating).toFixed(1) }}</span>
        <p data-label="내용">{{ comment.comment }}</p>
        <button type="button" class="btn btn-sm btn-outline-danger" data-label="작업" @click="pendingDelete = comment">삭제</button>
      </div>
    </div>
    <EmptyState v-else title="등록된 후기가 없습니다" />
    <PaginationBar :page="admin.commentsPage" @change="changePage" />
  </section>

  <ConfirmDialog
    :open="Boolean(pendingDelete)"
    title="후기를 삭제할까요?"
    description="관리자 권한으로 삭제한 후기는 복구할 수 없습니다."
    :pending="ui.isPending('admin-comment-delete')"
    @cancel="pendingDelete = null"
    @confirm="deleteComment"
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

const admin = useAdminStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const pendingDelete = ref(null)

watch(() => route.query.page, (page) => loadPage(Math.max(1, Number.parseInt(page, 10) || 1)), { immediate: true })

function loadPage(page) {
  return ui.run('admin-comments', () => admin.loadComments({ page }))
}

function changePage(page) {
  router.push({ name: 'admin', query: { tab: 'comments', page } })
}

async function deleteComment() {
  if (!pendingDelete.value) return
  const result = await ui.run('admin-comment-delete', () => admin.deleteComment(pendingDelete.value.id), { success: '후기가 삭제되었습니다.' })
  if (result.ok) pendingDelete.value = null
}

function stars(rating) {
  return '★'.repeat(Math.max(1, Math.min(5, Math.round(Number(rating)))))
}
</script>
