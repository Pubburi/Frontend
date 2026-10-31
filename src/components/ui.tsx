import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../state/cart'
import { useUi } from '../state/ui'
import { money, productImage, webpSource } from '../utils/format'
import type { Page, Product } from '../types'

export function Image({
  src = '',
  alt = '',
  loading = 'lazy',
}: {
  src?: string
  alt?: string
  loading?: 'lazy' | 'eager'
}) {
  const [failedSource, setFailedSource] = useState('')
  const failed = failedSource === src
  const webp = !failed && webpSource(src)
  return (
    <picture>
      {webp && <source srcSet={webp} type="image/webp" />}
      <img
        src={src || '/images/icon/mainIcon.webp'}
        alt={alt}
        loading={loading}
        decoding="async"
        onError={(event) => {
          if (!failed && src) {
            setFailedSource(src)
            event.currentTarget.src = src
          } else if (
            !event.currentTarget.src.endsWith('/images/icon/mainIcon.webp')
          )
            event.currentTarget.src = '/images/icon/mainIcon.webp'
        }}
      />
    </picture>
  )
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
}: {
  page?: Page<T>
  onChange: (page: number) => void
}) {
  return page && page.totalPages > 1 ? (
    <nav className="pagination-bar" aria-label="pagination">
      <button
        className="btn btn-sm btn-outline-dark"
        disabled={page.page <= 1}
        onClick={() => onChange(page.page - 1)}
      >
        이전
      </button>
      <span>
        {page.page} / {page.totalPages}
      </span>
      <button
        className="btn btn-sm btn-outline-dark"
        disabled={!page.hasNext}
        onClick={() => onChange(page.page + 1)}
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
  const cart = useCart()
  const status = useUi((state) => state.status)
  return (
    <article className="product-card">
      <Link className="product-image" to={`/products/${product.id}`}>
        <Image src={productImage(product)} alt={product.name} />
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
          시연 주문 수량 {Number(product.orderCount || 0).toLocaleString('ko-KR')}개
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
            onClick={() => {
              cart.add(product)
              status(`${product.name}을(를) 장바구니에 담았습니다.`)
            }}
          >
            빠른 담기
          </button>
        </div>
      </div>
    </article>
  )
}
export function Confirm({
  title,
  description,
  pending,
  onCancel,
  onConfirm,
}: {
  title: string
  description?: string
  pending?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const dialog = useRef<HTMLElement>(null)
  const titleId = useId()
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    return () => previous?.focus()
  }, [])
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
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !pending) onCancel()
          if (e.key === 'Tab') {
            const buttons = Array.from(
              dialog.current?.querySelectorAll<HTMLButtonElement>(
                'button:not(:disabled)',
              ) || [],
            )
            const first = buttons[0],
              last = buttons.at(-1)
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === dialog.current)
            ) {
              e.preventDefault()
              last?.focus()
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault()
              first?.focus()
            }
          }
        }}
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
            {pending ? '처리 중…' : '삭제'}
          </button>
        </div>
      </section>
    </div>
  )
}
