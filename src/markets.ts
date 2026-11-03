// MarketRestController uses a positive Java int. Do not coerce another URL into a store ID.
export function parseMarketId(value: string | undefined): number | null {
  if (!value || !/^[1-9]\d{0,9}$/.test(value)) return null
  const id = Number(value)
  return id <= 2147483647 ? id : null
}

export function marketCoordinate(value: unknown, axis: 'latitude' | 'longitude'): string {
  const limit = axis === 'latitude' ? 90 : 180
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit
    ? String(value)
    : '미확인'
}
