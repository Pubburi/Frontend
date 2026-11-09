const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

const STATUS_MESSAGES = {
  0: '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  400: '입력한 내용을 다시 확인해 주세요.',
  401: '로그인이 필요합니다.',
  403: '이 작업을 수행할 권한이 없습니다.',
  404: '요청한 정보를 찾을 수 없습니다.',
  409: '현재 상태에서는 요청을 처리할 수 없습니다.',
}

const CODE_MESSAGES = {
  NETWORK_ERROR: STATUS_MESSAGES[0],
  VALIDATION_FAILED: STATUS_MESSAGES[400],
  UNAUTHORIZED: STATUS_MESSAGES[401],
  FORBIDDEN: STATUS_MESSAGES[403],
  NOT_FOUND: STATUS_MESSAGES[404],
}

function friendlyMessage(error, status) {
  if (CODE_MESSAGES[error?.code]) return CODE_MESSAGES[error.code]
  if (STATUS_MESSAGES[status]) return STATUS_MESSAGES[status]
  if (status >= 500) return '서버에 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.'
  return error?.message || '요청을 처리하지 못했습니다.'
}

export class ApiClientError extends Error {
  constructor(error, status) {
    super(friendlyMessage(error, status))
    this.name = 'ApiClientError'
    this.status = status
    this.code = error?.code || 'REQUEST_FAILED'
    this.fields = error?.fields || {}
  }
}

export function pageQuery(params = {}, defaults = {}) {
  const query = new URLSearchParams()
  const merged = { ...defaults, ...params }
  Object.entries(merged).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, String(item)))
    } else if (value !== undefined && value !== null && value !== '') {
      query.set(key, value)
    }
  })
  return query.toString()
}

async function request(path, options = {}, readResponse) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    })
  } catch (cause) {
    const error = new ApiClientError({ code: 'NETWORK_ERROR' }, 0)
    error.cause = cause
    throw error
  }

  const text = await response.text()
  let envelope = null
  if (text) {
    try {
      envelope = JSON.parse(text)
    } catch {
      if (!response.ok) {
        throw new ApiClientError({ code: response.statusText || 'INVALID_RESPONSE' }, response.status)
      }
      throw new ApiClientError({ code: 'INVALID_RESPONSE', message: '서버 응답을 읽을 수 없습니다.' }, response.status)
    }
  }
  const hasEnvelope = envelope && Object.prototype.hasOwnProperty.call(envelope, 'data')

  if (!response.ok || envelope?.error) {
    const error = envelope?.error || { code: response.statusText, message: response.statusText }
    throw new ApiClientError(error, response.status)
  }

  const data = hasEnvelope ? envelope.data : envelope
  return readResponse ? readResponse(data, response.headers) : data
}

function readSearchHint(value, original) {
  if (!value || !original || value.length > 1206) return null
  const match = /^(ALIAS|TYPO):((?:[A-Za-z0-9._~-]|%[0-9A-F]{2})+)$/.exec(value)
  if (!match) return null
  try {
    const q = decodeURIComponent(match[2])
    if (q === original || q.length > 100 || q !== q.trim() || q !== q.normalize('NFC') || /[\p{C}%_\\]/u.test(q)) return null
    return { kind: match[1], q }
  } catch {
    return null
  }
}

const productList = (params, readResponse) => request(`/products?${pageQuery(params, { page: 1, size: 12 })}`, {}, readResponse)

export const api = {
  me: () => request('/auth/me'),
  login: (payload) => request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  join: (payload) => request('/users', { method: 'POST', body: JSON.stringify(payload) }),
  idAvailable: (id) => request(`/users/id-available?id=${encodeURIComponent(id)}`),
  /** @param {string} owner @param {number} page @param {number} size @param {AbortSignal} signal @returns {Promise<unknown>} */
  notifications: (owner, page, size, signal) => request(`/users/me/notifications?${pageQuery({ page, size })}`, { signal, cache: 'no-store', headers: { 'X-Pubburi-Account-Owner': encodeURIComponent(owner) } }),
  /** @param {string} owner @param {string} id @returns {Promise<unknown>} */
  readNotification: (owner, id) => request(`/users/me/notifications/${encodeURIComponent(id)}/read`, { method: 'PUT', headers: { 'X-Pubburi-Account-Owner': encodeURIComponent(owner) } }),
  /** @param {string} owner @param {string[]} ids @returns {Promise<unknown>} */
  readNotifications: (owner, ids) => request('/users/me/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pubburi-Account-Owner': encodeURIComponent(owner) }, body: JSON.stringify({ ids }) }),
  /** @param {string} owner @param {number} expectedVersion @param {AbortSignal} signal @returns {Promise<unknown>} */
  cartRecommendations: (owner, expectedVersion, signal) => request('/users/me/cart/recommendations', { method: 'POST', cache: 'no-store', signal, headers: { 'Content-Type': 'application/json', 'X-Pubburi-Account-Owner': encodeURIComponent(owner) }, body: JSON.stringify({ expectedVersion, limit: 4 }) }),
  /** @param {string} owner @returns {Promise<import('../types').AccountCart>} */
  accountCart: (owner) => request('/users/me/cart', { cache: 'no-store', headers: { 'X-Pubburi-Account-Owner': encodeURIComponent(owner) } }),
  /** @param {string} owner @param {string} operationId @returns {Promise<import('../types').CartOperation>} */
  cartOperationResult: (owner, operationId) => request(`/users/me/cart/operations/${encodeURIComponent(operationId)}`, { cache: 'no-store', headers: { 'X-Pubburi-Account-Owner': encodeURIComponent(owner) } }),
  /** @param {string} owner @param {string} operationId @param {{kind:'MERGE'|'CHECKOUT',items:import('../types').CartIntentItem[],orderType:string|null,orderTable:string|null}} payload @returns {Promise<import('../types').CartOperation>} */
  resolveCartOperation: (owner, operationId, payload) => request(`/users/me/cart/operations/${encodeURIComponent(operationId)}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pubburi-Account-Owner': encodeURIComponent(owner) }, body: JSON.stringify(payload) }),
  /** @param {string} owner @param {number} productId @param {number} quantity @param {number} expectedVersion @returns {Promise<import('../types').AccountCart>} */
  setCartQuantity: (owner, productId, quantity, expectedVersion) => request(`/users/me/cart/items/${productId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Pubburi-Account-Owner': encodeURIComponent(owner) }, body: JSON.stringify({ quantity, expectedVersion }) }),
  /** @param {string} owner @param {number|null} productId @param {number} expectedVersion @returns {Promise<import('../types').AccountCart>} */
  removeCartItems: (owner, productId, expectedVersion) => request(`/users/me/cart${productId === null ? '' : `/items/${productId}`}?${pageQuery({ expectedVersion })}`, { method: 'DELETE', headers: { 'X-Pubburi-Account-Owner': encodeURIComponent(owner) } }),
  /** @param {string} owner @param {'merge'|'checkout'} kind @param {{operationId:string,expectedVersion:number,items:import('../types').CartIntentItem[],orderType?:string,orderTable?:string|null}} payload @returns {Promise<import('../types').CartOperation>} */
  cartOperation: (owner, kind, payload) => request(`/users/me/cart/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pubburi-Account-Owner': encodeURIComponent(owner) }, body: JSON.stringify(payload) }),
  /** @param {string} owner @param {{page?:number,size?:number}} [params] @returns {Promise<import('../types').Page<import('../types').NotebookEntry>>} */
  notebook: (owner, params = {}) => request(`/users/me/notebook?${pageQuery(params, { page: 1, size: 10 })}`, { cache: 'no-store', headers: { 'X-Pubburi-Account-Owner': encodeURIComponent(owner) } }),
  /** @param {string} owner @param {number} productId @param {AbortSignal} [signal] @returns {Promise<import('../types').NotebookEntry|null>} */
  notebookForProduct: (owner, productId, signal) => request(`/users/me/notebook/by-product/${productId}`, { cache: 'no-store', signal, headers: { 'X-Pubburi-Account-Owner': encodeURIComponent(owner) } }),
  /** @param {string} owner @param {string} id @param {AbortSignal} [signal] @returns {Promise<import('../types').NotebookEntry>} */
  notebookEntry: (owner, id, signal) => request(`/users/me/notebook/${encodeURIComponent(id)}`, { cache: 'no-store', signal, headers: { 'X-Pubburi-Account-Owner': encodeURIComponent(owner) } }),
  /** @param {string} owner @param {number} productId @param {import('../types').NotebookContent} content @returns {Promise<import('../types').NotebookEntry>} */
  createNotebookEntry: (owner, productId, content) => request('/users/me/notebook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pubburi-Account-Owner': encodeURIComponent(owner) }, body: JSON.stringify({ productId, ...content }) }),
  /** @param {string} owner @param {string} id @param {number} expectedVersion @param {import('../types').NotebookContent} content @returns {Promise<import('../types').NotebookEntry>} */
  updateNotebookEntry: (owner, id, expectedVersion, content) => request(`/users/me/notebook/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Pubburi-Account-Owner': encodeURIComponent(owner) }, body: JSON.stringify({ ...content, expectedVersion }) }),
  /** @param {string} owner @param {string} id @param {number} expectedVersion @returns {Promise<unknown>} */
  deleteNotebookEntry: (owner, id, expectedVersion) => request(`/users/me/notebook/${encodeURIComponent(id)}?${pageQuery({ expectedVersion })}`, { method: 'DELETE', headers: { 'X-Pubburi-Account-Owner': encodeURIComponent(owner) } }),
  profile: (id) => request(`/users/${encodeURIComponent(id)}/profile`),
  /** @param {{name: string}} payload @returns {Promise<boolean>} */
  updateOwnProfile: (payload) => request('/users/me/profile', { method: 'PUT', body: JSON.stringify({ name: payload.name }) }),
  /** @param {{currentPassword: string, newPassword: string}} payload @returns {Promise<boolean>} */
  updateOwnPassword: (payload) => request('/users/me/password', { method: 'PUT', body: JSON.stringify({ currentPassword: payload.currentPassword, newPassword: payload.newPassword }) }),
  /** @returns {Promise<import('../types').ExplicitPreferences>} */
  ownPreferences: () => request('/users/me/preferences'),
  /** @param {import('../searchPhrases').SearchOptIn[]} searchOptInFields @returns {Promise<unknown>} */
  ownSearchPhrases: (searchOptInFields) => request('/users/me/search-phrases', { method: 'POST', body: JSON.stringify({ searchOptInFields, limit: 5 }) }),
  /** @param {string} accountId @returns {Promise<unknown>} */
  ownContentRecommendations: (accountId) => request('/users/me/recommendations/content', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Pubburi-Feedback-Owner': encodeURIComponent(accountId) },
    body: JSON.stringify({ limit: 4, includeActivity: true }),
  }),
  /** @param {string} accountId @returns {Promise<unknown>} */
  ownExplorationRecommendations: (accountId) => request('/users/me/recommendations/exploration', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Pubburi-Feedback-Owner': encodeURIComponent(accountId) },
    body: JSON.stringify({ limit: 4 }),
  }),
  /** @param {number} productId @param {string} accountId @param {'MATCHED'|'NOT_INTERESTED'|null} [feedback] @param {AbortSignal} [signal] @returns {Promise<unknown>} */
  ownRecommendationFeedback: (productId, accountId, feedback, signal) => request(`/users/me/recommendations/feedback/${productId}`, {
    method: feedback === undefined ? 'GET' : feedback === null ? 'DELETE' : 'PUT',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Pubburi-Feedback-Owner': encodeURIComponent(accountId) },
    signal,
    ...(feedback == null ? {} : { body: JSON.stringify({ feedback }) }),
  }),
  /** @param {import('../types').ExplicitPreferences} payload @returns {Promise<import('../types').ExplicitPreferences>} */
  replaceOwnPreferences: (payload) => request('/users/me/preferences', { method: 'PUT', body: JSON.stringify(payload) }),
  /** @param {{ page?: number, size?: number }} params @returns {Promise<import('../types').Page<import('../types').Product>>} */
  ownFavorites: (params = {}) => request(`/users/me/favorites?${pageQuery(params, { page: 1, size: 12 })}`),
  /** @param {number} id @returns {Promise<import('../types').FavoriteState>} */
  addFavorite: (id) => request(`/users/me/favorites/${id}`, { method: 'PUT' }),
  /** @param {number} id @returns {Promise<import('../types').FavoriteState>} */
  favoriteState: (id) => request(`/users/me/favorites/${id}`),
  /** @param {number} id @returns {Promise<import('../types').FavoriteState>} */
  removeFavorite: (id) => request(`/users/me/favorites/${id}`, { method: 'DELETE' }),

  products: (params = {}) => productList(params),
  /** @param {ReturnType<typeof import('../utils/productFilters').parseProductQuery>} params @returns {Promise<{page: import('../types').Page<import('../types').Product>, hint: {kind: 'ALIAS'|'TYPO', q: string}|null}>} */
  catalogProducts: (params) => productList(params, (page, headers) => ({
    page,
    hint: page?.total === 0 && Array.isArray(page.items) && page.items.length === 0
      ? readSearchHint(headers?.get('X-Pubburi-Search-Hint'), params.q) : null,
  })),
  /** @param {string} q @param {AbortSignal} signal @returns {Promise<unknown>} */
  productSuggestions: (q, signal) => request(`/products/suggestions?${new URLSearchParams({ q })}`, { signal, cache: 'no-store' }),
  /** @param {AbortSignal} signal @returns {Promise<unknown>} */
  productThemes: (signal) => request('/products/themes', { signal, cache: 'no-store' }),
  popularProducts: () => request('/products/popular'),
  /** @param {number} size @returns {Promise<import('../types').DefaultProducts>} */
  defaultProducts: (size = 4) => request(`/recommendations/default?${new URLSearchParams({ size: String(size) })}`),
  product: (id) => request(`/products/${id}`),
  /** @param {number} id @param {AbortSignal} signal @returns {Promise<unknown>} */
  similarProducts: (id, signal) => request(`/products/${id}/similar?includeExplanations=true`, { signal, cache: 'no-store' }),
  /** @param {number} id @returns {Promise<import('../types').ProductFeatures>} */
  productFeatures: (id) => request(`/products/${id}/features`),
  /** @param {number} id @param {import('../types').ProductFeatureValues} payload @returns {Promise<import('../types').ProductFeatures>} */
  replaceProductFeatures: (id, payload) => request(`/admin/products/${id}/features`, { method: 'PUT', body: JSON.stringify(payload) }),
  createProduct: (payload) => request('/admin/products', { method: 'POST', body: JSON.stringify(payload) }),
  updateProduct: (id, payload) => request(`/admin/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteProduct: (id) => request(`/admin/products/${id}`, { method: 'DELETE' }),

  comments: (productId, params = {}) =>
    request(`/products/${productId}/comments?${pageQuery(params, { page: 1, size: 10 })}`),
  createComment: (payload) => request('/comments', { method: 'POST', body: JSON.stringify(payload) }),
  updateComment: (id, payload) => request(`/comments/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteComment: (id) => request(`/comments/${id}`, { method: 'DELETE' }),
  adminComments: (params = {}) => request(`/admin/comments?${pageQuery(params, { page: 1, size: 20 })}`),

  markets: (params = {}) => request(`/markets?${pageQuery(params, { page: 1, size: 12 })}`),
  /** @param {number} id @returns {Promise<import('../types').Market>} */
  market: (id) => request(`/markets/${id}`),
  createMarket: (payload) => request('/admin/markets', { method: 'POST', body: JSON.stringify(payload) }),
  updateMarket: (id, payload) => request(`/admin/markets/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteMarket: (id) => request(`/admin/markets/${id}`, { method: 'DELETE' }),

  createOrder: (payload) => request('/orders', { method: 'POST', body: JSON.stringify(payload) }),
  /** @param {number} id @returns {Promise<import('../types').Order>} */
  order: (id) => request(`/orders/${id}`),
  /** @param {string} owner @param {number} id @param {AbortSignal} signal @returns {Promise<unknown>} */
  orderRecommendations: (owner, id, signal) => request(`/users/me/orders/${id}/recommendations`, { method: 'POST', cache: 'no-store', signal, headers: { 'Content-Type': 'application/json', 'X-Pubburi-Account-Owner': encodeURIComponent(owner) }, body: JSON.stringify({ limit: 4 }) }),
  userOrders: (userId, params = {}) =>
    request(`/users/${encodeURIComponent(userId)}/orders?${pageQuery(params, { page: 1, size: 10 })}`),
  adminOrders: (params = {}) => request(`/admin/orders?${pageQuery(params, { page: 1, size: 20 })}`),
  completeOrder: (id) => request(`/admin/orders/${id}/complete`, { method: 'PATCH' }),
  deleteOrder: (id) => request(`/admin/orders/${id}`, { method: 'DELETE' }),

  adminUsers: (params = {}) => request(`/admin/users?${pageQuery(params, { page: 1, size: 20 })}`),
  updateUser: (id, payload) => request(`/admin/users/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteUser: (id) => request(`/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
