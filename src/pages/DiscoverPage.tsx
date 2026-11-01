import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { Empty, Loading, ProductCard } from '../components/ui'

export function DiscoverPage() {
  const products = useQuery({
    queryKey: ['catalog', 'default-products', 4],
    queryFn: () => api.defaultProducts(4),
  })
  return (
    <section className="view">
      <div className="shop-intro compact-intro">
        <div>
          <p className="section-kicker">Discover</p>
          <h1>기본 주류 둘러보기</h1>
          <p>
            취향 설정과 관계없이 둘러볼 수 있는 주류예요. 상품을 골라 자세히
            확인해 보세요.
          </p>
        </div>
        <Link className="btn btn-outline-dark" to="/products">
          전체 주류 보기
        </Link>
        <button
          className="btn btn-outline-dark"
          disabled={products.isFetching}
          onClick={() => products.refetch()}
        >
          기본 목록 새로고침
        </button>
      </div>
      {products.isPending ? (
        <Loading label="기본 주류를 불러오는 중입니다." />
      ) : products.isError ? (
        <Empty
          title="기본 주류를 불러오지 못했습니다"
          description="연결 상태를 확인한 뒤 다시 시도해 주세요."
        >
          <button
            className="btn btn-dark"
            disabled={products.isFetching}
            onClick={() => products.refetch()}
          >
            기본 목록 다시 불러오기
          </button>
        </Empty>
      ) : products.data.items.length ? (
        <div className="product-grid">
          {products.data.items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <Empty title="지금 둘러볼 기본 주류가 없습니다">
          <Link className="btn btn-dark" to="/products">
            전체 주류 보기
          </Link>
        </Empty>
      )}
    </section>
  )
}
