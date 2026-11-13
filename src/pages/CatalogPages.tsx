import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiClientError, pageQuery } from '../services/api'
import { categories, carouselImages } from '../catalog'
import { useSession } from '../queries'
import { useAccountCart } from '../state/accountCart'
import { useUi } from '../state/ui'
import { ProductFavorite } from '../components/FavoriteAction'
import { SearchTagFields } from '../components/SearchTagFields'
import { TagEditor } from '../components/TagEditor'
import { buildReviewTasteTags, readReviewTasteTags } from '../reviewTasteTags'
import { SearchPhrases } from '../components/SearchPhrases'
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
import { buildProductQuery, parseProductQuery, removeProductCondition } from '../utils/productFilters'
import { productRangeFields, validateProductRanges, type ProductRangeKey, type ProductRangeErrors } from '../productRanges'
import { money, productImage } from '../utils/format'
import type { Market, Page, Product, Review } from '../types'
import { ContentRecommendations } from '../components/ContentRecommendations'
import { SimilarProducts } from '../components/SimilarProducts'
import { RecommendationFeedback } from '../components/RecommendationFeedback'
import { ProductNotebook } from '../components/Notebook'
import { HomeProductSearch } from '../components/HomeProductSearch'
import { HomeProductThemes } from '../components/HomeProductThemes'
import { reviewSummary, type ReviewPage } from '../reviewSummary'
import './catalog-ux.css'

export function HomePage() {
  const [active, setActive] = useState(0)
  const products = useQuery<Product[]>({
    queryKey: ['catalog', 'popular'],
    queryFn: api.popularProducts,
  })
  const markets = useQuery<Page<Market>>({
    queryKey: ['catalog', 'markets'],
    queryFn: () => api.markets(),
  })
  return (
    <section className="view home-view catalog-home">
      <section className="catalog-home-lead" aria-labelledby="catalog-home-title">
        <div className="catalog-home-copy">
          <p className="section-kicker">주점부리 셀렉션</p>
          <h1 id="catalog-home-title">취향과 순간에 어울리는 한 잔</h1>
          <p>상품명으로 찾거나 주종과 도수, 가격을 비교해 보세요.</p>
          <HomeProductSearch />
          <Link className="text-link catalog-home-all" to="/products">
            전체 주류 둘러보기
          </Link>
        </div>
        <div className="hero-carousel" role="group" aria-roledescription="carousel" aria-label="추천 주류">
          {carouselImages.map((src, i) => (
            <div key={src} className={`hero-slide ${i === active ? 'active' : ''}`} aria-hidden={i !== active}>
              <Image src={src} loading={i === 0 ? 'eager' : 'lazy'} />
            </div>
          ))}
          <button type="button" className="carousel-control prev" aria-label="이전 배너"
            onClick={() => setActive((i) => (i + carouselImages.length - 1) % carouselImages.length)}>‹</button>
          <button type="button" className="carousel-control next" aria-label="다음 배너"
            onClick={() => setActive((i) => (i + 1) % carouselImages.length)}>›</button>
          <div className="carousel-dots" aria-label="배너 선택">
            {carouselImages.map((src, i) => <button key={src} type="button"
              className={i === active ? 'active' : ''} aria-label={`${i + 1}번 배너 보기`}
              aria-current={i === active ? 'true' : undefined} onClick={() => setActive(i)} />)}
          </div>
        </div>
      </section>
      <section className="section-band catalog-home-categories">
        <div className="section-heading">
          <div>
            <h2>주종으로 빠르게 찾기</h2>
          </div>
        </div>
        <div className="category-strip">
          {categories.map((category) => (
            <Link
              key={category.label}
              to={`/products?${new URLSearchParams({ type: category.label, sort: 'popular', page: '1' })}`}
            >
              <Image src={category.image} />
              <span>{category.label}</span>
            </Link>
          ))}
        </div>
      </section>
      <HomeProductThemes />
      <ContentRecommendations />
      <ContentRecommendations exploration />
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
            <h2 id="stores" tabIndex={-1}>주점부리 매장</h2>
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
                <Link className="text-link" to={`/markets/${market.id}`} aria-label={`${market.name} 상세 보기`}>매장 상세 보기 →</Link>
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
  const hasAppliedFilters = Boolean(filters.type || filters.q || productRangeFields.some(({ key }) => filters[key] !== '') || productTagFields.some(({ key }) => filters[key].length) || invalidUrlFilters)
  const hasDraftFilters = Boolean(form.type || form.q.trim() || productRangeFields.some(({ key }) => form[key] !== '') || productTagFields.some(({ key }) => form[key].length))
  const tagInputs = useRef<Partial<Record<ProductTagKey, (HTMLTextAreaElement | null)[]>>>({})
  const rangeInputs = useRef<Partial<Record<ProductRangeKey, HTMLInputElement | null>>>({})
  const filterRoot = useRef<HTMLElement>(null)
  const advancedFilters = useRef<HTMLDetailsElement>(null)
  const initiallyInvalid = useRef(invalidUrlFilters)
  const clearFilters = useRef<HTMLButtonElement>(null)
  const removalNumber = useRef(0)
  type Removal = { token: number; fromLocationKey: string; destination: string }
  const removalDraft = useRef<Removal | null>(null)
  const removalFocus = useRef<(Removal & { source: HTMLButtonElement; index: number }) | null>(null)
  const retainedDraft = useRef<{ fromLocationKey: string; destination: string } | null>(null)
  useEffect(() => {
    const removal = removalDraft.current
    removalDraft.current = null
    const retained = retainedDraft.current
    retainedDraft.current = null
    const intent = location.state?.catalogPageRepair ?? location.state?.catalogResultsNavigation
    if (removal && location.state?.catalogFilterRemoval?.token === removal.token &&
        location.pathname + location.search === removal.destination) return
    if (retained && intent?.fromLocationKey === retained.fromLocationKey &&
        location.pathname + location.search === retained.destination) {
      setForm((current) => ({ ...current, page: filters.page }))
      return
    }
    setForm(filters)
    setRangeErrors(urlRangeErrors)
    setTagIssues(urlTagIssues)
    if (invalidUrlFilters && advancedFilters.current) advancedFilters.current.open = true
  }, [search.toString()])
  const products = useQuery({
    queryKey: ['catalog', 'products', filters],
    queryFn: () => api.catalogProducts(filters),
    enabled: !invalidUrlFilters,
    refetchOnReconnect: (query) => !(query.state.error instanceof ApiClientError && query.state.error.status === 400),
  })
  const resultPage = products.data?.page
  const searchHint = !invalidUrlFilters && products.isSuccess && products.fetchStatus === 'idle' && resultPage?.page === filters.page
    ? products.data.hint : null
  const repairPage = !invalidUrlFilters && products.isSuccess && resultPage && resultPage.page === filters.page &&
    resultPage.items.length === 0 && resultPage.total > 0 && Number.isSafeInteger(resultPage.totalPages) &&
    resultPage.totalPages > 0 && filters.page > resultPage.totalPages ? resultPage.totalPages : null
  const confirmedTotal = !invalidUrlFilters && products.isSuccess && products.fetchStatus === 'idle' &&
    resultPage?.page === filters.page && repairPage === null ? resultPage.total : null
  useEffect(() => {
    if (repairPage === null || products.fetchStatus !== 'idle' || retainedDraft.current?.fromLocationKey === location.key) return
    const destination = new URLSearchParams(search)
    destination.set('page', String(repairPage))
    const repair = { fromLocationKey: location.key, destination: location.pathname + '?' + destination.toString() }
    retainedDraft.current = repair
    setSearch(destination, { replace: true, state: { catalogPageRepair: repair } })
  }, [repairPage, products.fetchStatus, search, location.key, location.pathname, setSearch])
  const rejectedTags = products.isError && products.error instanceof ApiClientError && products.error.status === 400 &&
    productTagFields.some(({ key }) => filters[key].length > 0)
  const hasAdvancedError = Boolean(Object.keys(rangeErrors).length || Object.keys(tagIssues).length || rejectedTags)
  const searchButton = useRef<HTMLButtonElement>(null)
  const results = useRef<HTMLElement>(null)
  const phraseHeading = useRef<HTMLHeadingElement>(null)
  useLayoutEffect(() => {
    const intent = removalFocus.current
    removalFocus.current = null
    if (!intent || location.state?.catalogFilterRemoval?.token !== intent.token ||
        location.pathname + location.search !== intent.destination) return
    const active = document.activeElement
    if (active !== intent.source && (intent.source.isConnected || active !== document.body)) return
    const controls = filterRoot.current?.querySelectorAll<HTMLButtonElement>('button[data-applied-remove]')
    const target = controls?.[Math.min(intent.index, controls.length - 1)] ?? clearFilters.current ?? searchButton.current
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, [location.key, search.toString()])
  function removeCondition(event: MouseEvent<HTMLButtonElement>, key: 'type' | 'q' | ProductRangeKey | ProductTagKey, index?: number) {
    const removed = removeProductCondition(search, filters, form, key, index)
    if (!removed) return
    const intent = { token: ++removalNumber.current, fromLocationKey: location.key,
      destination: location.pathname + '?' + removed.search.toString() }
    removalDraft.current = intent
    const source = event.currentTarget
    const position = Array.from(filterRoot.current?.querySelectorAll<HTMLButtonElement>('button[data-applied-remove]') ?? []).indexOf(source)
    removalFocus.current = event.detail === 0 && document.activeElement === source && position >= 0 ? { ...intent, source, index: position } : null
    setForm(removed.form)
    const unchangedRanges = productRangeFields.filter(({ key }) => removed.form[key] === filters[key])
    setRangeErrors(validateProductRanges(removed.form, {
      provided: unchangedRanges.filter(({ key }) => removed.search.has(key)).map(({ key }) => key),
      duplicates: unchangedRanges.filter(({ key }) => removed.search.getAll(key).length > 1).map(({ key }) => key),
    }))
    setTagIssues(validateProductTags(removed.form))
    setSearch(removed.search, { state: { catalogFilterRemoval: intent } })
  }
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
      if (advancedFilters.current) advancedFilters.current.open = true
      rangeInputs.current[first.key]?.focus()
      return
    }
    const firstTag = productTagFields.find(({ key }) => tags[key])
    if (firstTag) {
      if (advancedFilters.current) advancedFilters.current.open = true
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
    setSearch(destination, { state: { catalogResultsNavigation: {
      fromLocationKey: location.key,
      destination: location.pathname + '?' + destination.toString(),
    } } })
  }
  function applySearchHint() {
    if (!searchHint) return
    const destination = new URLSearchParams(search)
    destination.set('q', searchHint.q)
    destination.set('page', '1')
    const intent = { fromLocationKey: location.key, destination: location.pathname + '?' + destination.toString() }
    retainedDraft.current = intent
    setForm((current) => ({ ...current, q: searchHint.q, page: 1 }))
    results.current?.focus({ preventScroll: true })
    setSearch(destination, { state: { catalogResultsNavigation: intent } })
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
  function applySearchPhrase(url: string) {
    // Same-URL navigation does not run the URL-change effect. This explicit
    // current-tab action also replaces unsent drafts without changing the wire.
    const query = new URLSearchParams(url.split('?')[1] ?? '')
    setForm(parseProductQuery({ ...Object.fromEntries(query), tasteTag: query.getAll('tasteTag'), aromaTag: query.getAll('aromaTag') }, categories.map((category) => category.label)))
    setRangeErrors({}); setTagIssues({})
  }
  return (
    <section ref={filterRoot} className="view products-view catalog-products">
      <div className="shop-intro">
        <div>
          <h1>전체 주류 둘러보기</h1>
          <p>상품을 검색하거나 원하는 주종과 범위로 좁혀 보세요.</p>
        </div>
      </div>
      <form
        className="filter-panel"
        role="search"
        noValidate
        onSubmit={submitSearch}
      >
        <div className="catalog-search-bar">
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
            ref={searchButton}
            className="btn btn-dark filter-submit"
            aria-busy={products.isFetching}
          >
            검색하기
          </button>
        </div>
        <details ref={advancedFilters} className="catalog-search-advanced" open={initiallyInvalid.current}>
          <summary>세부 검색 조건 <span className={hasAdvancedError ? 'range-field-error' : undefined}>{hasAdvancedError ? '조건 확인 필요' : '가격·도수·맛·향'}</span></summary>
          <div className="catalog-search-advanced-fields">
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
            <button type="submit" className="btn btn-outline-dark catalog-search-apply" aria-busy={products.isFetching}>세부 조건 적용</button>
          </div>
        </details>
        {!hasAppliedFilters && hasDraftFilters && <button type="button" className="text-link" onClick={reset}>입력 초기화</button>}
      </form>
      {hasAppliedFilters && <div className="catalog-applied">
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
              <span key={key}>{label}: {filters[key].map((tag, index) => <button type="button" className="search-tag-value applied-tag-remove" key={index}
                data-applied-remove aria-label={`${label} 태그 ${normalizeProductTag(tag)} 해제`}
                onClick={(event) => removeCondition(event, key, index)}>{normalizeProductTag(tag)} ×</button>)}</span>
            ) : <span>태그 제한 없음</span>}
        </div>
        <div className="active-filters" aria-label="적용된 필터">
            {filters.type && <button type="button" className="active-filter-chip" data-applied-remove
              aria-label={`주종 ${filters.type} 해제`} onClick={(event) => removeCondition(event, 'type')}>{filters.type} ×</button>}
            {filters.q && <button type="button" className="active-filter-chip" data-applied-remove
              aria-label={`검색 ${filters.q} 해제`} onClick={(event) => removeCondition(event, 'q')}>검색: {filters.q} ×</button>}
            {productRangeFields.filter(({ key }) => filters[key] !== '').map(({ key, label }) => urlRangeErrors[key] ?
              <span key={key}>{label}: {filters[key]}</span> : <button type="button" className="active-filter-chip" key={key}
                data-applied-remove aria-label={`${label} ${filters[key]} 해제`}
                onClick={(event) => removeCondition(event, key)}>{label}: {filters[key]} ×</button>)}
            <button ref={clearFilters} className="text-link" onClick={reset}>
              전체 해제
            </button>
            <small className="applied-filter-help">개별 해제는 현재 결과에 반영하며, 수정 중인 입력은 유지합니다.</small>
        </div>
      </div>}
      <section ref={results} className="product-results" aria-label="상품 검색 결과"
        aria-busy={products.isFetching || repairPage !== null} tabIndex={-1} data-catalog-results="true">
      <div className="catalog-results-bar">
        <h2>검색 결과{confirmedTotal !== null && <> <strong>{confirmedTotal.toLocaleString('ko-KR')}개</strong></>}</h2>
        <button type="button" className="text-button" onClick={() => {
          phraseHeading.current?.focus({ preventScroll: true })
          phraseHeading.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
        }}>저장한 취향으로 찾기</button>
      </div>
      {invalidUrlFilters ? (
        <Empty title="검색 조건을 확인해 주세요" description="가격·도수 범위와 태그 조건을 고치고 검색하거나 전체 해제해 주세요. 결과를 불러오지 않았습니다." />
      ) : rejectedTags ? (
        <Empty title="검색 조건을 확인해 주세요" description="입력한 검색 조건을 허용하지 않는 응답을 받았습니다. 태그의 중복·길이와 범위를 수정하거나 전체 해제해 주세요.">
          <button className="btn btn-dark" onClick={() => {
            const key = productTagFields.find(({ key }) => form[key].length)?.key
            const input = key ? tagInputs.current[key]?.[0] : null
            if (input && advancedFilters.current) advancedFilters.current.open = true
            const target = input ?? searchButton.current
            target?.focus()
          }}>태그 조건 수정</button>
        </Empty>
      ) : repairPage !== null ? (
        <Loading label="같은 검색 조건의 마지막 페이지를 확인하는 중입니다." />
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
      ) : resultPage?.items.length ? (
        <div className="product-grid">
          {resultPage.items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <Empty
          icon="⌕"
          title="조건에 맞는 상품이 없습니다"
          description={searchHint
            ? searchHint.kind === 'ALIAS' ? '검수 동의어로 찾아보세요.' : '비슷한 검색어로 찾아보세요.'
            : '검색어·주종이나 가격·도수·태그 조건을 바꿔 다시 찾아보세요.'}
        >
          {searchHint && <button type="button" className="btn btn-dark" onClick={applySearchHint}>
            ‘{searchHint.q}’로 다시 검색
          </button>}
          <button className="btn btn-outline-dark" onClick={reset}>
            모든 상품 보기
          </button>
        </Empty>
      )}
      </section>
      <Pagination page={invalidUrlFilters || repairPage !== null ? undefined : resultPage}
        onChange={(page) => navigate(page, filters)} onKeyboardNavigate={changeKeyboardPage} />
      <SearchPhrases onApply={applySearchPhrase} headingRef={phraseHeading} />
    </section>
  )
}

const stars = (rating: number) =>
  '★'.repeat(Math.max(1, Math.min(5, Math.round(Number(rating)))))
export function ProductDetailPage() {
  const { id = '' } = useParams()
  return <ProductDetail key={id} id={id} />
}
type ReviewEdit = Review & { initialRating: number; tagsDraft?: string[] }
type ReviewFocus = { editing: ReviewEdit | null; account: object; view: object; locationKey: string; source: HTMLElement; row: HTMLElement }
function ProductDetail({ id }: { id: string }) {
  const session = useSession()
  const ui = useUi()
  const cart = useAccountCart()
  const client = useQueryClient()
  const location = useLocation()
  const [quantity, setQuantity] = useState(1)
  const [reviewView, setReviewView] = useState({ page: 1, sort: 'latest' })
  const { page, sort } = reviewView
  const currentReviewView = useRef(reviewView)
  currentReviewView.current = reviewView
  const [draft, setDraft] = useState({ rating: 5, comment: '', tasteTags: [] as string[] })
  const [editing, setEditing] = useState<ReviewEdit | null>(null)
  const [deleting, setDeleting] = useState<Review | null>(null)
  const auth = client.getQueryCache().find({ queryKey: ['session'], exact: true })
  const transitioning = ['login', 'join', 'logout', 'settings-password'].some((key) => ui.pending[key])
  const writable = session.isSuccess && session.fetchStatus === 'idle' && Boolean(session.data) && !transitioning
  const [account, setAccount] = useState({ auth, id: session.data?.id, role: session.data?.role, transitioning })
  const currentAccount = useRef(account)
  const reviewHeading = useRef<HTMLHeadingElement>(null)
  const focusIntent = useRef<ReviewFocus | null>(null)
  const saveFocus = useRef<{ editing: ReviewEdit; form: HTMLFormElement; row: HTMLElement } | null>(null)
  const currentContext = useRef({ account, view: reviewView, locationKey: location.key, editing })
  currentContext.current = { account, view: reviewView, locationKey: location.key, editing }
  useLayoutEffect(() => {
    const intent = focusIntent.current
    focusIntent.current = null
    if (!intent || !writable || intent.editing !== editing || intent.account !== currentAccount.current ||
        intent.view !== reviewView || intent.locationKey !== location.key) return
    const active = document.activeElement
    if (active !== intent.source && (intent.source.isConnected || active !== document.body)) return
    const control = intent.editing ? intent.row.querySelector<HTMLElement>('.comment-edit-form select') :
      intent.row.querySelector<HTMLElement>('button[data-review-edit]')
    const target = control?.isConnected ? control : !intent.editing ? reviewHeading.current : null
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, [editing, account, writable, reviewView, location.key])
  function rememberFocus(event: MouseEvent<HTMLButtonElement>, next: ReviewEdit | null) {
    const source = event.currentTarget, row = source.closest<HTMLElement>('.comment-row')
    focusIntent.current = event.detail === 0 && document.activeElement === source && row ?
      { editing: next, account, view: reviewView, locationKey: location.key, source, row } : null
  }
  // Reads hide private inputs; only an account or authentication generation change discards their drafts.
  if (account.auth !== auth || account.id !== session.data?.id || account.role !== session.data?.role || account.transitioning !== transitioning) {
    const next = { auth, id: session.data?.id, role: session.data?.role, transitioning }
    currentAccount.current = next
    focusIntent.current = null
    saveFocus.current = null
    setAccount(next)
    setDraft({ rating: 5, comment: '', tasteTags: [] })
    setEditing(null)
    setDeleting(null)
  }
  const product = useQuery<Product>({
    queryKey: ['catalog', 'product', id],
    queryFn: () => api.product(id),
  })
  const comments = useQuery<ReviewPage>({
    queryKey: ['reviews', id, sort, page],
    queryFn: () => api.comments(id, { page, size: 10, sort, includeSummary: true, includeTasteTags: true }),
    enabled: product.isSuccess,
  })
  const summary = comments.data && !comments.isError && !comments.isFetching ? reviewSummary(comments.data) : null
  useRecordRecentVisit(product.data?.id === Number(id) ? product.data.id : undefined,
    product.isSuccess && !product.isFetching && !product.isPaused, location.key)
  async function refresh() {
    await client.invalidateQueries({ queryKey: ['reviews', id] })
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!writable) return
    const submitted = draft
    let tasteTags: string[]
    try { tasteTags = buildReviewTasteTags(submitted.tasteTags) } catch (error) { ui.error(error); return }
    const result = await ui.run(
      'comment-create',
      async () => {
        await api.createComment({
          productId: Number(id),
          rating: submitted.rating,
          comment: submitted.comment.trim(),
          ...(tasteTags.length ? { tasteTags } : {}),
        })
        await refresh()
      },
    )
    if (result.ok && currentAccount.current === account) {
      ui.status('후기가 등록되었습니다.')
      setDraft((current) =>
        current === submitted ? { ...current, comment: '', tasteTags: [] } : current,
      )
    }
  }
  async function saveReview(event: FormEvent) {
    event.preventDefault()
    if (!editing || !writable) return
    const submitted = editing
    const keyboard = saveFocus.current
    saveFocus.current = null
    let anchor: HTMLHeadingElement | null = null
    const ownsFocus = () => currentContext.current.account === account && currentContext.current.view === reviewView &&
      currentContext.current.locationKey === location.key && currentContext.current.editing === submitted
    let tasteTags: string[] | undefined
    try { tasteTags = submitted.tagsDraft === undefined ? undefined : buildReviewTasteTags(submitted.tagsDraft) } catch (error) { ui.error(error); return }
    const result = await ui.run(
      `comment-edit-${submitted.id}`,
      async () => {
        await api.updateComment(submitted.id, {
          rating: submitted.rating,
          comment: submitted.comment.trim(),
          ...(tasteTags === undefined ? {} : { tasteTags }),
        })
        if (keyboard?.editing === submitted && ownsFocus() && keyboard.form.isConnected && keyboard.form.contains(document.activeElement)) {
          anchor = reviewHeading.current
          anchor?.focus({ preventScroll: true })
        }
        await refresh()
      },
    )
    if (result.ok && currentAccount.current === account) {
      ui.status('후기가 수정되었습니다.')
      if (anchor && document.activeElement === anchor && keyboard && ownsFocus())
        focusIntent.current = { editing: null, account, view: reviewView, locationKey: location.key, source: anchor, row: keyboard.row }
      setEditing((current) => (current === submitted ? null : current))
    }
  }
  async function removeReview() {
    if (!deleting || !writable) return
    const submitted = deleting
    const submittedView = reviewView
    const result = await ui.run(
      'comment-delete',
      async () => {
        await api.deleteComment(submitted.id)
        if (currentReviewView.current === submittedView && comments.data?.items.length === 1 && page > 1)
          setReviewView((current) => current === submittedView ? { ...current, page: page - 1 } : current)
        await refresh()
      },
    )
    if (result.ok && currentAccount.current === account) {
      ui.status('후기가 삭제되었습니다.')
      setDeleting((current) => current === submitted ? null : current)
    }
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
  const currentProduct = product.fetchStatus === 'idle' && Number.isInteger(item.id) && item.id > 0 &&
    item.id <= 2147483647 && String(item.id) === id
  return (
    <>
      <section className="view detail-layout catalog-detail">
        <header className="catalog-detail-heading detail-copy">
          <Link className="text-link" to="/products">전체 주류 보기</Link>
          <p className="product-type">{item.type}</p>
          <h1>{item.name}</h1>
        </header>
        <div className="detail-media">
          <Image src={productImage(item)} alt={item.name} loading="eager" product />
        </div>
        <div className="detail-panel catalog-detail-summary">
          <div className="detail-stats" aria-label="상품 정보">
            <div className="catalog-detail-price">
              <span>개당 가격</span>
              <strong>{money(item.price)}원</strong>
            </div>
            <div className="catalog-detail-facts">
              <span className="stat-pill">도수 {item.abv}%</span>
              <span className="stat-pill">시연 주문 {item.orderCount}개</span>
            </div>
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
            <div className="catalog-detail-total">
              <span>상품 합계</span>
              <strong>{money(item.price * quantity)}원</strong>
            </div>
          </div>
          <button
            className="btn btn-gold btn-wide detail-cart-button"
            disabled={cart.pending || cart.loading || cart.mode === 'account' && !cart.ready}
            onClick={async () => {
              if (await cart.add(item, quantity)) ui.status(`${item.name} ${quantity}개를 ${cart.mode === 'unknown' ? '이 기기에만' : '장바구니에'} 담았습니다.`)
            }}
          >
            {quantity}개 장바구니에 담기
          </button>
          {cart.mode === 'unknown' && <p className="muted">로그인 확인 전에는 이 기기에만 담습니다.</p>}
          <div className="catalog-detail-actions">
            <ProductFavorite product={item} />
            <CompareAction product={item} />
          </div>
        </div>
        <div className="catalog-detail-content">
          <ProductFeatureDetails productId={item.id} />
          {currentProduct && <div className="catalog-detail-personal">
            <RecommendationFeedback key={location.key} productId={item.id} />
            <ProductNotebook key={`notebook:${location.key}`} productId={item.id} />
          </div>}
          <div className="comment-box">
            <div className="comment-title">
              <div>
                <p className="section-kicker">Reviews</p>
                <h2 ref={reviewHeading} tabIndex={-1}>
                  회원 후기 {!comments.isError && !comments.isFetching && comments.data && <span>{comments.data.total}</span>}
                </h2>
              </div>
              <label className="field-group compact-field">
                <span>후기 정렬</span>
                <select className="form-select" value={sort}
                  onChange={(event) => setReviewView({ page: 1, sort: event.target.value })}>
                  <option value="latest">최신순</option>
                  <option value="rating_desc">평점 높은순</option>
                  <option value="rating_asc">평점 낮은순</option>
                </select>
              </label>
            </div>
            <div className="review-summary" aria-live="polite">
              {comments.isPending || comments.isFetching ? <p>전체 평점을 불러오는 중입니다.</p> : comments.isError ?
                <p>전체 평점 정보를 불러오지 못했습니다.</p> : summary ?
                  <p>{summary.average === null ? '아직 등록된 평점이 없습니다.' : <strong>평균 {summary.average.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}점</strong>} · 전체 후기 {summary.count}개</p> :
                  <p>전체 평점 정보를 확인하지 못했습니다. <button className="text-button" onClick={() => comments.refetch()}>평점 집계 다시 확인</button></p>}
            </div>
            {writable ? (
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
                <div className="review-tag-input">
                  <p className="muted">맛 태그는 선택입니다. 회원이 느낀 맛이며 상품의 검수 정보와 다를 수 있습니다.</p>
                  <TagEditor label="느낀 맛 태그" optional value={{ status: 'tags', values: draft.tasteTags }}
                    onChange={(value) => setDraft({ ...draft, tasteTags: value.values })} />
                </div>
                <button
                  className="btn btn-dark"
                  disabled={ui.pending['comment-create']}
                >
                  후기 등록
                </button>
              </form>
            ) : session.data || session.isPending || session.isError ? (
              <p role="status">후기를 쓰려면 현재 로그인 상태를 확인해 주세요.
                {session.isError && <button className="text-button" onClick={() => session.refetch()}>로그인 상태 다시 확인</button>}
              </p>
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
                {comments.data.items.map((comment) => {
                  const tasteTags = readReviewTasteTags(comment.tasteTags)
                  return (
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
                    {writable && editing?.id === comment.id ? (
                      <form className="comment-edit-form" onSubmit={saveReview} tabIndex={-1} aria-label="후기 수정">
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
                        {readReviewTasteTags(editing.tasteTags) === null && <p className="muted">기존 맛 태그를 확인하지 못했습니다. 태그를 바꾸지 않으면 기존 값을 유지합니다.</p>}
                        <TagEditor label="느낀 맛 태그" optional
                          value={{ status: 'tags', values: editing.tagsDraft ?? readReviewTasteTags(editing.tasteTags) ?? [] }}
                          onChange={(value) => setEditing({ ...editing, tagsDraft: value.values })} />
                        <div className="button-row">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={(event) => { rememberFocus(event, null); setEditing(null) }}
                          >
                            취소
                          </button>
                          <button
                            className="btn btn-sm btn-dark"
                            disabled={ui.pending[`comment-edit-${comment.id}`]}
                            onClick={(event) => {
                              const form = event.currentTarget.form, row = event.currentTarget.closest<HTMLElement>('.comment-row')
                              saveFocus.current = event.detail === 0 && document.activeElement === event.currentTarget && form && row ?
                                { editing, form, row } : null
                              if (saveFocus.current) form?.focus({ preventScroll: true })
                            }}
                          >
                            저장
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <p>{comment.comment}</p>
                        {tasteTags === null ? <small className="muted">후기 맛 태그를 확인하지 못했습니다.</small> :
                          tasteTags.length > 0 ? <div className="review-taste-tags"><small>회원이 느낀 맛</small><ul className="product-feature-tags" aria-label="후기 맛 태그">
                            {tasteTags.map((tag) => <li key={tag}>{tag}</li>)}
                          </ul></div> : null}
                        {writable && (session.data?.role === 'ADMIN' ||
                          session.data?.id === comment.userId) && (
                          <div className="button-row">
                            <button
                              className="text-button"
                              data-review-edit
                              onClick={(event) => {
                                const next = { ...comment, initialRating: comment.rating }
                                rememberFocus(event, next)
                                setEditing(next)
                              }}
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
                )})}
                <Pagination page={comments.data} onChange={(nextPage) => setReviewView((current) => ({ ...current, page: nextPage }))} />
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
      {currentProduct && <SimilarProducts productId={item.id} />}
      {writable && deleting && (
        <Confirm
          title="후기를 삭제할까요?"
          description="삭제한 후기는 복구할 수 없습니다."
          pending={ui.pending['comment-delete']}
          onCancel={() => setDeleting(null)}
          onConfirm={removeReview}
          fallbackFocus={() => currentAccount.current === account && currentContext.current.locationKey === location.key
            ? reviewHeading.current : null}
        />
      )}
    </>
  )
}
