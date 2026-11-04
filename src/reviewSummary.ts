import type { Page, Review } from './types'

export type ReviewPage = Page<Review> & { ratingSummary?: unknown }
export interface ReviewSummary { count: number; average: number | null }

// The provider owns the whole-product aggregate. Never substitute the current
// page's mean, clamp legacy values, or turn missing information into zero.
export function reviewSummary(page: ReviewPage): ReviewSummary | null {
  const value = page.ratingSummary
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const { count, average } = value as Record<string, unknown>
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 || count !== page.total) return null
  if (count === 0 ? average !== null : typeof average !== 'number' || !Number.isFinite(average)) return null
  return { count, average: average as number | null }
}
