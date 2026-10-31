<template>
  <section class="view account-layout">
    <div class="account-story">
      <p class="section-kicker">Welcome</p>
      <h1>한 잔의 취향을<br />더 선명하게</h1>
      <p>주점부리 회원이 되면 주문 내역과 등급을 한 곳에서 확인할 수 있습니다.</p>
      <ul>
        <li>다양한 주종을 한 번에 탐색</li>
        <li>주문할 때마다 스탬프 적립</li>
        <li>나의 주문 상태를 간편하게 확인</li>
      </ul>
    </div>

    <div class="auth-panel">
      <div class="segmented" aria-label="계정 메뉴">
        <button type="button" :class="{ active: auth.authMode === 'login' }" @click="auth.authMode = 'login'">로그인</button>
        <button type="button" :class="{ active: auth.authMode === 'join' }" @click="auth.authMode = 'join'">회원가입</button>
      </div>

      <form v-if="auth.authMode === 'login'" class="auth-form" @submit.prevent="login">
        <div>
          <p class="section-kicker">Sign In</p>
          <h2>다시 만나 반가워요</h2>
        </div>
        <label class="field-group">
          <span>아이디</span>
          <input v-model.trim="loginForm.id" class="form-control" autocomplete="username" maxlength="100" required />
        </label>
        <label class="field-group">
          <span>비밀번호</span>
          <input v-model="loginForm.pass" type="password" class="form-control" autocomplete="current-password" maxlength="100" required />
        </label>
        <button type="submit" class="btn btn-dark w-100" :disabled="ui.isPending('login')">
          {{ ui.isPending('login') ? '로그인 중…' : '로그인' }}
        </button>
      </form>

      <form v-else class="auth-form" @submit.prevent="join">
        <div>
          <p class="section-kicker">Join</p>
          <h2>취향 기록을 시작해 보세요</h2>
        </div>
        <label class="field-group">
          <span>아이디</span>
          <div class="inline-field">
            <input v-model.trim="joinForm.id" class="form-control" autocomplete="username" maxlength="100" required @input="resetIdCheck" />
            <button type="button" class="btn btn-outline-dark" :disabled="!joinForm.id || ui.isPending('id-check')" @click="checkId">
              중복 확인
            </button>
          </div>
          <small v-if="idCheck.message" :class="idCheck.available ? 'success-text' : 'danger-text'" role="status">{{ idCheck.message }}</small>
        </label>
        <label class="field-group">
          <span>이름</span>
          <input v-model.trim="joinForm.name" class="form-control" autocomplete="name" maxlength="100" required />
        </label>
        <label class="field-group">
          <span>비밀번호</span>
          <input v-model="joinForm.pass" type="password" class="form-control" autocomplete="new-password" minlength="4" maxlength="100" required />
          <small>4자 이상 입력해 주세요.</small>
        </label>
        <button type="submit" class="btn btn-dark w-100" :disabled="ui.isPending('join') || !idCheck.available">
          {{ ui.isPending('join') ? '가입 중…' : '회원가입' }}
        </button>
      </form>
    </div>
  </section>
</template>

<script setup>
import { reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../services/api'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'

const auth = useAuthStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const loginForm = reactive({ id: '', pass: '' })
const joinForm = reactive({ id: '', name: '', pass: '' })
const idCheck = reactive({ checkedId: '', available: false, message: '' })

function redirectTarget() {
  const target = String(route.query.redirect || '/profile')
  return target.startsWith('/') && !target.startsWith('//') ? target : '/profile'
}

async function login() {
  const result = await ui.run('login', () => auth.login(loginForm), { success: '로그인되었습니다.' })
  if (result.ok) {
    loginForm.pass = ''
    await router.push(redirectTarget())
  }
}

function resetIdCheck() {
  Object.assign(idCheck, { checkedId: '', available: false, message: '' })
}

async function checkId() {
  const id = joinForm.id.trim()
  if (!id) return
  const result = await ui.run('id-check', () => api.idAvailable(id), { clear: false })
  if (!result.ok) return
  idCheck.checkedId = id
  idCheck.available = Boolean(result.data?.available)
  idCheck.message = idCheck.available ? '사용할 수 있는 아이디입니다.' : '이미 사용 중인 아이디입니다.'
}

async function join() {
  if (!idCheck.available || idCheck.checkedId !== joinForm.id.trim()) {
    ui.setError(new Error('아이디 중복 확인이 필요합니다.'))
    return
  }
  const result = await ui.run(
    'join',
    async () => {
      await auth.join(joinForm)
      await auth.login({ id: joinForm.id, pass: joinForm.pass })
    },
    { success: '가입되었습니다.' },
  )
  if (result.ok) await router.push(redirectTarget())
}
</script>
