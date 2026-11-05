import { normalizeProductTag, validateProductTags } from './productTags'

export function buildReviewTasteTags(values: string[]): string[] {
  const issue = validateProductTags({ tasteTag: values }).tasteTag
  if (issue) throw new Error(issue.message)
  return values.map(normalizeProductTag)
}

export function readReviewTasteTags(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== 'string')) return null
  return validateProductTags({ tasteTag: value }).tasteTag ? null : value
}
