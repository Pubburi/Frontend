import { useId } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../services/api'

type ProductLink = { id: number; name: string }

function readLinks(data: unknown, referenceId: number): ProductLink[] {
  if (!data || typeof data !== 'object' || !('items' in data) ||
      !Array.isArray(data.items) || data.items.length > 4) return []

  const ids = new Set([referenceId])
  const links: ProductLink[] = []
  for (const item of data.items as unknown[]) {
    if (!item || typeof item !== 'object' || !('id' in item) || !('name' in item) ||
        typeof item.id !== 'number' || !Number.isInteger(item.id) || item.id < 1 || item.id > 2147483647 ||
        ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim()) return []
    ids.add(item.id)
    links.push({ id: item.id, name: item.name })
  }
  return links
}

export function SimilarProducts({ productId }: { productId: number }) {
  const heading = useId()
  const query = useQuery({
    queryKey: ['catalog', 'similar-products', productId],
    queryFn: ({ signal }) => api.similarProducts(productId, signal),
  })
  if (!query.isSuccess || query.fetchStatus !== 'idle') return null
  const links = readLinks(query.data, productId)
  if (!links.length) return null

  return (
    <section className="section-band similar-products" aria-labelledby={heading}>
      <div>
        <h2 id={heading}>비슷한 상품</h2>
        <p className="muted">검수한 시연 상품의 특성을 기준으로 보여드려요.</p>
      </div>
      <ul className="content-cards">
        {links.map(({ id, name }) => (
          <li key={id}>
            <Link className="content-card similar-product-link" to={`/products/${id}`}>{name}</Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
