import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient, type Query } from '@tanstack/react-query'
import { api, ApiClientError } from '../services/api'
import { readSession, useSession } from '../queries'
import { useUi } from '../state/ui'
import { useAccountWrites } from '../state/accountWrites'
import { validAccountName, validCurrentPassword, validPassword } from '../settings'
import { Empty, Loading } from '../components/ui'
import type { User } from '../types'
import './account-admin.css'

const owners = new WeakMap<object, number>()
let nextOwner = 0
export function SettingsPage() {
  const session = useSession()
  const client = useQueryClient()
  const location = useLocation()
  const auth = client.getQueryCache().find({ queryKey: ['session'], exact: true })
  const transitioning = useUi((state) => Boolean(state.pending.login || state.pending.join || state.pending.logout))
  if (session.isPending || transitioning) return <Loading label="현재 계정을 확인하는 중입니다." />
  if (!session.data) return session.isError ? <Empty title="로그인 상태를 확인하지 못했습니다"><button onClick={() => session.refetch()}>다시 시도</button></Empty> : <Navigate to={`/account?${new URLSearchParams({ redirect: location.pathname + location.search })}`} replace />
  if (!auth) return null
  if (!owners.has(auth)) owners.set(auth, ++nextOwner)
  return <SettingsEditor key={`${owners.get(auth)}:${session.data.id}`} user={session.data} auth={auth} />
}

function SettingsEditor({ user, auth }: { user: User; auth: Query }) {
  const client = useQueryClient()
  const session = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const pending = useAccountWrites((state) => state.owners.has(user.id))
  const [name, setName] = useState<{ value: string } | null>(null)
  const [password, setPassword] = useState({ current: '', next: '', confirmation: '' })
  const [checked, setChecked] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [expired, setExpired] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const current = useRef({ key: location.key, mounted: true })
  current.current.key = location.key
  const sequence = useRef(0)
  const waiting = useRef(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const currentInput = useRef<HTMLInputElement>(null)
  const newInput = useRef<HTMLInputElement>(null)
  const confirmationInput = useRef<HTMLInputElement>(null)
  const sameAccount = () => client.getQueryCache().find({ queryKey: ['session'], exact: true }) === auth &&
    (client.getQueryData<User | null>(['session']))?.id === user.id
  const ownsPage = (key: string) => current.current.mounted && current.current.key === key && sameAccount()
  useEffect(() => {
    current.current.mounted = true
    return () => { current.current.mounted = false; sequence.current++ }
  }, [])
  async function verify(submittedName?: { value: string }) {
    const call = ++sequence.current, key = location.key
    setChecked(null); setChecking(true); setError('')
    try {
      // A read started before an uncertain write is not post-write authority.
      await client.cancelQueries({ queryKey: ['session'], exact: true })
      if (!ownsPage(key)) return false
      const account = await client.fetchQuery({ queryKey: ['session'], queryFn: readSession, staleTime: 0 })
      if (!ownsPage(key) || call !== sequence.current || account?.id !== user.id) return false
      setName((draft) => !draft || draft === submittedName ? { value: account.name } : draft)
      setChecked(key); setExpired(false)
      return true
    } catch {
      if (ownsPage(key) && call === sequence.current) setError('현재 로그인 상태를 확인하지 못했습니다. 다시 확인해 주세요.')
      return false
    } finally { if (ownsPage(key) && call === sequence.current) setChecking(false) }
  }
  useEffect(() => {
    setChecked(null); setName(null); setPassword({ current: '', next: '', confirmation: '' }); setError(''); setMessage('')
    waiting.current = pending
    if (!pending) void verify()
    return () => { sequence.current++ }
  }, [location.key])
  useEffect(() => {
    if (!pending && waiting.current) { waiting.current = false; void verify() }
  }, [pending])
  const allowed = checked === location.key && !checking && !expired && !pending && session.fetchStatus === 'idle' && !session.isError
  async function save(kind: 'name' | 'password', event: FormEvent) {
    event.preventDefault()
    if (!allowed || !sameAccount()) return
    setError(''); setMessage('')
    const submittedName = name
    if (kind === 'name' && (!name || !validAccountName(name.value))) {
      setError('이름은 공백만 입력할 수 없으며 100자 이하여야 합니다.'); nameInput.current?.focus(); return
    }
    if (kind === 'password' && (!validCurrentPassword(password.current) || !validPassword(password.next))) {
      setError('현재 비밀번호와 4~100자·UTF-8 최대72바이트의 새 비밀번호를 입력해 주세요. 공백도 비밀번호에 포함됩니다.')
      const input = !validCurrentPassword(password.current) ? currentInput : newInput
      input.current?.focus()
      return
    }
    if (kind === 'password' && password.next !== password.confirmation) {
      setError('새 비밀번호 확인이 일치하지 않습니다.'); confirmationInput.current?.focus(); return
    }
    const writes = useAccountWrites.getState(), token = writes.begin(user.id, kind === 'password')
    if (!token) return
    const key = location.key
    // Do not retain submitted secrets in UI state while waiting. Later input is a new draft.
    const credentials = { currentPassword: password.current, newPassword: password.next }
    if (kind === 'password') setPassword({ current: '', next: '', confirmation: '' })
    let saved = false
    try {
      const result = kind === 'name' ? await api.updateOwnProfile({ name: submittedName!.value }) : await api.updateOwnPassword(credentials)
      if (result !== true) throw new Error('invalid acknowledgement')
      saved = true
      writes.finishAuth(user.id, token)
      if (!sameAccount()) return
      await client.cancelQueries({ queryKey: ['account', user.id] })
      await client.invalidateQueries({ queryKey: ['account', user.id], refetchType: 'none' })
      if (!ownsPage(key)) return
      setMessage(kind === 'name' ? '이름이 저장되었습니다.' : '비밀번호가 변경되었습니다. 다른 로그인은 종료되며 현재 로그인은 유지됩니다.')
      const verified = await verify(kind === 'name' ? submittedName! : undefined)
      if (ownsPage(key) && !verified) setMessage('변경은 저장되었습니다. 현재 상태를 다시 확인해 주세요. 같은 변경을 다시 전송하지 않습니다.')
    } catch (cause) {
      writes.finishAuth(user.id, token)
      if (!ownsPage(key)) return
      const status = cause instanceof ApiClientError ? cause.status : 0
      if (status === 401) { setChecked(null); setExpired(true); setError('로그인 상태가 바뀌었습니다. 다시 로그인해 주세요.') }
      else if (status === 403) setError(kind === 'password' ? '현재 비밀번호가 일치하지 않습니다. 다시 입력해 주세요.' : '이름을 변경할 권한이 없습니다.')
      else if (status === 400) setError('입력한 내용을 서버에서 확인하지 못했습니다. 이름 또는 비밀번호의 길이를 확인해 주세요.')
      else {
        setChecked(null)
        setError(saved ? '변경은 저장되었지만 현재 상태를 확인하지 못했습니다.' : '변경 결과를 확인하지 못했습니다. 현재 상태를 확인한 뒤 필요할 때만 다시 제출해 주세요.')
        if (kind === 'password' && !saved) setMessage('비밀번호 변경 여부는 로그인 상태 조회만으로 확정할 수 없습니다. 다음 변경에는 실제 현재 비밀번호를 입력해 주세요.')
      }
    } finally {
      credentials.currentPassword = ''; credentials.newPassword = ''
      writes.finish(user.id, token)
    }
  }
  function loginAgain() {
    if (!sameAccount() || pending) return
    client.clear(); client.setQueryData(['session'], null)
    navigate(`/account?${new URLSearchParams({ redirect: location.pathname + location.search })}`)
  }
  return <section className="view settings-view settings-redesign">
    <header className="shop-intro account-settings-intro">
      <div><p className="section-kicker">마이 주점부리</p><h1>내 계정 설정</h1><p>이름과 비밀번호를 관리하세요.</p></div>
      <Link className="btn btn-outline-dark" to="/profile">마이페이지</Link>
    </header>
    {message && <p className="notice success" role="status">{message}</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {expired ? <Empty title="다시 로그인해 주세요"><button className="btn btn-dark" onClick={loginAgain}>다시 로그인</button></Empty> : <>
      {checking ? <Loading label="현재 계정을 확인하는 중입니다." /> : pending ? <p role="status">진행 중인 계정 변경을 기다리는 중입니다.</p> : !allowed && <div className="state-panel"><p>현재 로그인 확인 전에는 변경을 전송하지 않습니다.</p><button className="btn btn-dark" onClick={() => void verify()}>현재 상태 다시 확인</button></div>}
      <div className="settings-grid">
        <form className="settings-card" aria-label="본인 이름 수정" onSubmit={(event) => void save('name', event)}>
          <div className="settings-card-heading"><p className="section-kicker">프로필</p><h2>이름 수정</h2><p className="muted">마이페이지에 표시할 이름입니다.</p></div>
          <label className="field-group"><span>이름</span><input ref={nameInput} className="form-control" aria-label="이름" autoComplete="name" required maxLength={100} value={name?.value ?? ''} onChange={(event) => setName({ value: event.target.value })} /></label>
          <button className="btn btn-dark" disabled={!allowed} aria-busy={pending}>이름 저장</button>
        </form>
        <form className="settings-card" aria-label="본인 비밀번호 변경" onSubmit={(event) => void save('password', event)}>
          <div className="settings-card-heading"><p className="section-kicker">로그인 보안</p><h2>비밀번호 변경</h2><p className="muted">변경 후 현재 로그인은 유지되고 다른 로그인은 종료됩니다.</p></div>
          <label className="field-group"><span>현재 비밀번호</span><input ref={currentInput} className="form-control" aria-label="현재 비밀번호" type="password" autoComplete="current-password" required maxLength={100} value={password.current} onChange={(event) => setPassword({ ...password, current: event.target.value })} /></label>
          <label className="field-group"><span>새 비밀번호</span><input ref={newInput} className="form-control" aria-label="새 비밀번호" aria-describedby="password-byte-limit password-format" type="password" autoComplete="new-password" required minLength={4} maxLength={100} value={password.next} onChange={(event) => setPassword({ ...password, next: event.target.value })} /></label>
          <div className="settings-field-hint">
            <p id="password-byte-limit">새 비밀번호 {new TextEncoder().encode(password.next).byteLength}/72 UTF-8바이트</p>
            <p id="password-format">4~100자이며, 한글·이모지는 여러 바이트를 사용하고 앞뒤 공백도 포함합니다.</p>
          </div>
          <label className="field-group"><span>새 비밀번호 확인</span><input ref={confirmationInput} className="form-control" aria-label="새 비밀번호 확인" type="password" autoComplete="new-password" required minLength={4} maxLength={100} value={password.confirmation} onChange={(event) => setPassword({ ...password, confirmation: event.target.value })} /></label>
          <p className="settings-field-hint">제출하면 입력칸이 비워집니다. 실패하면 다시 입력해 주세요.</p>
          <button className="btn btn-dark" disabled={!allowed} aria-busy={pending}>비밀번호 변경</button>
        </form>
      </div>
      <section className="settings-card settings-shortcut">
        <div className="settings-card-heading"><h2>나의 취향</h2><p className="muted">직접 고른 선호와 가격·도수 조건을 관리하세요.</p></div>
        <Link className="btn btn-outline-dark" to="/preferences">내 취향 설정</Link>
      </section>
    </>}
  </section>
}
