import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api'
import { useUi } from '../state/ui'
import {
  buildFeaturePayload,
  featureQueryKey,
  featureSaveKey,
  featuresToDraft,
  unknownFeatures,
  type TagDraft,
  type TagStatus,
} from '../productFeatures'
import type { Product, ProductFeatures } from '../types'
import { Empty, Loading } from './ui'

export function ProductFeatureEditor({
  product,
  userId,
  onClose,
}: {
  product: Product
  userId: string
  onClose: () => void
}) {
  const title = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  const query = useQuery({
    queryKey: featureQueryKey(userId, product.id),
    queryFn: () => api.productFeatures(product.id),
    refetchOnReconnect: false,
  })
  useEffect(() => {
    title.current?.focus()
  }, [])
  return (
    <section className="feature-editor" aria-labelledby={titleId}>
      <div className="admin-section-heading">
        <h3 ref={title} id={titleId} tabIndex={-1}>
          {product.name} 특성 편집
        </h3>
        <button className="btn btn-sm btn-outline-secondary" onClick={onClose}>
          특성 편집 닫기
        </button>
      </div>
      <p className="muted">
        확인하지 않은 값은 미확인으로 남겨 주세요. 저장하면 이 화면의 내용으로
        기존 특성을 모두 교체합니다. 최신 서버 값은 편집을 닫고 다시 열어 확인할
        수 있습니다.
      </p>
      {query.isPending || query.isFetching ? (
        <Loading label="상품 특성을 불러오는 중입니다." />
      ) : query.isError ? (
        <Empty
          title="상품 특성을 불러오지 못했습니다"
          description={query.error.message}
        >
          <button
            className="btn btn-outline-dark"
            onClick={() => query.refetch()}
          >
            특성 다시 불러오기
          </button>
        </Empty>
      ) : (
        <FeatureForm product={product} userId={userId} initial={query.data} />
      )}
    </section>
  )
}

function FeatureForm({
  product,
  userId,
  initial,
}: {
  product: Product
  userId: string
  initial: ProductFeatures
}) {
  const [draft, setDraft] = useState(() => featuresToDraft(initial))
  const client = useQueryClient()
  const ui = useUi()
  const pending = ui.pending[featureSaveKey(userId, product.id)]
  const sourceRequired = Boolean(
    draft.volumeMl.trim() ||
    draft.description.trim() ||
    draft.taste.status !== 'unknown' ||
    draft.aroma.status !== 'unknown',
  )
  async function save(event: FormEvent) {
    event.preventDefault()
    const submitted = draft
    let payload
    try {
      payload = buildFeaturePayload(submitted)
    } catch (error) {
      ui.error(error)
      return
    }
    const result = await ui.run(
      featureSaveKey(userId, product.id),
      async () => {
        const saved = await api.replaceProductFeatures(product.id, payload)
        client.setQueryData(featureQueryKey(userId, product.id), saved)
        return saved
      },
      `${product.name} 특성이 저장되었습니다.`,
    )
    if (result.ok)
      setDraft((current) =>
        current === submitted ? featuresToDraft(result.data) : current,
      )
  }
  function tagField(key: 'taste' | 'aroma', label: string) {
    const value = draft[key]
    const update = (next: TagDraft) => setDraft({ ...draft, [key]: next })
    return (
      <fieldset className="feature-tags">
        <legend>{label}</legend>
        <label className="field-group">
          <span>확인 상태</span>
          <select
            className="form-select"
            aria-label={`${label} 확인 상태`}
            value={value.status}
            onChange={(e) =>
              update({
                ...value,
                status: e.target.value as TagStatus,
                values:
                  e.target.value === 'tags' && !value.values.length
                    ? ['']
                    : value.values,
              })
            }
          >
            <option value="unknown">미확인</option>
            <option value="empty">검수 완료 · 선언할 태그 없음</option>
            <option value="tags">확인한 태그 입력</option>
          </select>
        </label>
        {value.status === 'tags' && (
          <div className="feature-tag-items">
            {value.values.map((tag, index) => (
              <div className="feature-tag-item" key={index}>
                <label className="field-group">
                  <span>
                    {label} {index + 1}
                  </span>
                  <textarea
                    className="form-control"
                    aria-label={`${label} ${index + 1}`}
                    required
                    maxLength={40}
                    rows={1}
                    value={tag}
                    onChange={(e) =>
                      update({
                        ...value,
                        values: value.values.map((current, i) =>
                          i === index ? e.target.value : current,
                        ),
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  aria-label={`${label} ${index + 1} 삭제`}
                  onClick={() =>
                    update({
                      ...value,
                      values: value.values.filter((_, i) => i !== index),
                    })
                  }
                >
                  삭제
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-sm btn-outline-dark"
              disabled={value.values.length >= 20}
              onClick={() =>
                update({ ...value, values: [...value.values, ''] })
              }
            >
              {label} 추가
            </button>
            <small>
              항목별로 최대 20개·각 40자. 대소문자만 다른 중복도 사용할 수
              없습니다.
            </small>
          </div>
        )}
      </fieldset>
    )
  }
  return (
    <form
      className="feature-form"
      aria-label={`${product.name} 상품 특성`}
      onSubmit={save}
    >
      <label className="field-group">
        <span>용량 (mL)</span>
        <input
          className="form-control"
          aria-label="용량 (mL)"
          type="number"
          min={1}
          max={1000000}
          step={1}
          placeholder="미확인"
          value={draft.volumeMl}
          onChange={(e) => setDraft({ ...draft, volumeMl: e.target.value })}
        />
        <small>빈칸은 미확인입니다. 확인한 정수 용량만 입력해 주세요.</small>
      </label>
      <label className="field-group">
        <span>상품 설명</span>
        <textarea
          className="form-control"
          aria-label="상품 설명"
          maxLength={2000}
          placeholder="미확인"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </label>
      <div className="feature-tag-grid">
        {tagField('taste', '맛 태그')}
        {tagField('aroma', '향 태그')}
      </div>
      <label className="field-group">
        <span>출처명{sourceRequired ? ' (필수)' : ' (선택)'}</span>
        <input
          className="form-control"
          aria-label="출처명"
          maxLength={200}
          required={sourceRequired}
          value={draft.sourceName}
          onChange={(e) => setDraft({ ...draft, sourceName: e.target.value })}
        />
        <small>
          확인한 값이나 검수 완료 태그에는 출처가 필요합니다. 출처 기록이 이용
          권리의 승인을 뜻하지는 않습니다.
        </small>
      </label>
      <label className="field-group">
        <span>출처 URL (선택)</span>
        <input
          className="form-control"
          aria-label="출처 URL"
          type="url"
          maxLength={1000}
          value={draft.sourceUrl}
          onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })}
        />
      </label>
      <label className="field-group">
        <span>공개 검수 메모 (선택)</span>
        <textarea
          className="form-control"
          aria-label="공개 검수 메모"
          maxLength={1000}
          value={draft.sourceNote}
          onChange={(e) => setDraft({ ...draft, sourceNote: e.target.value })}
        />
        <small>
          출처가 확인한 필드와 검수 범위를 적어 주세요. 공개되는 내용이므로
          개인정보·인증값을 넣지 마세요.
        </small>
      </label>
      <div className="button-row">
        <button
          className="btn btn-dark"
          disabled={pending}
          aria-busy={Boolean(pending)}
        >
          특성 저장
        </button>
        <button
          className="btn btn-outline-secondary"
          type="button"
          onClick={() => setDraft(featuresToDraft(unknownFeatures()))}
        >
          모두 미확인으로
        </button>
      </div>
    </form>
  )
}
