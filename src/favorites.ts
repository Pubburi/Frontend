export const FAVORITES_PAGE_SIZE = 12
export function favoritePage(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return 1
  const page = Number(value)
  return Number.isInteger(page) &&
    page >= 1 &&
    (page - 1) * FAVORITES_PAGE_SIZE <= 2_147_483_647
    ? page
    : 1
}
export const favoritesPageKey = (
  userId: string,
  page: number,
  revision: number,
) => ['account', userId, 'favorites', 'page', page, revision] as const
export const favoriteStatusKey = (
  userId: string,
  productId: number,
  revision: number,
) => ['account', userId, 'favorites', 'status', productId, revision] as const
