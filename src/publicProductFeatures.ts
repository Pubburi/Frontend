export const publicFeatureQueryKey = (productId: number) =>
  ['catalog', 'product-features', productId] as const

// Provider validation is independent of safe navigation in the consuming view.
// Do not navigate a relative/credential-bearing URL or expose its raw credentials.
export function publicSourceLink(value: string | null): string | null {
  if (!value || !/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f]/.test(value)) return null
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname && !url.username && !url.password
      ? url.href
      : null
  } catch { return null }
}
