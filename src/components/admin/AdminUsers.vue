<template>
  <section class="admin-panel">
    <div class="admin-section-heading">
      <div><h2>회원 관리</h2><p>회원 등급과 스탬프 정보를 관리합니다.</p></div>
      <span class="result-count">총 {{ admin.usersPage.total }}명</span>
    </div>

    <form v-if="form.id" class="admin-form user-edit-form" @submit.prevent="saveUser">
      <div class="form-context"><span class="section-kicker">Editing</span><strong>{{ form.id }} 회원</strong></div>
      <label class="field-group"><span>이름</span><input v-model.trim="form.name" class="form-control" maxlength="100" required /></label>
      <label class="field-group"><span>스탬프</span><input v-model.number="form.stamps" type="number" min="0" class="form-control" required /></label>
      <label class="field-group">
        <span>권한</span>
        <select v-model="form.role" class="form-select" required>
          <option value="USER">일반 회원</option>
          <option value="ADMIN">관리자</option>
        </select>
      </label>
      <label class="field-group"><span>새 비밀번호 <small>(선택)</small></span><input v-model="form.pass" type="password" minlength="4" maxlength="100" class="form-control" /></label>
      <div class="admin-form-actions">
        <button type="submit" class="btn btn-dark" :disabled="ui.isPending('admin-user-save')">변경 저장</button>
        <button type="button" class="btn btn-outline-secondary" @click="resetForm">편집 취소</button>
      </div>
    </form>

    <LoadingSkeleton v-if="ui.isPending('admin-users')" :count="4" />
    <div v-else-if="admin.users.length" class="admin-table">
      <div class="table-row wide table-head"><span>아이디</span><span>이름</span><span>권한</span><span>스탬프</span><span>작업</span></div>
      <div v-for="user in admin.users" :key="user.id" class="table-row wide">
        <span data-label="아이디">{{ user.id }}</span>
        <strong data-label="이름">{{ user.name }}</strong>
        <span data-label="권한" class="badge" :class="{ muted: user.role !== 'ADMIN' }">{{ user.role === 'ADMIN' ? '관리자' : '일반 회원' }}</span>
        <span data-label="스탬프">{{ user.stamps }}개</span>
        <div class="button-row table-actions" data-label="작업">
          <button type="button" class="btn btn-sm btn-outline-dark" @click="editUser(user)">편집</button>
          <button type="button" class="btn btn-sm btn-outline-danger" :disabled="user.id === auth.user?.id" :title="user.id === auth.user?.id ? '현재 로그인한 계정은 삭제할 수 없습니다.' : ''" @click="pendingDelete = user">삭제</button>
        </div>
      </div>
    </div>
    <EmptyState v-else title="등록된 회원이 없습니다" />
    <PaginationBar :page="admin.usersPage" @change="changePage" />
  </section>

  <ConfirmDialog
    :open="Boolean(pendingDelete)"
    title="회원을 삭제할까요?"
    :description="`${pendingDelete?.name || ''} 회원의 주문과 활동 데이터도 영향을 받을 수 있습니다.`"
    :pending="ui.isPending('admin-user-delete')"
    @cancel="pendingDelete = null"
    @confirm="deleteUser"
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
import { useAuthStore } from '../../stores/auth'
import { useUiStore } from '../../stores/ui'

const admin = useAdminStore()
const auth = useAuthStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const form = reactive({ id: '', name: '', stamps: 0, role: 'USER', pass: '' })
const pendingDelete = ref(null)

watch(() => route.query.page, (page) => loadPage(Math.max(1, Number.parseInt(page, 10) || 1)), { immediate: true })

function loadPage(page) {
  return ui.run('admin-users', () => admin.loadUsers({ page }))
}

function changePage(page) {
  router.push({ name: 'admin', query: { tab: 'users', page } })
}

function editUser(user) {
  Object.assign(form, { id: user.id, name: user.name, stamps: user.stamps, role: user.role, pass: '' })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function resetForm() {
  Object.assign(form, { id: '', name: '', stamps: 0, role: 'USER', pass: '' })
}

async function saveUser() {
  const payload = { name: form.name, stamps: form.stamps, role: form.role, ...(form.pass ? { pass: form.pass } : {}) }
  const result = await ui.run('admin-user-save', () => admin.updateUser(form.id, payload), { success: '회원 정보가 저장되었습니다.' })
  if (result.ok) resetForm()
}

async function deleteUser() {
  if (!pendingDelete.value) return
  const result = await ui.run('admin-user-delete', () => admin.deleteUser(pendingDelete.value.id), { success: '회원이 삭제되었습니다.' })
  if (result.ok) pendingDelete.value = null
}
</script>
