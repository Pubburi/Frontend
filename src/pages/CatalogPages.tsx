import { useEffect, useState, type FormEvent } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiClientError } from '../services/api'
import { categories, carouselImages } from '../catalog'
import { useSession } from '../queries'
import { useCart } from '../state/cart'
import { useUi } from '../state/ui'
import {
  Confirm,
  Empty,
  Image,
  Loading,
  Pagination,
  ProductCard,
  Quantity,
} from '../components/ui'
import { buildProductQuery, parseProductQuery } from '../utils/productFilters'
import { money, productImage } from '../utils/format'
import type { Market, Page, Product, Review } from '../types'

export function HomePage() {
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const products = useQuery<Product[]>({
    queryKey: ['catalog', 'popular'],
    queryFn: api.popularProducts,
  })
  const markets = useQuery<Page<Market>>({
    queryKey: ['catalog', 'markets'],
    queryFn: () => api.markets(),
  })
  return (
    <section className="view home-view">
      <section
        className="hero-carousel"
        aria-roledescription="carousel"
        aria-label="추천 주류"
      >
        {carouselImages.map((src, i) => (
          <div
            key={src}
            className={`hero-slide ${i === active ? 'active' : ''}`}
            aria-hidden={i !== active}
          >
            <Image src={src} loading={i === 0 ? 'eager' : 'lazy'} />
          </div>
        ))}
        <div className="hero-copy">
          <p>오늘의 주류 셀렉션</p>
          <h1>취향과 순간에 어울리는 한 잔</h1>
          <span>
            가볍게 즐기는 맥주부터 천천히 음미하는 위스키까지 만나보세요.
          </span>
          <Link className="btn btn-light hero-cta" to="/products">
            전체 주류 둘러보기
          </Link>
        </div>
        <button
          className="carousel-control prev"
          aria-label="이전 배너"
          onClick={() => setActive((active + 5) % 6)}
        >
          ‹
        </button>
        <button
          className="carousel-control next"
          aria-label="다음 배너"
          onClick={() => setActive((active + 1) % 6)}
        >
          ›
        </button>
        <div className="carousel-dots" aria-label="배너 선택">
          {carouselImages.map((_, i) => (
            <button
              key={i}
              className={i === active ? 'active' : ''}
              aria-label={`${i + 1}번 배너 보기`}
              aria-current={i === active ? 'true' : undefined}
              onClick={() => setActive(i)}
            />
          ))}
        </div>
      </section>
      <section className="section-band">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Category</p>
            <h2>주종으로 빠르게 찾기</h2>
            <p className="muted heading-description">
              모든 주종을 같은 자리에서 비교해 보세요.
            </p>
          </div>
          <Link className="btn btn-outline-dark btn-sm" to="/products">
            전체 보기
          </Link>
        </div>
        <div className="category-strip">
          {categories.map((category) => (
            <button
              key={category.label}
              onClick={() =>
                navigate(
                  `/products?${new URLSearchParams({ type: category.label, sort: 'popular', page: '1' })}`,
                )
              }
            >
              <Image src={category.image} alt={category.label} />
              <span>{category.label}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="section-band">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Popular</p>
            <h2>주문 수량으로 둘러보기</h2>
            <p className="muted">시연용 누적 주문 수량 기준입니다.</p>
          </div>
          <Link className="text-link" to="/products?sort=popular">
            더 보기 →
          </Link>
        </div>
        {products.isPending ? (
          <Loading />
        ) : products.isError ? (
          <Empty title="추천 상품을 불러오지 못했습니다">
            <button
              className="btn btn-outline-dark"
              onClick={() => products.refetch()}
            >
              다시 시도
            </button>
          </Empty>
        ) : products.data.length ? (
          <div className="product-grid">
            {products.data.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        ) : (
          <Empty title="추천 상품을 준비하고 있습니다" />
        )}
      </section>
      <section className="section-band">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Stores</p>
            <h2>주점부리 매장</h2>
            <p className="muted heading-description">
              가까운 매장의 위치 정보를 확인하세요.
            </p>
          </div>
        </div>
        {markets.isPending ? (
          <Loading label="매장 정보를 불러오는 중입니다." />
        ) : markets.isError ? (
          <Empty title="매장 정보를 불러오지 못했습니다">
            <button onClick={() => markets.refetch()}>다시 시도</button>
          </Empty>
        ) : markets.data.items.length ? (
          <div className="market-grid">
            {markets.data.items.map((market) => (
              <article key={market.id} className="market-row">
                <div>
                  <span className="eyebrow">Store {market.id}</span>
                  <strong>{market.name}</strong>
                </div>
                <span className="muted">
                  {Number(market.latitude).toFixed(5)},{' '}
                  {Number(market.longitude).toFixed(5)}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <Empty title="등록된 매장이 없습니다" />
        )}
      </section>
    </section>
  )
}

export function ProductsPage() {
  const [search, setSearch] = useSearchParams()
  const filters = parseProductQuery(
    Object.fromEntries(search),
    categories.map((category) => category.label),
  )
  const [form, setForm] = useState(filters)
  useEffect(() => setForm(filters), [search.toString()])
  const products = useQuery<Page<Product>>({
    queryKey: ['catalog', 'products', filters],
    queryFn: () => api.products(filters),
  })
  function navigate(page = 1) {
    setSearch(
      new URLSearchParams(
        Object.entries(buildProductQuery(form, page)).map(([key, value]) => [
          key,
          String(value),
        ]),
      ),
    )
  }
  function reset() {
    setForm(
      parseProductQuery(
        {},
        categories.map((category) => category.label),
      ),
    )
    setSearch({ sort: 'popular', page: '1' })
  }
  return (
    <section className="view products-view">
      <div className="shop-intro">
        <div>
          <p className="section-kicker">Bottle Shop</p>
          <h1>전체 주류 둘러보기</h1>
          <p>탁주·청주부터 맥주, 위스키와 사케까지 한 곳에서 비교해 보세요.</p>
        </div>
        <span className="result-count">
          총 <strong>{products.data?.total || 0}</strong>개
        </span>
      </div>
      <form
        className="filter-panel"
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          navigate()
        }}
      >
        <label className="field-group">
          <span>주종</span>
          <select
            className="form-select"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="">전체 주종</option>
            {categories.map((item) => (
              <option key={item.label}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className="field-group field-search">
          <span>상품 검색</span>
          <input
            className="form-control"
            placeholder="상품명 또는 주종을 입력하세요"
            maxLength={100}
            value={form.q}
            onChange={(e) => setForm({ ...form, q: e.target.value })}
          />
        </label>
        <label className="field-group">
          <span>정렬</span>
          <select
            className="form-select"
            value={form.sort}
            onChange={(e) => setForm({ ...form, sort: e.target.value })}
          >
            {[
              ['popular', '인기순'],
              ['priceAsc', '낮은 가격순'],
              ['priceDesc', '높은 가격순'],
              ['name', '이름순'],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn btn-dark filter-submit"
          aria-busy={products.isFetching}
        >
          검색하기
        </button>
      </form>
      {(form.type || form.q.trim()) && (
        <div className="active-filters" aria-label="적용된 필터">
          {form.type && <span>{form.type}</span>}
          {form.q.trim() && <span>검색: {form.q.trim()}</span>}
          <button className="text-link" onClick={reset}>
            전체 해제
          </button>
        </div>
      )}
      {products.isPending ? (
        <Loading />
      ) : products.isError ? (
        <Empty
          icon="!"
          title="상품을 불러오지 못했습니다"
          description="연결 상태를 확인한 뒤 다시 시도해 주세요."
        >
          <button className="btn btn-dark" onClick={() => products.refetch()}>
            다시 시도
          </button>
        </Empty>
      ) : products.data.items.length ? (
        <div className="product-grid">
          {products.data.items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <Empty
          icon="⌕"
          title="조건에 맞는 상품이 없습니다"
          description="검색어나 주종을 바꿔 다시 찾아보세요."
        >
          <button className="btn btn-outline-dark" onClick={reset}>
            모든 상품 보기
          </button>
        </Empty>
      )}
      <Pagination page={products.data} onChange={navigate} />
    </section>
  )
}

const stars = (rating: number) =>
  '★'.repeat(Math.max(1, Math.min(5, Math.round(Number(rating)))))
export function ProductDetailPage() {
  const { id = '' } = useParams()
  return <ProductDetail key={id} id={id} />
}
function ProductDetail({ id }: { id: string }) {
  const session = useSession()
  const ui = useUi()
  const cart = useCart()
  const client = useQueryClient()
  const location = useLocation()
  const [quantity, setQuantity] = useState(1)
  const [page, setPage] = useState(1)
  const [rating, setRating] = useState(5)
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<Review | null>(null)
  const [deleting, setDeleting] = useState<Review | null>(null)
  const product = useQuery<Product>({
    queryKey: ['catalog', 'product', id],
    queryFn: () => api.product(id),
  })
  const comments = useQuery<Page<Review>>({
    queryKey: ['reviews', id, page],
    queryFn: () => api.comments(id, { page, size: 10 }),
    enabled: product.isSuccess,
  })
  async function refresh() {
    await client.invalidateQueries({ queryKey: ['reviews', id] })
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    const result = await ui.run(
      'comment-create',
      async () => {
        await api.createComment({
          productId: Number(id),
          rating,
          comment: text.trim(),
        })
        await refresh()
      },
      '후기가 등록되었습니다.',
    )
    if (result.ok) setText('')
  }
  async function saveReview(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    const result = await ui.run(
      `comment-edit-${editing.id}`,
      async () => {
        await api.updateComment(editing.id, {
          rating: editing.rating,
          comment: editing.comment.trim(),
        })
        await refresh()
      },
      '후기가 수정되었습니다.',
    )
    if (result.ok) setEditing(null)
  }
  async function removeReview() {
    if (!deleting) return
    const result = await ui.run(
      'comment-delete',
      async () => {
        await api.deleteComment(deleting.id)
        if (comments.data?.items.length === 1 && page > 1) setPage(page - 1)
        await refresh()
      },
      '후기가 삭제되었습니다.',
    )
    if (result.ok) setDeleting(null)
  }
  if (product.isPending)
    return <Loading label="상품 상세를 불러오는 중입니다." />
  if (product.isError)
    return product.error instanceof ApiClientError &&
      product.error.status === 404 ? (
      <Empty
        icon="404"
        title="상품을 찾을 수 없습니다"
        description="판매가 종료되었거나 존재하지 않는 상품입니다."
      >
        <Link className="btn btn-dark" to="/products">
          전체 주류 보기
        </Link>
      </Empty>
    ) : (
      <Empty icon="!" title="상품을 불러오지 못했습니다">
        <button className="btn btn-dark" onClick={() => product.refetch()}>
          다시 시도
        </button>
      </Empty>
    )
  const item = product.data
  return (
    <>
      <section className="view detail-layout">
        <div className="detail-media">
          <Image src={productImage(item)} alt={item.name} loading="eager" />
        </div>
        <div className="detail-panel">
          <div className="detail-copy">
            <p className="product-type">{item.type}</p>
            <h1>{item.name}</h1>
            <p className="detail-description">
              취향에 맞는 방식으로 천천히 즐겨보세요.
            </p>
          </div>
          <div className="detail-stats" aria-label="상품 정보">
            <span className="stat-pill">
              <strong>{money(item.price)}원</strong>
            </span>
            <span className="stat-pill">도수 {item.abv}%</span>
            <span className="stat-pill">누적 주문 {item.orderCount}회</span>
          </div>
          <div className="purchase-box">
            <div>
              <span className="field-label">수량</span>
              <Quantity
                value={quantity}
                onChange={setQuantity}
                label={`${item.name} 수량`}
              />
            </div>
            <strong>{money(item.price * quantity)}원</strong>
          </div>
          <button
            className="btn btn-gold btn-wide detail-cart-button"
            onClick={() => {
              cart.add(item, quantity)
              ui.status(`${item.name} ${quantity}개를 장바구니에 담았습니다.`)
            }}
          >
            {quantity}개 장바구니에 담기
          </button>
          <div className="comment-box">
            <div className="comment-title">
              <div>
                <p className="section-kicker">Reviews</p>
                <h2>
                  구매 후기 <span>{comments.data?.total || 0}</span>
                </h2>
              </div>
            </div>
            {session.data ? (
              <form className="comment-form" onSubmit={submit}>
                <label className="field-group compact-field">
                  <span>평점</span>
                  <select
                    className="form-select"
                    value={rating}
                    onChange={(e) => setRating(Number(e.target.value))}
                  >
                    {[5, 4, 3, 2, 1].map((value) => (
                      <option key={value} value={value}>
                        {value}점
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-group comment-input">
                  <span>후기</span>
                  <textarea
                    className="form-control"
                    maxLength={200}
                    placeholder="상품에 대한 솔직한 후기를 남겨주세요."
                    aria-label="후기"
                    required
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <small>{text.length} / 200</small>
                </label>
                <button
                  className="btn btn-dark"
                  disabled={ui.pending['comment-create']}
                >
                  후기 등록
                </button>
              </form>
            ) : (
              <div className="login-prompt">
                <p>로그인하고 이 상품의 후기를 남겨보세요.</p>
                <Link
                  className="btn btn-outline-dark btn-sm"
                  to={`/account?${new URLSearchParams({ redirect: location.pathname + location.search })}`}
                >
                  로그인
                </Link>
              </div>
            )}
            {comments.isPending ? (
              <Loading label="후기를 불러오는 중입니다." />
            ) : comments.isError ? (
              <Empty title="후기를 불러오지 못했습니다">
                <button onClick={() => comments.refetch()}>다시 시도</button>
              </Empty>
            ) : comments.data.items.length ? (
              <div className="comment-list">
                {comments.data.items.map((comment) => (
                  <article key={comment.id} className="comment-row">
                    <div className="comment-head">
                      <div>
                        <strong>{comment.userId}</strong>
                        <span
                          className="rating-stars"
                          aria-label={`${comment.rating}점`}
                        >
                          {stars(comment.rating)}
                        </span>
                      </div>
                      <span className="badge">
                        {Number(comment.rating).toFixed(1)}점
                      </span>
                    </div>
                    {editing?.id === comment.id ? (
                      <form className="comment-edit-form" onSubmit={saveReview}>
                        <label className="field-group compact-field">
                          <span>평점</span>
                          <select
                            className="form-select"
                            value={editing.rating}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                rating: Number(e.target.value),
                              })
                            }
                          >
                            {[5, 4, 3, 2, 1].map((value) => (
                              <option key={value} value={value}>
                                {value}점
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field-group">
                          <span>후기 내용</span>
                          <textarea
                            className="form-control"
                            aria-label="후기 내용"
                            maxLength={200}
                            required
                            value={editing.comment}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                comment: e.target.value,
                              })
                            }
                          />
                        </label>
                        <div className="button-row">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => setEditing(null)}
                          >
                            취소
                          </button>
                          <button
                            className="btn btn-sm btn-dark"
                            disabled={ui.pending[`comment-edit-${comment.id}`]}
                          >
                            저장
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <p>{comment.comment}</p>
                        {(session.data?.role === 'ADMIN' ||
                          session.data?.id === comment.userId) && (
                          <div className="button-row">
                            <button
                              className="text-button"
                              onClick={() => setEditing({ ...comment })}
                            >
                              수정
                            </button>
                            <button
                              className="text-button danger-text"
                              onClick={() => setDeleting(comment)}
                            >
                              삭제
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </article>
                ))}
                <Pagination page={comments.data} onChange={setPage} />
              </div>
            ) : (
              <Empty
                title="아직 등록된 후기가 없습니다"
                description="첫 번째 후기를 남겨보세요."
              />
            )}
          </div>
        </div>
      </section>
      {deleting && (
        <Confirm
          title="후기를 삭제할까요?"
          description="삭제한 후기는 복구할 수 없습니다."
          pending={ui.pending['comment-delete']}
          onCancel={() => setDeleting(null)}
          onConfirm={removeReview}
        />
      )}
    </>
  )
}
