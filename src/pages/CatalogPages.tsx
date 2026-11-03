import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiClientError, pageQuery } from '../services/api'
import { categories, carouselImages } from '../catalog'
import { useSession } from '../queries'
import { useCart } from '../state/cart'
import { useUi } from '../state/ui'
import { ProductFavorite } from '../components/FavoriteAction'
import { SearchTagFields } from '../components/SearchTagFields'
import { productTagFields, buildProductTags, normalizeProductTag, validateProductTags, type ProductTagKey, type ProductTagIssues } from '../productTags'
import { ProductFeatureDetails } from '../components/ProductFeatureDetails'
import { CompareAction } from '../components/CompareAction'
import { useRecordRecentVisit } from '../components/RecentVisit'
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
import { productRangeFields, validateProductRanges, type ProductRangeKey, type ProductRangeErrors } from '../productRanges'
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
  const location = useLocation()
  const filters = parseProductQuery(
    { ...Object.fromEntries(search), tasteTag: search.getAll('tasteTag'), aromaTag: search.getAll('aromaTag') },
    categories.map((category) => category.label),
  )
  const urlRangeOptions = {
    provided: productRangeFields.filter(({ key }) => search.has(key)).map(({ key }) => key),
    duplicates: productRangeFields.filter(({ key }) => search.getAll(key).length > 1).map(({ key }) => key),
  }
  const urlRangeErrors = validateProductRanges(filters, urlRangeOptions)
  const urlTagIssues = validateProductTags(filters)
  const invalidUrlFilters = Object.keys(urlRangeErrors).length > 0 || Object.keys(urlTagIssues).length > 0
  const [form, setForm] = useState(filters)
  const [rangeErrors, setRangeErrors] = useState<ProductRangeErrors>(urlRangeErrors)
  const [tagIssues, setTagIssues] = useState<ProductTagIssues>(urlTagIssues)
  const tagInputs = useRef<Partial<Record<ProductTagKey, (HTMLTextAreaElement | null)[]>>>({})
  const rangeInputs = useRef<Partial<Record<ProductRangeKey, HTMLInputElement | null>>>({})
  useEffect(() => {
    setForm(filters)
    setRangeErrors(urlRangeErrors)
    setTagIssues(urlTagIssues)
  }, [search.toString()])
  const products = useQuery<Page<Product>>({
    queryKey: ['catalog', 'products', filters],
    queryFn: () => api.products(filters),
    enabled: !invalidUrlFilters,
    refetchOnReconnect: (query) => !(query.state.error instanceof ApiClientError && query.state.error.status === 400),
  })
  const rejectedTags = products.isError && products.error instanceof ApiClientError && products.error.status === 400 &&
    productTagFields.some(({ key }) => filters[key].length > 0)
  const searchButton = useRef<HTMLButtonElement>(null)
  const results = useRef<HTMLElement>(null)
  function editRange(key: ProductRangeKey, value: string) {
    const next = { ...form, [key]: value }
    setForm(next)
    if (Object.keys(rangeErrors).length) setRangeErrors(validateProductRanges(next))
  }
  function editTags(key: ProductTagKey, tags: string[]) {
    const next = { ...form, [key]: tags }
    setForm(next)
    if (Object.keys(tagIssues).length) setTagIssues(validateProductTags(next))
  }
  function submitSearch(event: FormEvent) {
    event.preventDefault()
    const errors = validateProductRanges(form)
    setRangeErrors(errors)
    const tags = validateProductTags(form)
    setTagIssues(tags)
    const first = productRangeFields.find(({ key }) => errors[key])
    if (first) {
      rangeInputs.current[first.key]?.focus()
      return
    }
    const firstTag = productTagFields.find(({ key }) => tags[key])
    if (firstTag) {
      tagInputs.current[firstTag.key]?.[tags[firstTag.key]!.index]?.focus()
      return
    }
    const canonical = { ...form, ...buildProductTags(form) }
    setForm(canonical)
    navigate(1, canonical)
  }
  function navigate(page = 1, criteria = form) {
    setSearch(new URLSearchParams(pageQuery(buildProductQuery(criteria, page))))
  }
  function changeKeyboardPage(page: number, trigger: HTMLButtonElement) {
    if (document.activeElement !== trigger || !results.current) {
      navigate(page, filters)
      return
    }
    const destination = new URLSearchParams(pageQuery(buildProductQuery(filters, page)))
    // This element survives loading, success and rejection. No response moves focus.
    results.current.focus({ preventScroll: true })
    results.current.scrollIntoView({ block: 'start', behavior: 'instant' })
    setSearch(destination, { state: { catalogPagination: {
      fromLocationKey: location.key,
      destination: location.pathname + '?' + destination.toString(),
    } } })
  }
  function reset() {
    setRangeErrors({})
    setTagIssues({})
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
          {invalidUrlFilters || rejectedTags ? '조건 확인 필요' : <>총 <strong>{products.data?.total || 0}</strong>개</>}
        </span>
      </div>
      <form
        className="filter-panel"
        role="search"
        noValidate
        onSubmit={submitSearch}
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
        <fieldset className="range-filter-group">
          <legend>가격·도수 범위</legend>
          <p className="muted" id="range-filter-help">빈 값은 제한하지 않으며, 입력한 모든 범위를 함께 적용합니다.</p>
          <div className="range-filter-fields">
            {productRangeFields.map(({ key, label, kind }) => (
              <label className="field-group" key={key}>
                <span>{label}</span>
                <input
                  ref={(element) => { rangeInputs.current[key] = element }}
                  className="form-control"
                  type="text"
                  inputMode={kind === 'price' ? 'numeric' : 'decimal'}
                  aria-label={label}
                  aria-invalid={rangeErrors[key] ? true : undefined}
                  aria-describedby={rangeErrors[key] ? `range-error-${key}` : 'range-filter-help'}
                  value={form[key]}
                  onChange={(event) => editRange(key, event.target.value)}
                />
                {rangeErrors[key] && <small id={`range-error-${key}`} className="range-field-error">{rangeErrors[key]}</small>}
              </label>
            ))}
          </div>
        </fieldset>
        <SearchTagFields values={form} issues={tagIssues} onChange={editTags} registerInput={(key, index, element) => {
          tagInputs.current[key] ??= []
          tagInputs.current[key]![index] = element
        }} />
        <button
          ref={searchButton}
          className="btn btn-dark filter-submit"
          aria-busy={products.isFetching}
        >
          검색하기
        </button>
      </form>
      <p className="applied-range-summary" aria-label="현재 적용된 가격·도수 범위">
        <strong>현재 적용 범위</strong>{' '}
        {invalidUrlFilters || rejectedTags ? '검색 조건을 확인해 주세요.' :
          productRangeFields.filter(({ key }) => filters[key] !== '').map(({ key, kind, bound }) =>
            `${kind === 'price' ? `${money(filters[key])}원` : `${filters[key]}%`} ${bound}`,
          ).join(' · ') || '가격·도수 제한 없음'}
      </p>
      <div className="applied-tag-summary" aria-label="현재 적용된 태그 조건">
        <strong>현재 적용 태그</strong>
        {invalidUrlFilters || rejectedTags ? <span>검색 조건을 확인해 주세요.</span> :
          productTagFields.some(({ key }) => filters[key].length) ? productTagFields.map(({ key, label }) => filters[key].length > 0 &&
            <span key={key}>{label}: {filters[key].map((tag, index) => <span className="search-tag-value" key={index}>{normalizeProductTag(tag)}</span>)}</span>
          ) : <span>태그 제한 없음</span>}
      </div>
      {(form.type || form.q.trim() || productRangeFields.some(({ key }) => form[key] !== '') || productTagFields.some(({ key }) => form[key].length || filters[key].length) || invalidUrlFilters) && (
        <div className="active-filters" aria-label="적용된 필터">
          {form.type && <span>{form.type}</span>}
          {form.q.trim() && <span>검색: {form.q.trim()}</span>}
          {productRangeFields.filter(({ key }) => form[key] !== '').map(({ key, label }) => <span key={key}>{label}: {form[key]}</span>)}
          <button className="text-link" onClick={reset}>
            전체 해제
          </button>
        </div>
      )}
      <section ref={results} className="product-results" aria-label="상품 검색 결과"
        aria-busy={products.isFetching} tabIndex={-1} data-catalog-results="true">
      {invalidUrlFilters ? (
        <Empty title="검색 조건을 확인해 주세요" description="가격·도수 범위와 태그 조건을 고치고 검색하거나 전체 해제해 주세요. 결과를 불러오지 않았습니다." />
      ) : rejectedTags ? (
        <Empty title="검색 조건을 확인해 주세요" description="입력한 검색 조건을 허용하지 않는 응답을 받았습니다. 태그의 중복·길이와 범위를 수정하거나 전체 해제해 주세요.">
          <button className="btn btn-dark" onClick={() => {
            const key = productTagFields.find(({ key }) => form[key].length)?.key
            const input = key ? tagInputs.current[key]?.[0] : null
            const target = input ?? searchButton.current
            target?.focus()
          }}>태그 조건 수정</button>
        </Empty>
      ) : products.isPending ? (
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
          description="검색어·주종이나 가격·도수·태그 조건을 바꿔 다시 찾아보세요."
        >
          <button className="btn btn-outline-dark" onClick={reset}>
            모든 상품 보기
          </button>
        </Empty>
      )}
      </section>
      <Pagination page={invalidUrlFilters ? undefined : products.data}
        onChange={(page) => navigate(page, filters)} onKeyboardNavigate={changeKeyboardPage} />
    </section>
  )
}

const stars = (rating: number) =>
  '★'.repeat(Math.max(1, Math.min(5, Math.round(Number(rating)))))
export function ProductDetailPage() {
  const { id = '' } = useParams()
  return <ProductDetail key={id} id={id} />
}
type ReviewEdit = Review & { initialRating: number }
function ProductDetail({ id }: { id: string }) {
  const session = useSession()
  const ui = useUi()
  const cart = useCart()
  const client = useQueryClient()
  const location = useLocation()
  const [quantity, setQuantity] = useState(1)
  const [page, setPage] = useState(1)
  const [draft, setDraft] = useState({ rating: 5, comment: '' })
  const [editing, setEditing] = useState<ReviewEdit | null>(null)
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
  useRecordRecentVisit(product.data?.id === Number(id) ? product.data.id : undefined,
    product.isSuccess && !product.isFetching && !product.isPaused, location.key)
  async function refresh() {
    await client.invalidateQueries({ queryKey: ['reviews', id] })
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    const submitted = draft
    const result = await ui.run(
      'comment-create',
      async () => {
        await api.createComment({
          productId: Number(id),
          rating: submitted.rating,
          comment: submitted.comment.trim(),
        })
        await refresh()
      },
      '후기가 등록되었습니다.',
    )
    if (result.ok)
      setDraft((current) =>
        current === submitted ? { ...current, comment: '' } : current,
      )
  }
  async function saveReview(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    const submitted = editing
    const result = await ui.run(
      `comment-edit-${submitted.id}`,
      async () => {
        await api.updateComment(submitted.id, {
          rating: submitted.rating,
          comment: submitted.comment.trim(),
        })
        await refresh()
      },
      '후기가 수정되었습니다.',
    )
    if (result.ok)
      setEditing((current) => (current === submitted ? null : current))
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
          <ProductFavorite product={item} />
          <CompareAction product={item} />
          <ProductFeatureDetails productId={item.id} />
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
                    value={draft.rating}
                    onChange={(e) =>
                      setDraft({ ...draft, rating: Number(e.target.value) })
                    }
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
                    value={draft.comment}
                    onChange={(e) =>
                      setDraft({ ...draft, comment: e.target.value })
                    }
                  />
                  <small>{draft.comment.length} / 200</small>
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
                            {Array.from(
                              new Set([
                                5, 4, 3, 2, 1,
                                comment.rating,
                                editing.initialRating,
                                editing.rating,
                              ]),
                            )
                              .sort((a, b) => b - a)
                              .map((value) => (
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
                              onClick={() => setEditing({
                                ...comment,
                                initialRating: comment.rating,
                              })}
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
