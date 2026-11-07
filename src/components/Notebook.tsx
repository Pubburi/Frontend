import { Fragment, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient, type Query, type QueryClient } from '@tanstack/react-query'
import { api, ApiClientError } from '../services/api'
import { readSession, useSession } from '../queries'
import { useUi } from '../state/ui'
import { checkedNotebookEntry, notebookDraft, notebookPayload } from '../notebook'
import type { NotebookEntry, Page, User } from '../types'
import { TagEditor } from './TagEditor'
import { Confirm, Empty, Pagination } from './ui'

const authPending = () => ['login', 'join', 'logout', 'settings-password'].some((key) => useUi.getState().pending[key])
// Retain only HTTP lifetimes through cache/route changes, never private form values.
const writes = new WeakMap<QueryClient, Map<string, Promise<void>>>()
type Actor = { user: User; owns: () => boolean; recheck: () => void }

function NotebookAccount({ children }: { children: (actor: Actor) => ReactNode }) {
  const client = useQueryClient(), location = useLocation()
  useSession()
  const pending = useUi((state) => ['login', 'join', 'logout', 'settings-password'].some((key) => state.pending[key]))
  const [attempt, setAttempt] = useState(0)
  const [verified, setVerified] = useState<{ user: User | null; auth: Query; key: string; attempt: number } | null>(null)
  const [failed, setFailed] = useState(false)
  const active = useRef<object | null>(null)
  const recheck = () => setAttempt((value) => value + 1)
  useLayoutEffect(() => {
    const token = {}; active.current = token
    setVerified(null); setFailed(false)
    if (!pending) void (async () => {
      try {
        await client.cancelQueries({ queryKey: ['session'], exact: true })
        if (active.current !== token || authPending()) return
        const auth = client.getQueryCache().find({ queryKey: ['session'], exact: true })
        const fetched = await client.fetchQuery({ queryKey: ['session'], queryFn: readSession, staleTime: 0 })
        const user = auth?.state.data as User | null
        if (fetched !== null && (!fetched || typeof fetched.id !== 'string')) throw new Error('잘못된 로그인 응답입니다.')
        if (active.current === token && auth && client.getQueryCache().find({ queryKey: ['session'], exact: true }) === auth &&
            auth.state.status === 'success' && auth.state.fetchStatus === 'idle' && user?.id === fetched?.id && !authPending())
          setVerified({ user, auth, key: location.key, attempt })
      } catch { if (active.current === token) setFailed(true) }
    })()
    return () => { active.current = null }
  }, [client, location.key, pending, attempt])
  const current = !pending && verified?.key === location.key && verified.attempt === attempt &&
    client.getQueryCache().find({ queryKey: ['session'], exact: true }) === verified.auth &&
    verified.auth.state.data === verified.user && verified.auth.state.status === 'success' && verified.auth.state.fetchStatus === 'idle'
  if (failed || verified && !current) return <div role="status"><p>내 기록의 로그인 상태를 확인하지 못했습니다.</p><button className="btn btn-outline-dark" onClick={recheck}>기록 로그인 상태 다시 확인</button></div>
  if (!current || !verified) return <p role="status">내 기록의 로그인 상태를 확인하는 중입니다.</p>
  if (!verified.user) return <Link className="btn btn-outline-dark" to={`/account?${new URLSearchParams({ redirect: location.pathname + location.search })}`}>로그인하고 내 기록 남기기</Link>
  const token = active.current
  const actor: Actor = { user: verified.user, recheck, owns: () => active.current === token &&
    client.getQueryCache().find({ queryKey: ['session'], exact: true }) === verified.auth && verified.auth.state.data === verified.user &&
    verified.auth.state.status === 'success' && verified.auth.state.fetchStatus === 'idle' && !authPending() }
  return <Fragment key={`${location.key}:${attempt}:${verified.user.id}`}>{children(actor)}</Fragment>
}

export function ProductNotebook({ productId }: { productId: number }) {
  const location = useLocation(), [seen, setSeen] = useState(false)
  return <details className="notebook-panel" onToggle={(event) => { if (event.currentTarget.open) setSeen(true) }}>
    <summary className="text-link">나만의 취향 기록</summary>
    {seen && <><p>나만 보는 기록입니다. 공개 회원 후기·추천 피드백과 별개이며 자동으로 공개하거나 추천에 반영하지 않습니다.</p>
      <Link className="text-link" to="/notebook">내 취향 기록 모아보기</Link>
      <NotebookAccount key={location.key}>{(actor) => <NotebookEditor actor={actor} productId={productId} />}</NotebookAccount></>}
  </details>
}

function ReadFailure({ error, actor, retry }: { error: unknown; actor: Actor; retry: () => void }) {
  const status = error instanceof ApiClientError ? error.status : 0
  return <div role="status"><p>{status === 401 ? '로그인 상태가 바뀌어 내 기록을 표시하지 않았습니다.' : status === 404 ? '이 기록을 사용할 수 없습니다. 삭제되었거나 제공되지 않는 기록입니다.' : '내 취향 기록을 확인하지 못했습니다.'}</p>
    <button className="btn btn-outline-dark" onClick={status === 401 ? actor.recheck : retry}>{status === 401 ? '기록 로그인 상태 다시 확인' : '내 기록 다시 불러오기'}</button></div>
}
function NotebookEditor({ actor, productId, entryId, onChanged, fallbackFocus }: {
  actor: Actor; productId?: number; entryId?: string; onChanged?: (entry: NotebookEntry | null) => void; fallbackFocus?: () => HTMLElement | null
}) {
  const client = useQueryClient(), [load, setLoad] = useState(0)
  const query = useQuery({
    queryKey: ['account', actor.user.id, 'notebook', entryId ?? productId, load], gcTime: 0, networkMode: 'always', refetchOnReconnect: false,
    queryFn: async ({ signal }) => {
      await writes.get(client)?.get(actor.user.id)
      if (!actor.owns() || signal.aborted) throw new Error('이전 화면의 기록 조회입니다.')
      const value = entryId ? await api.notebookEntry(actor.user.id, entryId, signal) : await api.notebookForProduct(actor.user.id, productId!, signal)
      if (!actor.owns()) throw new Error('이전 계정의 기록 조회입니다.')
      return checkedNotebookEntry(value, { id: entryId, productId })
    },
  })
  if (query.isPending || query.fetchStatus !== 'idle') return <p role="status">내 취향 기록을 불러오는 중입니다.</p>
  if (query.isError) return <ReadFailure error={query.error} actor={actor} retry={() => void query.refetch()} />
  return <NotebookForm key={load} initial={query.data} productId={productId} actor={actor} onChanged={onChanged} fallbackFocus={fallbackFocus}
    reload={() => setLoad((value) => value + 1)} />
}

function NotebookForm({ initial, productId, actor, reload, onChanged, fallbackFocus }: {
  initial: NotebookEntry | null; productId?: number; actor: Actor; reload: () => void; onChanged?: (entry: NotebookEntry | null) => void; fallbackFocus?: () => HTMLElement | null
}) {
  const client = useQueryClient()
  const [note, setNote] = useState(initial), [draft, setDraft] = useState(() => notebookDraft(initial))
  const [pending, setPending] = useState(false), [blocked, setBlocked] = useState(false), [expired, setExpired] = useState(false)
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [deleting, setDeleting] = useState(false)
  const alive = useRef(false), form = useRef<HTMLFormElement>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const owns = () => alive.current && actor.owns()
  async function write(remove = false) {
    const activeWrites = writes.get(client) ?? new Map<string, Promise<void>>()
    if (!owns() || activeWrites.has(actor.user.id) || blocked) return
    const submitted = draft, saved = note
    let content
    try { content = remove ? null : notebookPayload(submitted) } catch (cause) { setError((cause as Error).message); form.current?.focus(); return }
    if (remove && !saved) return
    writes.set(client, activeWrites); setPending(true); setError(''); setMessage('')
    const promise = (async () => {
      try {
        let result: NotebookEntry | null
        if (remove) {
          if (await api.deleteNotebookEntry(actor.user.id, saved!.id, saved!.version) !== null) throw new Error('삭제 응답을 확인하지 못했습니다.')
          result = null
        } else result = checkedNotebookEntry(saved ? await api.updateNotebookEntry(actor.user.id, saved.id, saved.version, content!) :
          await api.createNotebookEntry(actor.user.id, productId!, content!), saved ? { id: saved.id } : { productId })
        if (!remove && !result) throw new Error('저장 응답을 확인하지 못했습니다.')
        if (!owns()) return
        setNote(result); setDraft((current) => current === submitted ? notebookDraft(result) : current)
        setMessage(remove ? '비공개 기록을 삭제했습니다.' : '비공개 기록을 저장했습니다.')
        void client.invalidateQueries({ queryKey: ['account', actor.user.id, 'notebook'], refetchType: 'none' })
        onChanged?.(result)
      } catch (cause) {
        if (!owns()) return
        const status = cause instanceof ApiClientError ? cause.status : 0
        if (status === 401) { setExpired(true); setError('로그인 상태가 바뀌어 내 기록을 표시하지 않았습니다.') }
        else {
          setBlocked(status !== 400)
          setError(status === 409 ? '다른 곳에서 기록이 바뀌었습니다. 현재 입력은 남겨 두었습니다. 복사한 뒤 최신 기록으로 다시 편집해 주세요.' :
            status === 400 ? '입력한 내용을 서버에서 확인하지 못했습니다. 평점·태그·메모를 확인해 주세요.' :
              status === 404 ? '이 상품이나 기록을 더 이상 사용할 수 없습니다. 현재 입력은 남겨 두었습니다.' :
                '저장 결과를 확인하지 못했습니다. 입력은 남겨 두었습니다. 다시 보내기 전에 최신 기록을 확인해 주세요.')
        }
      } finally {
        activeWrites.delete(actor.user.id)
        if (owns()) { setPending(false); setDeleting(false) }
      }
    })()
    activeWrites.set(actor.user.id, promise)
  }
  function submit(event: FormEvent) { event.preventDefault(); void write() }
  if (expired) return <ReadFailure error={new ApiClientError({}, 401)} actor={actor} retry={reload} />
  return <>
    {message && <p className="notice success" role="status">{message}</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {blocked && <button className="btn btn-outline-dark" onClick={reload}>최신 기록으로 다시 편집</button>}
    <form className="notebook-form feature-form" aria-label="나만의 취향 기록 편집" tabIndex={-1} ref={form} onSubmit={submit}>
      <label className="field-group"><span>기록 구분</span><select className="form-select" aria-label="기록 구분" value={draft.experience} onChange={(event) => setDraft({ ...draft, experience: event.target.value as 'TRIED' | 'INTERESTED' })}>
        <option value="INTERESTED">아직 마시지 않음 · 관심 기록</option><option value="TRIED">직접 마셔봄 · 경험 기록</option>
      </select></label>
      {draft.experience === 'INTERESTED' ? <p className="muted">관심 메모만 남깁니다. 마셔 본 평점·맛·향으로 저장하지 않습니다.</p> : <>
        <label className="field-group"><span>나의 평점 (선택)</span><input className="form-control" aria-label="나의 평점 (선택)" type="number" min={0} max={5} step="0.01" placeholder="미평가" value={draft.rating} onChange={(event) => setDraft({ ...draft, rating: event.target.value })} /><small>0~5점·소수 둘째 자리까지. 비워 두면 미평가입니다.</small></label>
        <div className="feature-tag-grid">{(['taste', 'aroma'] as const).map((key) => <TagEditor key={key} label={key === 'taste' ? '내가 느낀 맛' : '내가 느낀 향'} value={draft[key]} maxLength={80}
          help="최대20개·각40자. 원문과 순서를 보존하며 같은 태그를 중복해서 쓸 수 없습니다." unknownLabel="아직 기록하지 않음" emptyLabel="기록할 태그 없음" tagsLabel="내가 느낀 태그 입력"
          onChange={(value) => setDraft({ ...draft, [key]: value })} />)}</div>
      </>}
      <label className="field-group"><span>나만의 메모 (선택)</span><textarea className="form-control" aria-label="나만의 메모 (선택)" maxLength={4000} value={draft.memo ?? ''} onChange={(event) => setDraft({ ...draft, memo: event.target.value })} /><small>{Array.from(draft.memo ?? '').length}/2000자 · 다른 회원에게 공개되지 않습니다.</small></label>
      <div className="button-row"><button className="btn btn-dark" aria-disabled={pending || blocked} aria-busy={pending}>내 기록 저장</button>
        {note && <button className="btn btn-outline-danger" type="button" disabled={pending || blocked} onClick={() => setDeleting(true)}>내 기록 삭제</button>}</div>
      <p role="status">{pending ? '내 기록을 저장하는 중입니다. 새로 입력한 내용은 다음 수정으로 남습니다.' : ''}</p>
    </form>
    {deleting && <Confirm title="나만의 기록을 삭제할까요?" description="비공개 메모와 평가를 삭제합니다. 공개 회원 후기와 추천 피드백은 바뀌지 않습니다."
      pending={pending} onCancel={() => setDeleting(false)} onConfirm={() => void write(true)} fallbackFocus={() => actor.owns() ? fallbackFocus?.() ?? null : null} />}
  </>
}

export function NotebookPage() {
  return <section className="view notebook-view"><div className="shop-intro compact-intro"><div><p className="section-kicker">My Notebook</p><h1>내 취향 기록</h1><p>나만 보는 경험·관심 기록입니다. 공개 후기나 추천 피드백에 자동으로 반영하지 않습니다.</p></div><Link className="btn btn-outline-dark" to="/profile">마이페이지</Link></div>
    <NotebookAccount>{(actor) => <NotebookList actor={actor} />}</NotebookAccount></section>
}
function NotebookList({ actor }: { actor: Actor }) {
  const [search, setSearch] = useSearchParams(), [editing, setEditing] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null), client = useQueryClient()
  const page = /^\d+$/.test(search.get('page') ?? '') ? Math.max(1, Math.min(2147483647, Number(search.get('page')))) : 1
  const listKey = ['account', actor.user.id, 'notebook', 'list', page] as const
  const query = useQuery({ queryKey: listKey, gcTime: 0, networkMode: 'always', refetchOnReconnect: false,
    queryFn: async () => {
      await writes.get(client)?.get(actor.user.id)
      if (!actor.owns()) throw new Error('이전 화면의 기록 조회입니다.')
      const data = await api.notebook(actor.user.id, { page, size: 10 })
      if (!actor.owns()) throw new Error('이전 계정의 기록 조회입니다.')
      data.items.forEach((entry) => checkedNotebookEntry(entry, { id: entry.id }))
      return data
    } })
  const lastPage = query.data ? Math.max(1, query.data.totalPages) : page
  const outOfRange = query.isSuccess && page > lastPage
  useEffect(() => { if (query.isSuccess && !query.isFetching && page > lastPage) setSearch({ page: String(lastPage) }, { replace: true }) }, [query.isSuccess, query.isFetching, page, lastPage, setSearch])
  return <section aria-label="비공개 취향 기록 목록"><h2 ref={heading} tabIndex={-1}>저장한 내 기록</h2>
    <button className="btn btn-outline-dark" disabled={query.isFetching} onClick={() => { setEditing(null); void query.refetch() }}>내 기록 목록 새로고침</button>
    {query.isPending || query.isFetching || outOfRange ? <p role="status">내 기록 목록을 불러오는 중입니다.</p> : query.isError ? <ReadFailure error={query.error} actor={actor} retry={() => void query.refetch()} /> : !query.data.items.length ?
      <Empty title="아직 저장한 취향 기록이 없습니다"><Link className="btn btn-outline-dark" to="/products">상품을 고르고 내 기록 남기기</Link></Empty> : <>
        <p className="muted">총 {query.data.total}개 · 목록을 새로 불러오면 최근 수정한 순서로 표시합니다.</p>
        <div className="notebook-list">{query.data.items.map((note) => <article className="notebook-card settings-card" key={note.id}>
          <h3>{note.productName}</h3><span className="badge">{note.experience === 'TRIED' ? '직접 마셔봄 · 경험 기록' : '아직 마시지 않음 · 관심 기록'}</span>
          {note.currentProduct && note.productId !== null ? <Link className="text-link" to={`/products/${note.productId}`}>현재 상품 보기 · {note.currentProduct.name}</Link> : <p className="muted">삭제된 상품 · 기록은 남아 있습니다.</p>}
          {note.experience === 'TRIED' && <><p>나의 평점 {note.rating === null ? '미평가' : `${note.rating}점`}</p>
            {(['tasteTags', 'aromaTags'] as const).map((key) => <div key={key}><span>{key === 'tasteTags' ? '내가 느낀 맛' : '내가 느낀 향'}</span>
              {note[key] === null ? <p>미기록</p> : !note[key].length ? <p>기록할 태그 없음</p> : <ul className="product-feature-tags notebook-tags">{note[key].map((tag, index) => <li key={index}>{tag}</li>)}</ul>}</div>)}</>}
          <p className="notebook-memo">{note.memo || '메모 없음'}</p><small>수정 {new Date(note.updatedAt).toLocaleString('ko-KR')}</small>
          <button className="btn btn-outline-dark" aria-expanded={editing === note.id} onClick={() => setEditing(editing === note.id ? null : note.id)}>{editing === note.id ? '기록 편집 닫기' : '내 기록 편집'}</button>
          {editing === note.id && <NotebookEditor actor={actor} entryId={note.id} onChanged={(entry) => {
            if (!entry) { void query.refetch(); return }
            client.setQueryData<Page<NotebookEntry>>(listKey, (data) => data ? { ...data, items: data.items.map((item) => item.id === entry.id ? entry : item) } : data)
          }} fallbackFocus={() => heading.current} />}
        </article>)}</div>
        <Pagination page={query.data} onChange={(next) => { setEditing(null); setSearch({ page: String(next) }) }} />
      </>}
  </section>
}
