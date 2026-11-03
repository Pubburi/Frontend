import { useComparison } from '../state/comparison'
import { useUi } from '../state/ui'
import type { Product } from '../types'

export function CompareAction({ product }: { product: Product }) {
  const selected = useComparison((state) => state.ids.includes(product.id))
  const toggle = useComparison((state) => state.toggle)
  const status = useUi((state) => state.status)
  return <button
    type="button"
    className="btn btn-outline-dark btn-sm compare-action"
    aria-pressed={selected}
    aria-label={`${product.name} 비교 ${selected ? '해제' : '선택'}`}
    onClick={() => {
      if (!toggle(product.id)) {
        status('비교 상품은 최대 4개입니다. 선택한 상품을 먼저 해제해 주세요.')
        return
      }
      status(`${product.name}을(를) 비교 ${selected ? '해제' : '선택'}했습니다.`)
    }}
  >{selected ? '비교 해제' : '비교 선택'}</button>
}
