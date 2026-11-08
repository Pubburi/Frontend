import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAccountCart } from '../state/accountCart'
import { useUi } from '../state/ui'
import { money, productImage, webpSource } from '../utils/format'
import type { Page, Product } from '../types'
import { CompareAction } from './CompareAction'

type ImageProps = { src?: string; alt?: string; loading?: 'lazy' | 'eager'; product?: boolean }
export function Image(props: ImageProps) {
  return <ImageSource key={props.src} {...props} />
}
function ImageSource({
  src = '',
  alt = '',
  loading = 'lazy',
  product = false,
}: ImageProps) {
  const [failure, setFailure] = useState<'webp' | 'original' | null>(null)
  const fallback = '/images/icon/mainIcon.webp'
  const generic = !src || src === fallback || failure === 'original'
  const webp = !generic && failure === null && webpSource(src)
  const picture = (
    <picture>
      {webp && <source srcSet={webp} type="image/webp" />}
      <img
        src={generic ? fallback : src}
        alt={product && generic ? '상품 이미지 미등록 — 기본 아이콘' : alt}
        loading={loading}
        decoding="async"
        onError={() => { if (!generic) setFailure(webp ? 'webp' : 'original') }}
      />
    </picture>
  )
  return product ? <figure className="product-image-content">{picture}{generic && <figcaption className="muted">상품 이미지 미등록</figcaption>}</figure> : picture
}
export function Loading({ label = '불러오는 중입니다.' }: { label?: string }) {
  return (
    <div className="skeleton-grid" role="status" aria-label={label}>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="skeleton-card" aria-hidden="true">
          <span className="skeleton-block skeleton-image" />
          <span className="skeleton-block skeleton-line short" />
          <span className="skeleton-block skeleton-line" />
          <span className="skeleton-block skeleton-line medium" />
        </div>
      ))}
    </div>
  )
}
export function Empty({
  title,
  description,
  children,
  icon = '✦',
}: {
  title: string
  description?: string
  children?: ReactNode
  icon?: string
}) {
  return (
    <section className="state-panel" role="status">
      <span className="state-icon" aria-hidden="true">
        {icon}
      </span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {children}
    </section>
  )
}
export function Pagination<T>({
  page,
  onChange,
  onKeyboardNavigate,
}: {
  page?: Page<T>
  onChange: (page: number) => void
  onKeyboardNavigate?: (page: number, trigger: HTMLButtonElement) => void
}) {
  return page && page.totalPages > 1 ? (
    <nav className="pagination-bar" aria-label="pagination">
      <button
        className="btn btn-sm btn-outline-dark"
        disabled={page.page <= 1}
        onClick={(event) => event.detail === 0 && onKeyboardNavigate
          ? onKeyboardNavigate(page.page - 1, event.currentTarget)
          : onChange(page.page - 1)}
      >
        이전
      </button>
      <span>
        {page.page} / {page.totalPages}
      </span>
      <button
        className="btn btn-sm btn-outline-dark"
        disabled={!page.hasNext}
        onClick={(event) => event.detail === 0 && onKeyboardNavigate
          ? onKeyboardNavigate(page.page + 1, event.currentTarget)
          : onChange(page.page + 1)}
      >
        다음
      </button>
    </nav>
  ) : null
}
export function Quantity({
  value,
  onChange,
  label = '상품 수량',
}: {
  value: number
  onChange: (value: number) => void
  label?: string
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  function update(value: number) {
    const normalized = Number.isFinite(value)
      ? Math.max(1, Math.min(99, Math.trunc(value)))
      : 1
    setDraft(String(normalized))
    onChange(normalized)
  }
  return (
    <div className="quantity-stepper" aria-label={label}>
      <button
        type="button"
        disabled={value <= 1}
        aria-label="수량 줄이기"
        onClick={() => update(value - 1)}
      >
        −
      </button>
      <input
        type="number"
        min={1}
        max={99}
        inputMode="numeric"
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => update(Number(draft))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            update(Number(draft))
          }
        }}
      />
      <button
        type="button"
        disabled={value >= 99}
        aria-label="수량 늘리기"
        onClick={() => update(value + 1)}
      >
        +
      </button>
    </div>
  )
}
export function ProductCard({ product }: { product: Product }) {
  const cart = useAccountCart()
  const status = useUi((state) => state.status)
  return (
    <article className="product-card">
      <Link className="product-image" to={`/products/${product.id}`}>
        <Image src={productImage(product)} alt={product.name} product />
      </Link>
      <div className="product-body">
        <p className="product-type">{product.type}</p>
        <h2>
          <Link to={`/products/${product.id}`}>{product.name}</Link>
        </h2>
        <p className="product-meta">
          <strong>{money(product.price)}원</strong>
          <span>도수 {product.abv}%</span>
        </p>
        <p className="product-orders">
          시연 주문 수량{' '}
          {Number(product.orderCount || 0).toLocaleString('ko-KR')}개
        </p>
        <div className="button-row">
          <Link
            className="btn btn-outline-dark btn-sm"
            to={`/products/${product.id}`}
          >
            상세 보기
          </Link>
          <button
            className="btn btn-gold btn-sm"
            disabled={cart.pending || cart.loading || cart.mode === 'account' && !cart.ready}
            onClick={async () => {
              if (await cart.add(product)) status(`${product.name}을(를) ${cart.mode === 'unknown' ? '이 기기에만' : '장바구니에'} 담았습니다.`)
            }}
          >
            빠른 담기
          </button>
          {cart.mode === 'unknown' && <small>로그인 확인 전에는 이 기기에만 담습니다.</small>}
        </div>
        <CompareAction product={product} />
      </div>
    </article>
  )
}
export function Confirm({
  title,
  description,
  confirmLabel = '삭제',
  pending,
  onCancel,
  onConfirm,
  fallbackFocus,
}: {
  title: string
  description?: string
  confirmLabel?: string
  pending?: boolean
  onCancel: () => void
  onConfirm: () => void
  fallbackFocus?: () => HTMLElement | null
}) {
  const dialog = useRef<HTMLElement>(null)
  const titleId = useId()
  const current = useRef({ pending, onCancel })
  current.current = { pending, onCancel }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    function handleKeyDown(event: KeyboardEvent) {
      const root = dialog.current
      if (!root) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (!current.current.pending) {
          current.current.onCancel()
        }
        return
      }
      if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey)
        return
      const buttons = Array.from(
        root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
      )
      const first = buttons[0]
      const last = buttons.at(-1)
      const focused = document.activeElement
      if (!first || !last) {
        event.preventDefault()
        root.focus()
      } else if (!root.contains(focused) || focused === root) {
        event.preventDefault()
        const target = event.shiftKey ? last : first
        target.focus()
      } else if (event.shiftKey && focused === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && focused === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      if (previous?.isConnected) previous.focus()
      else if (document.activeElement === document.body) {
        const fallback = fallbackFocus?.()
        if (fallback?.isConnected) fallback.focus()
      }
    }
  }, [])
  useEffect(() => {
    if (pending) dialog.current?.focus()
  }, [pending])
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel()
      }}
    >
      <section
        ref={dialog}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-busy={pending}
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <p className="section-kicker">Confirm</p>
        <h2 id={titleId}>{title}</h2>
        <p>{description}</p>
        <div className="button-row dialog-actions">
          <button
            className="btn btn-outline-secondary"
            disabled={pending}
            onClick={onCancel}
          >
            취소
          </button>
          <button
            className="btn btn-danger"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? '처리 중…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
