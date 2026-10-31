import { useEffect } from 'react'
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
    <section className="view favorites-view">
      <div className="shop-intro compact-intro">
        <div>
          <p className="section-kicker">My Favorites</p>
          <h1>내 찜 목록</h1>
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
          <Link className="btn btn-dark" to="/products">
            주류 둘러보기
          </Link>
        </Empty>
      )}
    </section>
  )
}
