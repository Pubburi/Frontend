import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiClientError } from '../services/api'
import { useFavoriteWrites } from '../state/favoriteWrites'
import { useUi } from '../state/ui'
import { useSession } from '../queries'
import { favoriteStatusKey } from '../favorites'
import type { Product, User } from '../types'

export function ProductFavorite({ product }: { product: Product }) {
  const session = useSession()
  if (session.isPending)
    return <p role="status">로그인 상태를 확인하는 중입니다.</p>
  if (session.isError)
    return (
      <div>
        <p role="status">찜을 위해 로그인 상태를 확인하지 못했습니다.</p>
        <button
          className="btn btn-outline-dark"
          onClick={() => session.refetch()}
        >
          로그인 상태 다시 확인
        </button>
      </div>
    )
  if (!session.data)
    return (
      <Link
        className="btn btn-outline-dark"
        to={`/account?${new URLSearchParams({ redirect: `/products/${product.id}` })}`}
      >
        로그인하고 찜하기
      </Link>
    )
  return (
    <AccountProductFavorite
      key={`${session.data.id}:${product.id}`}
      user={session.data}
      product={product}
    />
  )
}

function AccountProductFavorite({
  user,
  product,
}: {
  user: User
  product: Product
}) {
  const revision = useFavoriteWrites(
    (state) => state.revisions.get(user.id) ?? 0,
  )
  const pending = useFavoriteWrites(
    (state) => state.owners.get(user.id)?.has(product.id) ?? false,
  )
  const query = useQuery({
    queryKey: favoriteStatusKey(user.id, product.id, revision),
    queryFn: () => api.favoriteState(product.id),
    enabled: !pending,
  })
  useFavoriteExpiry(query.error, user)
  return (
    <div className="favorite-control">
      {query.isPending ? (
        <p
          role="status"
          aria-label={
            pending
              ? '진행 중인 찜 저장을 기다리는 중입니다.'
              : '찜 상태를 확인하는 중입니다.'
          }
        >
          {pending
            ? '진행 중인 찜 저장을 기다리는 중입니다.'
            : '찜 상태를 확인하는 중입니다.'}
        </p>
      ) : query.isError ? (
        <>
          <p role="status">찜 상태를 확인하지 못했습니다.</p>
          <button
            className="btn btn-outline-dark"
            disabled={pending || query.isFetching}
            onClick={() => query.refetch()}
          >
            찜 상태 다시 확인
          </button>
        </>
      ) : (
        <FavoriteAction
          user={user}
          productId={product.id}
          name={product.name}
          favorited={query.data.favorited}
        />
      )}
      <Link className="text-link" to="/favorites">
        내 찜 목록
      </Link>
    </div>
  )
}

export function useFavoriteExpiry(error: unknown, user: User) {
  const client = useQueryClient()
  useEffect(() => {
    if (
      error instanceof ApiClientError &&
      error.status === 401 &&
      client.getQueryData(['session']) === user
    ) {
      client.removeQueries({ queryKey: ['account', user.id] })
      client.setQueryData(['session'], null)
    }
  }, [error, client, user])
}
export function FavoriteAction({
  user,
  productId,
  name,
  favorited,
  onKeyboardStart,
}: {
  user: User
  productId: number
  name: string
  favorited: boolean
  onKeyboardStart?: (trigger: HTMLButtonElement) => void
}) {
  const client = useQueryClient()
  const ui = useUi()
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const pending = useFavoriteWrites(
    (state) => state.owners.get(user.id)?.has(productId) ?? false,
  )
  async function change(keyboardTrigger: HTMLButtonElement | null) {
    if (client.getQueryData(['session']) !== user) return
    const owner = useFavoriteWrites.getState().begin(user.id, productId)
    if (!owner) return
    ui.clear()
    const sameSession = () => client.getQueryData(['session']) === user
    try {
      if (keyboardTrigger) onKeyboardStart?.(keyboardTrigger)
      await (favorited
        ? api.removeFavorite(productId)
        : api.addFavorite(productId))
      if (sameSession() && mounted.current)
        ui.status(
          favorited
            ? `${name}의 찜을 해제했습니다.`
            : `${name}을 찜에 저장했습니다.`,
        )
    } catch (error) {
      if (!sameSession()) return
      if (error instanceof ApiClientError && error.status === 401) {
        client.removeQueries({ queryKey: ['account', user.id] })
        client.setQueryData(['session'], null)
      }
      if (mounted.current) ui.error(error)
    } finally {
      useFavoriteWrites.getState().finish(user.id, productId, owner)
    }
  }
  return (
    <button
      type="button"
      className="btn btn-outline-dark"
      aria-label={`${name} ${favorited ? '찜 해제' : '찜하기'}`}
      aria-pressed={favorited}
      aria-busy={pending}
      disabled={pending}
      data-favorite-product-id={productId}
      onClick={(event) => {
        void change(event.detail === 0 ? event.currentTarget : null)
      }}
    >
      {pending ? '처리 중…' : favorited ? '♥ 찜 해제' : '♡ 찜하기'}
    </button>
  )
}
