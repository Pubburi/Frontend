export function parseOrderId(value: string | undefined): number | null {
  if (!value || !/^[1-9]\d{0,9}$/.test(value)) return null
  const id = Number(value)
  return id <= 2147483647 ? id : null
}

export const ORDER_HISTORY_PAGE_SIZE = 10

export function parseOrderHistoryPage(search: string): number {
  const values = new URLSearchParams(search).getAll('ordersPage')
  if (values.length !== 1) return 1
  const page = parseOrderId(values[0])
  return page !== null && (page - 1) * ORDER_HISTORY_PAGE_SIZE <= 2147483647 ? page : 1
}

export function orderHistorySearch(page: number, search = ''): string {
  const params = new URLSearchParams(search)
  if (page > 1) params.set('ordersPage', String(page))
  else params.delete('ordersPage')
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function demoOrderStatus(completed: string): string {
  if (completed === 'Y') return '데모 처리 완료'
  if (completed === 'N') return '데모 접수'
  return '상태 미확인'
}
