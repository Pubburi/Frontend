import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiClientError, pageQuery } from '../services/api'
import { categories } from '../catalog'
import { useSession } from '../queries'
import { useAccountCart } from '../state/accountCart'
import { useComparison } from '../state/comparison'
import { comparisonUrl } from '../comparison'
import { useUi } from '../state/ui'
import { ProductFavorite } from '../components/FavoriteAction'
import { SearchTagFields } from '../components/SearchTagFields'
import { TagEditor } from '../components/TagEditor'
import { buildReviewTasteTags, readReviewTasteTags } from '../reviewTasteTags'
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
import { buildProductQuery, defaultProductSort, parseProductQuery, productSortOptions, removeProductCondition } from '../utils/productFilters'
import { productRangeFields, validateProductRanges, type ProductRangeKey, type ProductRangeErrors } from '../productRanges'
import { money, productImage } from '../utils/format'
import type { Page, Product, Review } from '../types'
import { ProductNotebook } from '../components/Notebook'
import { HomeProductSearch } from '../components/HomeProductSearch'
import { HomeProductThemes } from '../components/HomeProductThemes'
import { reviewSummary, type ReviewPage } from '../reviewSummary'
import './catalog-ux.css'

const maxPriceFieldId = 'catalog-max-price'

export function HomePage() {
  return (
    <section className="view home-view catalog-home">
      <section className="catalog-home-lead" aria-labelledby="catalog-home-title">
        <div className="catalog-home-copy">
          <p className="section-kicker">주점부리 셀렉션</p>
          <h1 id="catalog-home-title">취향과 순간에 어울리는 한 잔</h1>
          <p>상품명으로 찾거나 주종과 도수, 가격을 비교해 보세요.</p>
          <HomeProductSearch />
          <div className="button-row catalog-home-actions">
            <Link className="text-link" to="/products">전체 주류 둘러보기</Link>
            <Link className="text-link" to={`/products#${maxPriceFieldId}`}>예산으로 찾기</Link>
          </div>
        </div>
        <div className="catalog-home-cover">
          <Image src="/images/carousel/catalog-cover.webp" alt="" loading="eager" />
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
              to={`/products?${pageQuery(buildProductQuery({ type: category.label }))}`}
            >
              <Image src={category.image} />
              <span>{category.label}</span>
            </Link>
          ))}
        </div>
      </section>
      <HomeProductThemes />
    </section>
  )
}

export type CatalogProductOrigin = {
  key: string
  url: string
  productId: number
  top: number
  keyboard: boolean
}

function opensInSameTab(event: MouseEvent<HTMLAnchorElement>) {
  return event.button === 0 && !event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

function CatalogCompareShortcut() {
  const ids = useComparison((state) => state.ids)
  const { pathname, search, hash } = useLocation()
  if (ids.length === 0) return null
  return <Link className="btn btn-dark catalog-compare-shortcut" to={comparisonUrl(ids)}
    state={{ catalogCompareFrom: pathname + search + hash }}>
    선택한 상품 {ids.length}개 비교하기
  </Link>
}

export function ProductsPage({ catalogReturn }: { catalogReturn: CatalogProductOrigin | null }) {
  const [search, setSearch] = useSearchParams()
  const location = useLocation()
  const navigateTo = useNavigate()
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
  useLayoutEffect(() => {
    if (location.hash === `#${maxPriceFieldId}` && advancedFilters.current) {
      advancedFilters.current.open = true
    }
  }, [location.hash])
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
    if (destination.has('sort')) destination.set('sort', filters.sort)
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
  const restored = useRef<CatalogProductOrigin | null>(null)
  useLayoutEffect(() => {
    const region = results.current
    if (!catalogReturn || restored.current === catalogReturn || !region) return
    const discard = () => { restored.current = catalogReturn }
    const restore = () => {
      if (restored.current === catalogReturn) return
      restored.current = catalogReturn
      if (document.activeElement !== document.body) return
      const product = CSS.escape(String(catalogReturn.productId))
      const target = region.querySelector<HTMLAnchorElement>(`[data-product-card="${product}"] [data-product-link]`)
      if (!target) {
        if (catalogReturn.keyboard) region.focus({ preventScroll: true })
        region.scrollIntoView({ block: 'start', behavior: 'instant' })
        return
      }
      if (catalogReturn.keyboard) target.focus({ preventScroll: true })
      window.scrollBy({ top: target.getBoundingClientRect().top - catalogReturn.top, behavior: 'instant' })
    }
    window.addEventListener('pointerdown', discard, { once: true })
    window.addEventListener('wheel', discard, { once: true, passive: true })
    const frame = repairPage === null && !products.isPending && products.fetchStatus !== 'fetching' ? requestAnimationFrame(restore) : null
    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      window.removeEventListener('pointerdown', discard)
      window.removeEventListener('wheel', discard)
    }
  }, [catalogReturn, products.isPending, products.fetchStatus, repairPage])
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
    const sameQuery = pageQuery(buildProductQuery(canonical, 1)) ===
      pageQuery(buildProductQuery(filters, filters.page))
    if (!invalidUrlFilters && sameQuery) {
      if (products.fetchStatus === 'idle') void products.refetch({ cancelRefetch: false })
      return
    }
    navigate(1, canonical)
  }
  function navigate(page = 1, criteria = form) {
    setSearch(new URLSearchParams(pageQuery(buildProductQuery(criteria, page))))
  }
  function openProduct(event: MouseEvent<HTMLAnchorElement>, productId: number) {
    if (!opensInSameTab(event)) return
    event.preventDefault()
    navigateTo(`/products/${productId}`, { state: { catalogProductOrigin: {
      key: location.key, url: location.pathname + location.search + location.hash, productId,
      top: event.currentTarget.getBoundingClientRect().top,
      keyboard: event.detail === 0 && document.activeElement === event.currentTarget,
    } satisfies CatalogProductOrigin } })
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
    if (destination.has('sort')) destination.set('sort', filters.sort)
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
    setSearch({ sort: defaultProductSort, page: '1' })
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
              {productSortOptions.map(([value, label]) => (
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
                      id={key === 'maxPriceKrw' ? maxPriceFieldId : undefined}
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
          {resultPage.items.map(({ volumeMl, ...product }) => (
            <ProductCard key={product.id} product={product} volumeMl={volumeMl ?? null} onOpen={(event) => openProduct(event, product.id)} />
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
      <CatalogCompareShortcut />
    </section>
  )
}

const stars = (rating: number) =>
  Number(rating) === 0 ? '' : '★'.repeat(Math.max(1, Math.min(5, Math.round(Number(rating)))))
export function ProductDetailPage() {
  const { id = '' } = useParams()
  return <ProductDetail key={id} id={id} />
}
type ReviewEdit = Review & { initialRating: number; tagsDraft?: string[]; invalidBody?: boolean }
type ReviewFocus = { editing: ReviewEdit | null; account: object; view: object; locationKey: string; source: HTMLElement; row: HTMLElement }
function ProductDetail({ id }: { id: string }) {
  const session = useSession()
  const ui = useUi()
  const cart = useAccountCart()
  const client = useQueryClient()
  const location = useLocation()
  const navigate = useNavigate()
  const origin = location.state?.catalogProductOrigin as CatalogProductOrigin | undefined
  const catalogOrigin = origin && String(origin.productId) === id && /^\/products(?:[?#]|$)/.test(origin.url) ? origin : null
  function catalogLink(className: string) {
    return <Link className={className} to={catalogOrigin?.url ?? '/products'} onClick={(event) => {
      if (!catalogOrigin || !opensInSameTab(event)) return
      event.preventDefault()
      navigate(-1)
    }}>{catalogOrigin ? '검색 결과로 돌아가기' : '전체 주류 보기'}</Link>
  }
  const [quantity, setQuantity] = useState(1)
  const [reviewView, setReviewView] = useState({ page: 1, sort: 'latest' })
  const { page, sort } = reviewView
  const currentReviewView = useRef(reviewView)
  currentReviewView.current = reviewView
  const [draft, setDraft] = useState({ rating: 5, comment: '', tasteTags: [] as string[], invalidBody: false })
  const [editing, setEditing] = useState<ReviewEdit | null>(null)
  const [deleting, setDeleting] = useState<Review | null>(null)
  const auth = client.getQueryCache().find({ queryKey: ['session'], exact: true })
  const transitioning = ['login', 'join', 'logout', 'settings-password'].some((key) => ui.pending[key])
  const writable = session.isSuccess && session.fetchStatus === 'idle' && Boolean(session.data) && !transitioning
  const [account, setAccount] = useState({ auth, id: session.data?.id, role: session.data?.role, transitioning })
  const currentAccount = useRef(account)
  const reviewHeading = useRef<HTMLHeadingElement>(null)
  const reviewBody = useRef<HTMLTextAreaElement>(null)
  const editBody = useRef<HTMLTextAreaElement>(null)
  const focusIntent = useRef<ReviewFocus | null>(null)
  const saveFocus = useRef<{ editing: ReviewEdit; form: HTMLFormElement; row: HTMLElement } | null>(null)
  const currentContext = useRef({ account, view: reviewView, locationKey: location.key, editing, deleting })
  currentContext.current = { account, view: reviewView, locationKey: location.key, editing, deleting }
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
    setDraft({ rating: 5, comment: '', tasteTags: [], invalidBody: false })
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
  function handleReviewExpiry(error: unknown, authUpdates: number | undefined, source: Element | null, active = true) {
    if (!(error instanceof ApiClientError) || error.status !== 401) return false
    if (active && source?.isConnected && currentAccount.current === account && currentContext.current.locationKey === location.key &&
        client.getQueryCache().find({ queryKey: ['session'], exact: true }) === auth &&
        auth?.state.data === session.data && auth?.state.dataUpdateCount === authUpdates &&
        auth?.state.status === 'success' && auth.state.fetchStatus === 'idle' &&
        !['login', 'join', 'logout', 'settings-password'].some((key) => useUi.getState().pending[key])) {
      client.removeQueries({ queryKey: ['account', account.id] })
      client.setQueryData(['session'], null)
      ui.error(error)
    }
    return true
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!writable) return
    const form = event.currentTarget, authUpdates = auth?.state.dataUpdateCount
    const submitted = draft
    const comment = submitted.comment.trim()
    if (!comment) {
      setDraft((current) => current === submitted ? { ...current, invalidBody: true } : current)
      reviewBody.current?.focus()
      return
    }
    let tasteTags: string[]
    try { tasteTags = buildReviewTasteTags(submitted.tasteTags) } catch (error) { ui.error(error); return }
    const result = await ui.run(
      'comment-create',
      async () => {
        try {
          await api.createComment({
            productId: Number(id),
            rating: submitted.rating,
            comment,
            ...(tasteTags.length ? { tasteTags } : {}),
          })
        } catch (error) {
          if (handleReviewExpiry(error, authUpdates, form)) return false
          throw error
        }
        await refresh()
        return true
      },
    )
    if (result.ok && result.data && reviewHeading.current?.isConnected && currentAccount.current === account && currentContext.current.locationKey === location.key) {
      ui.status('후기가 등록되었습니다.')
      setDraft((current) =>
        current === submitted ? { ...current, comment: '', tasteTags: [] } : current,
      )
    }
  }
  async function saveReview(event: FormEvent) {
    event.preventDefault()
    if (!editing || !writable) return
    const form = event.currentTarget, authUpdates = auth?.state.dataUpdateCount
    const submitted = editing
    const keyboard = saveFocus.current
    saveFocus.current = null
    const comment = submitted.comment.trim()
    if (!comment) {
      setEditing((current) => current === submitted ? { ...current, invalidBody: true } : current)
      editBody.current?.focus()
      return
    }
    let anchor: HTMLHeadingElement | null = null
    const ownsFocus = () => currentContext.current.account === account && currentContext.current.view === reviewView &&
      currentContext.current.locationKey === location.key && currentContext.current.editing === submitted
    let tasteTags: string[] | undefined
    try { tasteTags = submitted.tagsDraft === undefined ? undefined : buildReviewTasteTags(submitted.tagsDraft) } catch (error) { ui.error(error); return }
    const result = await ui.run(
      `comment-edit-${submitted.id}`,
      async () => {
        try {
          await api.updateComment(submitted.id, {
            rating: submitted.rating,
            comment,
            ...(tasteTags === undefined ? {} : { tasteTags }),
          })
        } catch (error) {
          if (handleReviewExpiry(error, authUpdates, form)) return false
          throw error
        }
        if (keyboard?.editing === submitted && ownsFocus() && keyboard.form.isConnected && keyboard.form.contains(document.activeElement)) {
          anchor = reviewHeading.current
          anchor?.focus({ preventScroll: true })
        }
        await refresh()
        return true
      },
    )
    if (result.ok && result.data && currentAccount.current === account) {
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
    const source = reviewHeading.current, authUpdates = auth?.state.dataUpdateCount
    const result = await ui.run(
      'comment-delete',
      async () => {
        try {
          await api.deleteComment(submitted.id)
        } catch (error) {
          if (handleReviewExpiry(error, authUpdates, source,
            currentContext.current.deleting === submitted && currentContext.current.view === submittedView)) return false
          throw error
        }
        if (currentReviewView.current === submittedView && comments.data?.items.length === 1 && page > 1)
          setReviewView((current) => current === submittedView ? { ...current, page: page - 1 } : current)
        await refresh()
        return true
      },
    )
    if (result.ok && result.data && currentAccount.current === account) {
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
        {catalogLink('btn btn-dark')}
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
          {catalogLink('text-link')}
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
                  <div className="review-recovery">
                    <p>전체 평점 정보를 확인하지 못했습니다.</p>
                    <button type="button" className="text-button" onClick={() => void comments.refetch()}>평점 집계 다시 확인</button>
                  </div>}
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
                    ref={reviewBody}
                    className="form-control"
                    maxLength={200}
                    placeholder="상품에 대한 솔직한 후기를 남겨주세요."
                    aria-label="후기"
                    aria-invalid={draft.invalidBody || undefined}
                    aria-describedby={draft.invalidBody ? 'review-body-error' : undefined}
                    required
                    value={draft.comment}
                    onChange={(e) =>
                      setDraft({ ...draft, comment: e.target.value, invalidBody: false })
                    }
                  />
                  <small>{draft.comment.length} / 200</small>
                  {draft.invalidBody && <small id="review-body-error" className="danger-text" role="alert">후기 내용을 입력해 주세요.</small>}
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
              <div className="review-recovery">
                <p role="status">후기를 쓰려면 현재 로그인 상태를 확인해 주세요.</p>
                {session.isError && <button type="button" className="text-button" onClick={() => void session.refetch()}>로그인 상태 다시 확인</button>}
              </div>
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
                            ref={editBody}
                            className="form-control"
                            aria-label="후기 내용"
                            aria-invalid={editing.invalidBody || undefined}
                            aria-describedby={editing.invalidBody ? 'review-edit-body-error' : undefined}
                            maxLength={200}
                            required
                            value={editing.comment}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                comment: e.target.value,
                                invalidBody: false,
                              })
                            }
                          />
                          {editing.invalidBody && <small id="review-edit-body-error" className="danger-text" role="alert">후기 내용을 입력해 주세요.</small>}
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
