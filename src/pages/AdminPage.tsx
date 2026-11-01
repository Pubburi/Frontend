import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api'
import { categories } from '../catalog'
import { useSession } from '../queries'
import { useUi } from '../state/ui'
import { Confirm, Empty, Loading, Pagination } from '../components/ui'
import { OrderLines, orderMoney } from '../components/OrderLines'
import { ProductFeatureEditor } from '../components/ProductFeatureEditor'
import { featureSaveKey } from '../productFeatures'
import { money, orderType } from '../utils/format'
import type { Market, Order, Page, Product, Review, User } from '../types'

export const adminTabs = [
  'products',
  'markets',
  'orders',
  'comments',
  'users',
] as const
type Tab = (typeof adminTabs)[number]
type Item = Product | Market | Order | Review | User
const labels: Record<Tab, string> = {
  products: '상품',
  markets: '매장',
  orders: '주문',
  comments: '댓글',
  users: '회원',
}
export async function fetchAdminPage(
  tab: Tab,
  page: number,
): Promise<Page<Item>> {
  const params = { page, size: 20 }
  if (tab === 'products')
    return api.products({ ...params, type: '', q: '', sort: 'popular' })
  if (tab === 'markets') return api.markets(params)
  if (tab === 'orders') return api.adminOrders(params)
  if (tab === 'comments') return api.adminComments(params)
  return api.adminUsers(params)
}
export default function AdminPage() {
  const [search, setSearch] = useSearchParams()
  const tab = adminTabs.includes(search.get('tab') as Tab)
    ? (search.get('tab') as Tab)
    : 'products'
  const page = Math.max(1, Number.parseInt(search.get('page') || '1', 10) || 1)
  return (
    <section className="view admin-layout">
      <div className="shop-intro compact-intro">
        <div>
          <p className="section-kicker">Operations</p>
          <h1>관리자 센터</h1>
          <p>상품, 매장, 주문과 회원 데이터를 한 곳에서 관리합니다.</p>
        </div>
      </div>
      <nav className="admin-tabs" aria-label="관리 메뉴">
        {adminTabs.map((key) => (
          <button
            key={key}
            className={key === tab ? 'active' : ''}
            onClick={() => setSearch({ tab: key, page: '1' })}
          >
            {labels[key]}
          </button>
        ))}
      </nav>
      <AdminPanel
        key={tab}
        tab={tab}
        page={page}
        onPage={(value, replace = false) =>
          setSearch({ tab, page: String(value) }, { replace })
        }
      />
    </section>
  )
}
const blankForm = () => ({
  name: '',
  type: '',
  price: '0',
  img: '',
  abv: '0',
  orderCount: '0',
  latitude: '0',
  longitude: '0',
  image: '',
  stamps: '0',
  role: 'USER',
  pass: '',
})
function AdminPanel({
  tab,
  page,
  onPage,
}: {
  tab: Tab
  page: number
  onPage: (value: number, replace?: boolean) => void
}) {
  const { data: user } = useSession()
  const client = useQueryClient()
  const ui = useUi()
  const query = useQuery<Page<Item>>({
    queryKey: ['admin', user?.id, tab, page],
    queryFn: () => fetchAdminPage(tab, page),
  })
  const lastPage = query.data ? Math.max(1, query.data.totalPages) : page
  const pageOutOfRange =
    query.isSuccess && query.data.page === page && page > lastPage
  useEffect(() => {
    if (pageOutOfRange && !query.isFetching) onPage(lastPage, true)
  }, [pageOutOfRange, query.isFetching, lastPage, onPage])
  const [draft, setDraft] = useState<{
    form: ReturnType<typeof blankForm>
    editing: Item | null
  }>(() => ({ form: blankForm(), editing: null }))
  const { form, editing } = draft
  const [deleting, setDeleting] = useState<Item | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [featureProduct, setFeatureProduct] = useState<Product | null>(null)
  const featureTrigger = useRef<HTMLButtonElement | null>(null)
  const idOf = (item: Item) => ('oId' in item ? item.oId : item.id)
  const saveKey = `admin-${tab}-save`
  const deleteKey = `admin-${tab}-delete`
  function updateForm(form: ReturnType<typeof blankForm>) {
    setDraft((current) => ({ ...current, form }))
  }
  function reset() {
    setDraft({ form: blankForm(), editing: null })
  }
  function edit(item: Item) {
    const next = blankForm()
    for (const key of Object.keys(next) as (keyof typeof next)[]) {
      if (key in item)
        next[key] = String(
          (item as unknown as Record<string, unknown>)[key] ?? '',
        )
    }
    setDraft({ form: next, editing: item })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function refresh() {
    await client.invalidateQueries({ queryKey: ['admin', user?.id, tab] })
    if (tab === 'products' || tab === 'markets')
      await client.invalidateQueries({ queryKey: ['catalog'] })
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    const submitted = draft
    const { form, editing } = submitted
    const result = await ui.run(
      saveKey,
      async () => {
        if (tab === 'products') {
          const payload = {
            name: form.name.trim(),
            type: form.type,
            price: Number(form.price),
            img: form.img.trim(),
            abv: Number(form.abv),
            orderCount: Number(form.orderCount),
          }
          if (editing) await api.updateProduct(idOf(editing), payload)
          else await api.createProduct(payload)
        } else if (tab === 'markets') {
          const payload = {
            name: form.name.trim(),
            latitude: Number(form.latitude),
            longitude: Number(form.longitude),
            image: form.image.trim(),
          }
          if (editing) await api.updateMarket(idOf(editing), payload)
          else await api.createMarket(payload)
        } else if (tab === 'users' && editing) {
          await api.updateUser(idOf(editing), {
            name: form.name.trim(),
            stamps: Number(form.stamps),
            role: form.role,
            ...(form.pass ? { pass: form.pass } : {}),
          })
          await client.invalidateQueries({
            queryKey: ['account', idOf(editing)],
          })
          if (idOf(editing) === user?.id)
            await client.invalidateQueries({ queryKey: ['session'] })
        }
        await refresh()
      },
      `${labels[tab]} 정보가 저장되었습니다.`,
    )
    if (result.ok)
      setDraft((current) =>
        current === submitted ? { form: blankForm(), editing: null } : current,
      )
  }
  async function remove() {
    if (!deleting) return
    const id = idOf(deleting)
    const result = await ui.run(
      deleteKey,
      async () => {
        if (tab === 'products') await api.deleteProduct(id)
        if (tab === 'markets') await api.deleteMarket(id)
        if (tab === 'orders') await api.deleteOrder(id)
        if (tab === 'comments') await api.deleteComment(id)
        if (tab === 'users') await api.deleteUser(id)
        await refresh()
        if (tab === 'comments')
          await client.invalidateQueries({ queryKey: ['reviews'] })
      },
      `${labels[tab]} 정보가 삭제되었습니다.`,
    )
    if (result.ok) {
      setDeleting(null)
      if (tab === 'products')
        setFeatureProduct((current) => (current?.id === id ? null : current))
    }
  }
  async function complete(order: Order) {
    await ui.run(
      `admin-order-complete-${order.oId}`,
      async () => {
        await api.completeOrder(order.oId)
        await refresh()
      },
      '주문을 완료 처리했습니다.',
    )
  }
  function field(
    key: keyof typeof form,
    label: string,
    options: {
      type?: string
      min?: number
      max?: number
      step?: string
      required?: boolean
      maxLength?: number
    } = {},
  ) {
    return (
      <label className="field-group" key={key}>
        <span>{label}</span>
        <input
          className="form-control"
          type={options.type || 'text'}
          required={options.required !== false}
          maxLength={options.maxLength || 100}
          min={options.min}
          max={options.max}
          step={options.step}
          value={form[key]}
          onChange={(e) => updateForm({ ...form, [key]: e.target.value })}
        />
      </label>
    )
  }
  const formVisible =
    tab === 'products' || tab === 'markets' || (tab === 'users' && editing)
  return (
    <>
      <section className="admin-panel">
        <div className="admin-section-heading">
          <div>
            <h2>{tab === 'comments' ? '후기' : labels[tab]} 관리</h2>
            <p>{labels[tab]} 정보를 조회하고 관리합니다.</p>
          </div>
          <span className="result-count">총 {query.data?.total || 0}개</span>
          <button
            className="btn btn-outline-dark btn-sm"
            disabled={query.isFetching}
            onClick={() => query.refetch()}
          >
            현재 탭 새로고침
          </button>
        </div>
        {formVisible && (
          <form className="admin-form" onSubmit={save}>
            {tab === 'products' && (
              <>
                {field('name', '상품명')}
                <label className="field-group">
                  <span>주종</span>
                  <select
                    className="form-select"
                    required
                    value={form.type}
                    aria-label="주종"
                    onChange={(e) => updateForm({ ...form, type: e.target.value })}
                  >
                    <option value="" disabled>
                      주종 선택
                    </option>
                    {categories.map((category) => (
                      <option key={category.label}>{category.label}</option>
                    ))}
                  </select>
                </label>
                {field('price', '가격', { type: 'number', min: 1 })}
                {field('img', '이미지 파일명')}
                {field('abv', '도수', {
                  type: 'number',
                  min: 0,
                  max: 100,
                  step: '0.1',
                })}
                {field('orderCount', '누적 주문 수', {
                  type: 'number',
                  min: 0,
                })}
              </>
            )}
            {tab === 'markets' && (
              <>
                {field('name', '매장명')}
                {field('latitude', '위도', {
                  type: 'number',
                  min: -90,
                  max: 90,
                  step: '0.000001',
                })}
                {field('longitude', '경도', {
                  type: 'number',
                  min: -180,
                  max: 180,
                  step: '0.000001',
                })}
                {field('image', '이미지 경로 (선택)', {
                  required: false,
                  maxLength: 200,
                })}
              </>
            )}
            {tab === 'users' && (
              <>
                <div className="form-context">
                  <strong>{editing && idOf(editing)} 회원</strong>
                </div>
                {field('name', '이름')}
                {field('stamps', '스탬프', { type: 'number', min: 0 })}
                <label className="field-group">
                  <span>권한</span>
                  <select
                    className="form-select"
                    value={form.role}
                    disabled={Boolean(editing && idOf(editing) === user?.id)}
                    onChange={(e) => updateForm({ ...form, role: e.target.value })}
                  >
                    <option value="USER">일반 회원</option>
                    <option value="ADMIN">관리자</option>
                  </select>
                </label>
                {field('pass', '새 비밀번호 (선택)', {
                  type: 'password',
                  required: false,
                })}
              </>
            )}
            <div className="admin-form-actions">
              <button className="btn btn-dark" disabled={ui.pending[saveKey]}>
                {editing ? '변경 저장' : `${labels[tab]} 등록`}
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={reset}
              >
                {editing ? '편집 취소' : '초기화'}
              </button>
            </div>
          </form>
        )}
        {tab === 'products' && featureProduct && user?.role === 'ADMIN' && (
          <ProductFeatureEditor
            key={`${user.id}:${featureProduct.id}`}
            product={featureProduct}
            userId={user.id}
            onClose={() => {
              setFeatureProduct(null)
              if (featureTrigger.current?.isConnected)
                featureTrigger.current.focus()
            }}
          />
        )}
        {query.isPending || pageOutOfRange ? (
          <Loading />
        ) : query.isError ? (
          <Empty title={`${labels[tab]} 정보를 불러오지 못했습니다`}>
            <button onClick={() => query.refetch()}>다시 시도</button>
          </Empty>
        ) : query.data.items.length ? (
          <div
            className={`admin-table ${tab === 'orders' ? 'order-admin-table' : ''}`}
          >
            <div
              className={`table-row table-head ${tab === 'orders' || tab === 'comments' || tab === 'users' ? 'wide' : ''}`}
            >
              {{
                products: ['ID', '상품명', '주종', '가격', '작업'],
                markets: ['ID', '매장명', '위치', '작업'],
                orders: ['주문', '회원', '방식', '상태', '금액', '작업'],
                comments: ['ID', '회원', '상품', '평점', '내용', '작업'],
                users: ['아이디', '이름', '권한', '스탬프', '작업'],
              }[tab].map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            {query.data.items.map((item) => {
              const id = idOf(item)
              if (tab === 'orders') {
                const order = item as Order
                return (
                  <div key={id}>
                    <div className="table-row wide">
                      <button
                        className="text-button order-id"
                        aria-expanded={expanded === order.oId}
                        onClick={() =>
                          setExpanded(expanded === order.oId ? null : order.oId)
                        }
                      >
                        #{order.oId} {expanded === order.oId ? '▴' : '▾'}
                      </button>
                      <strong data-label="회원">
                        {order.userId ?? '탈퇴한 회원'}
                      </strong>
                      <span data-label="방식">
                        {orderType(order.orderType)}
                      </span>
                      <span
                        className={`badge ${order.completed !== 'Y' ? 'muted' : ''}`}
                      >
                        {order.completed === 'Y' ? '완료' : '진행 중'}
                      </span>
                      <strong data-label="금액">
                        {orderMoney(order.totalPrice)}
                      </strong>
                      <div className="button-row table-actions">
                        <button
                          className="btn btn-sm btn-outline-dark"
                          disabled={
                            order.completed === 'Y' ||
                            ui.pending[`admin-order-complete-${order.oId}`]
                          }
                          onClick={() => complete(order)}
                        >
                          완료
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => setDeleting(item)}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                    {expanded === order.oId && (
                      <div className="admin-order-detail">
                        <OrderLines order={order} />
                      </div>
                    )}
                  </div>
                )
              }
              return (
                <div
                  key={id}
                  className={`table-row ${tab === 'comments' || tab === 'users' ? 'wide' : ''}`}
                >
                  <span data-label="ID">{id}</span>
                  {tab === 'products' && (
                    <>
                      <strong>{(item as Product).name}</strong>
                      <span>{(item as Product).type}</span>
                      <span>{money((item as Product).price)}원</span>
                    </>
                  )}
                  {tab === 'markets' && (
                    <>
                      <strong>{(item as Market).name}</strong>
                      <span>
                        {Number((item as Market).latitude).toFixed(5)},{' '}
                        {Number((item as Market).longitude).toFixed(5)}
                      </span>
                    </>
                  )}
                  {tab === 'comments' && (
                    <>
                      <strong>{(item as Review).userId}</strong>
                      <Link to={`/products/${(item as Review).productId}`}>
                        상품 #{(item as Review).productId}
                      </Link>
                      <span className="rating-stars">
                        {'★'.repeat(
                          Math.max(
                            1,
                            Math.min(5, Math.round((item as Review).rating)),
                          ),
                        )}{' '}
                        {Number((item as Review).rating).toFixed(1)}
                      </span>
                      <p>{(item as Review).comment}</p>
                    </>
                  )}
                  {tab === 'users' && (
                    <>
                      <strong>{(item as User).name}</strong>
                      <span className="badge">
                        {(item as User).role === 'ADMIN'
                          ? '관리자'
                          : '일반 회원'}
                      </span>
                      <span>{(item as User).stamps}개</span>
                    </>
                  )}
                  <div className="button-row table-actions">
                    {tab === 'products' && user?.role === 'ADMIN' && (
                      <button
                        className="btn btn-sm btn-outline-dark"
                        disabled={
                          ui.pending[featureSaveKey(user.id, Number(id))]
                        }
                        onClick={(event) => {
                          featureTrigger.current = event.currentTarget
                          setFeatureProduct(item as Product)
                        }}
                      >
                        특성 편집
                      </button>
                    )}
                    {tab !== 'comments' && (
                      <button
                        className="btn btn-sm btn-outline-dark"
                        onClick={() => edit(item)}
                      >
                        편집
                      </button>
                    )}
                    <button
                      className="btn btn-sm btn-outline-danger"
                      disabled={tab === 'users' && id === user?.id}
                      onClick={() => setDeleting(item)}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <Empty title={`등록된 ${labels[tab]} 정보가 없습니다`} />
        )}
        <Pagination page={pageOutOfRange ? undefined : query.data} onChange={onPage} />
      </section>
      {deleting && (
        <Confirm
          title={`${tab === 'comments' ? '후기' : labels[tab]}을 삭제할까요?`}
          description={`선택한 ${labels[tab]} #${idOf(deleting)} 정보를 삭제합니다.`}
          pending={ui.pending[deleteKey]}
          onCancel={() => setDeleting(null)}
          onConfirm={remove}
        />
      )}
    </>
  )
}
