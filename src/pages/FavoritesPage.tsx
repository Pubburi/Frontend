import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { useSession } from '../queries'
import { useFavoriteWrites } from '../state/favoriteWrites'
import {
  favoritePage,
  favoritesPageKey,
  FAVORITES_PAGE_SIZE,
} from '../favorites'
import { FavoriteAction, useFavoriteExpiry } from '../components/FavoriteAction'
import { Empty, Loading, Pagination, ProductCard } from '../components/ui'
import type { User } from '../types'

export function FavoritesPage() {
  const session = useSession()
  return session.data ? (
    <AccountFavorites key={session.data.id} user={session.data} />
  ) : null
}
function AccountFavorites({ user }: { user: User }) {
  const section = useRef<HTMLElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const retry = useRef<HTMLButtonElement>(null)
  const browse = useRef<HTMLAnchorElement>(null)
  const focusIntent = useRef<{
    productId: number
    index: number
    revision: number
  } | null>(null)
  const [search, setSearch] = useSearchParams()
  const page = favoritePage(search.get('page'))
  const revision = useFavoriteWrites(
    (state) => state.revisions.get(user.id) ?? 0,
  )
  const pending = useFavoriteWrites((state) =>
    Boolean(state.owners.get(user.id)?.size),
  )
  const query = useQuery({
    queryKey: favoritesPageKey(user.id, page, revision),
    queryFn: () => api.ownFavorites({ page, size: FAVORITES_PAGE_SIZE }),
    enabled: !pending,
  })
  useFavoriteExpiry(query.error, user)
  function rememberFocus(productId: number, trigger: HTMLButtonElement) {
    if (document.activeElement !== trigger || !heading.current) return
    focusIntent.current = {
      productId,
      index: Math.max(
        0,
        query.data?.items.findIndex((item) => item.id === productId) ?? 0,
      ),
      revision,
    }
    // The heading survives loading, empty and failure states unlike the removed row.
    heading.current.focus({ preventScroll: true })
  }
  useEffect(() => {
    function moved(event: Event) {
      if (event.target !== heading.current) focusIntent.current = null
    }
    function abandon() {
      focusIntent.current = null
    }
    document.addEventListener('focusin', moved)
    document.addEventListener('pointerdown', moved)
    window.addEventListener('popstate', abandon)
    window.addEventListener('blur', abandon)
    return () => {
      document.removeEventListener('focusin', moved)
      document.removeEventListener('pointerdown', moved)
      window.removeEventListener('popstate', abandon)
      window.removeEventListener('blur', abandon)
    }
  }, [])
  useEffect(() => {
    const intent = focusIntent.current
    if (
      !intent ||
      pending ||
      revision <= intent.revision ||
      query.isPending ||
      query.isFetching
    )
      return
    if (query.isSuccess && page > Math.max(1, query.data.totalPages)) return
    if (document.activeElement !== heading.current || !document.hasFocus()) {
      focusIntent.current = null
      return
    }
    let target: HTMLElement | null = null
    if (query.isError) target = retry.current
    else if (query.isSuccess) {
      const items = query.data.items
      const item =
        items.find((item) => item.id === intent.productId) ??
        items[Math.min(intent.index, items.length - 1)]
      target = item
        ? (section.current?.querySelector<HTMLButtonElement>(
            `button[data-favorite-product-id="${item.id}"]`,
          ) ?? null)
        : browse.current
    }
    if (target) {
      focusIntent.current = null
      target.focus()
    }
  }, [
    pending,
    revision,
    page,
    query.isPending,
    query.isFetching,
    query.isSuccess,
    query.isError,
    query.data,
  ])
  useEffect(() => {
    if (
      query.isSuccess &&
      !pending &&
      page > Math.max(1, query.data.totalPages)
    )
      setSearch(
        { page: String(Math.max(1, query.data.totalPages)) },
        { replace: true },
      )
  }, [query.isSuccess, query.data, pending, page, setSearch])
  return (
    <section className="view favorites-view" ref={section}>
      <div className="shop-intro compact-intro">
        <div>
          <p className="section-kicker">My Favorites</p>
          <h1 tabIndex={-1} ref={heading}>
            내 찜 목록
          </h1>
          <p>
            다시 보고 싶은 주류를 모아 두세요. 최근 담은 상품부터 보여드려요.
          </p>
        </div>
        <Link className="btn btn-outline-dark" to="/profile">
          마이페이지
        </Link>
        <button
          className="btn btn-outline-dark"
          disabled={pending || query.isFetching}
          onClick={() => query.refetch()}
        >
          찜 목록 새로고침
        </button>
      </div>
      {query.isPending ||
      (query.isSuccess && page > Math.max(1, query.data.totalPages)) ? (
        <Loading
          label={
            pending
              ? '진행 중인 찜 저장을 기다리는 중입니다.'
              : '찜 목록을 불러오는 중입니다.'
          }
        />
      ) : query.isError ? (
        <Empty title="찜 목록을 불러오지 못했습니다">
          <button
            ref={retry}
            className="btn btn-dark"
            disabled={pending}
            onClick={() => query.refetch()}
          >
            찜 다시 불러오기
          </button>
        </Empty>
      ) : query.data.items.length ? (
        <>
          <p className="muted">총 {query.data.total}개</p>
          <div className="product-grid">
            {query.data.items.map((product) => (
              <div className="favorite-item" key={product.id}>
                <ProductCard product={product} />
                <FavoriteAction
                  user={user}
                  productId={product.id}
                  name={product.name}
                  favorited
                  onKeyboardStart={(trigger) =>
                    rememberFocus(product.id, trigger)
                  }
                />
              </div>
            ))}
          </div>
          <Pagination
            page={query.data}
            onChange={(next) => setSearch({ page: String(next) })}
          />
        </>
      ) : (
        <Empty title="아직 찜한 상품이 없습니다">
          <Link className="btn btn-dark" to="/products" ref={browse}>
            주류 둘러보기
          </Link>
        </Empty>
      )}
    </section>
  )
}
