export function parseOrderId(value: string | undefined): number | null {
  if (!value || !/^[1-9]\d{0,9}$/.test(value)) return null
  const id = Number(value)
  return id <= 2147483647 ? id : null
}

export function demoOrderStatus(completed: string): string {
  if (completed === 'Y') return '데모 처리 완료'
  if (completed === 'N') return '데모 접수'
  return '상태 미확인'
}
