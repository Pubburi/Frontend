import { Link, useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, ApiClientError } from '../services/api'
import { Empty, Loading } from '../components/ui'
import { marketCoordinate, parseMarketId } from '../markets'
import type { Market } from '../types'

export default function MarketDetailPage() {
  const { id: rawId } = useParams()
  const location = useLocation()
  return <MarketDetails key={location.key} rawId={rawId} />
}

function MarketDetails({ rawId }: { rawId: string | undefined }) {
  const id = parseMarketId(rawId)
  const market = useQuery<Market>({
    queryKey: ['catalog', 'market', id],
    queryFn: async () => {
      const value = await api.market(id!)
      if (value?.id !== id) throw new Error('매장 정보가 요청한 매장과 일치하지 않습니다.')
      return value
    },
    enabled: id !== null,
    refetchOnMount: 'always',
    refetchOnReconnect: false,
  })
  const paused = market.fetchStatus === 'paused'
  const waiting = market.isPending || market.fetchStatus !== 'idle'
  return (
    <section className="view market-detail-view" data-market-id={id ?? undefined}>
      <div className="shop-intro compact-intro">
        <div>
          <p className="section-kicker">Store</p>
          <h1>매장 상세</h1>
          <p>시연용 매장 위치 정보입니다.</p>
        </div>
        <div className="market-detail-actions">
          <Link className="btn btn-outline-dark" to="/#stores">홈의 매장 목록</Link>
          {id !== null && <button className="btn btn-outline-dark"
            aria-disabled={waiting}
            onClick={() => { if (!waiting) void market.refetch() }}>
            {market.isError ? '매장 정보 다시 시도' : '매장 정보 새로고침'}
          </button>}
        </div>
      </div>
      {id === null ? (
        <Empty title="매장 번호를 확인해 주세요" description="홈의 매장 목록에서 다시 선택해 주세요." />
      ) : paused ? (
        <Empty title="연결 후 매장 정보를 확인해 주세요" description="연결이 복구되면 현재 매장 정보를 다시 확인합니다." />
      ) : waiting ? (
        <Loading label="현재 매장 정보를 확인하는 중입니다." />
      ) : market.isError ? (
        <Empty
          title={market.error instanceof ApiClientError && market.error.status === 404
            ? '매장을 찾을 수 없습니다'
            : '매장 정보를 불러오지 못했습니다'}
          description={market.error instanceof ApiClientError && market.error.status === 404
            ? '삭제되었거나 제공되지 않는 매장입니다. 홈의 매장 목록에서 다시 선택해 주세요.'
            : '현재 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'}
        />
      ) : market.data ? (
        <article className="market-detail-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Store {market.data.id}</span>
              <h2>{market.data.name}</h2>
            </div>
          </div>
          <dl className="market-coordinates">
            <div><dt>위도</dt><dd data-market-field="latitude">{marketCoordinate(market.data.latitude, 'latitude')}</dd></div>
            <div><dt>경도</dt><dd data-market-field="longitude">{marketCoordinate(market.data.longitude, 'longitude')}</dd></div>
          </dl>
          <p className="muted">매장 사진은 현재 제공되지 않습니다.</p>
          <p className="muted">실제 영업·재고·예약·결제는 제공하지 않습니다.</p>
        </article>
      ) : null}
    </section>
  )
}
