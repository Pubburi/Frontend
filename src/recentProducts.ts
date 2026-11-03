export const RECENT_KEY = 'pubburi-recent-products-v1'
export const RECENT_LIMIT = 20
export const RECENT_MAX_AGE = 30 * 24 * 60 * 60 * 1000
export interface RecentEntry { id: number; viewedAt: number }

export function parseRecentProducts(raw: string | null, now: number): { entries: RecentEntry[]; invalid: boolean } {
  if (raw === null) return { entries: [], invalid: false }
  try {
    if (raw.length > 5000) throw new Error('oversized')
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object' || Object.keys(data).sort().join(',') !== 'entries,version' ||
        data.version !== 1 || !Array.isArray(data.entries) || data.entries.length > RECENT_LIMIT) throw new Error('shape')
    const seen = new Set<number>()
    for (const entry of data.entries) {
      if (!entry || typeof entry !== 'object' || Object.keys(entry).sort().join(',') !== 'id,viewedAt' ||
          !Number.isSafeInteger(entry.id) || entry.id < 1 || !Number.isSafeInteger(entry.viewedAt) || entry.viewedAt < 1 || seen.has(entry.id)) throw new Error('entry')
      seen.add(entry.id)
    }
    return { entries: data.entries.filter((entry: RecentEntry) => entry.viewedAt <= now && now - entry.viewedAt < RECENT_MAX_AGE)
      .sort((a: RecentEntry, b: RecentEntry) => b.viewedAt - a.viewedAt), invalid: false }
  } catch { return { entries: [], invalid: true } }
}
