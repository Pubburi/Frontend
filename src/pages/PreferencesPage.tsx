import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiClientError } from '../services/api'
import { useSession } from '../queries'
import { useUi } from '../state/ui'
import { usePreferenceWrites } from '../state/preferenceWrites'
import { categories } from '../catalog'
import { Confirm, Empty, Loading } from '../components/ui'
import { TagEditor } from '../components/TagEditor'
import {
  buildPreferencePayload,
  emptyPreferences,
  preferenceQueryKey,
  preferencesToDraft,
  type PreferenceDraft,
} from '../preferences'
import type { ExplicitPreferences, SurveyStatus, User } from '../types'
import type { TagStatus } from '../tagDraft'

const statusLabels: Record<SurveyStatus, string> = {
  NOT_STARTED: '아직 입력하지 않음',
  SKIPPED: '건너뜀',
  COMPLETED: '입력 완료',
}
export function PreferencesPage() {
  const session = useSession()
  return session.data ? (
    <PreferenceEditor key={session.data.id} user={session.data} />
  ) : null
}
function PreferenceEditor({ user }: { user: User }) {
  const client = useQueryClient()
  const pending = usePreferenceWrites((state) => state.owners.has(user.id))
  const [initial, setInitial] = useState<ExplicitPreferences | null>(null)
  const query = useQuery({
    queryKey: preferenceQueryKey(user.id),
    queryFn: api.ownPreferences,
    enabled: !initial && !pending,
    refetchOnReconnect: false,
  })
  useEffect(() => {
    if (!initial && !pending && query.isSuccess && !query.isFetching)
      setInitial(query.data)
  }, [initial, pending, query.data, query.isSuccess, query.isFetching])
  useEffect(() => {
    if (
      query.error instanceof ApiClientError &&
      query.error.status === 401 &&
      client.getQueryData(['session']) === user
    ) {
      client.removeQueries({ queryKey: ['account', user.id] })
      client.setQueryData(['session'], null)
    }
  }, [query.error, client, user])
  return (
    <section className="view preferences-view">
      <div className="shop-intro compact-intro">
        <div>
          <p className="section-kicker">My Preferences</p>
          <h1>나의 주류 취향</h1>
          <p>직접 고른 선호와 꼭 지킬 조건을 저장하고 언제든 바꿀 수 있어요.</p>
        </div>
        <Link className="btn btn-outline-dark" to="/profile">
          마이페이지
        </Link>
      </div>
      {initial ? (
        <PreferenceForm
          user={user}
          initial={initial}
          savedStatus={query.data?.surveyStatus ?? initial.surveyStatus}
        />
      ) : query.isError ? (
        <Empty
          title="취향을 불러오지 못했습니다"
          description="연결 상태를 확인한 뒤 다시 시도해 주세요."
        >
          <button className="btn btn-dark" onClick={() => query.refetch()}>
            취향 다시 불러오기
          </button>
        </Empty>
      ) : (
        <Loading
          label={
            pending
              ? '진행 중인 취향 저장을 기다리는 중입니다.'
              : '내 취향을 불러오는 중입니다.'
          }
        />
      )}
    </section>
  )
}
function PreferenceForm({
  user,
  initial,
  savedStatus,
}: {
  user: User
  initial: ExplicitPreferences
  savedStatus: SurveyStatus
}) {
  const client = useQueryClient()
  const ui = useUi()
  const [draft, setDraft] = useState(() => preferencesToDraft(initial))
  const [confirm, setConfirm] = useState<'SKIPPED' | 'NOT_STARTED' | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const pending = usePreferenceWrites((state) => state.owners.has(user.id))
  const sameSession = () => client.getQueryData(['session']) === user
  async function save(surveyStatus: SurveyStatus) {
    const submitted = draft
    let payload: ExplicitPreferences
    try {
      payload =
        surveyStatus === 'COMPLETED'
          ? buildPreferencePayload(submitted)
          : emptyPreferences(surveyStatus)
    } catch (error) {
      ui.error(error)
      return
    }
    const owner = usePreferenceWrites.getState().begin(user.id)
    if (!owner) return
    ui.clear()
    try {
      const saved = await api.replaceOwnPreferences(payload)
      if (!sameSession()) return
      client.setQueryData(preferenceQueryKey(user.id), saved)
      if (!mounted.current) return
      setDraft((current) =>
        current === submitted ? preferencesToDraft(saved) : current,
      )
      setConfirm(null)
      ui.status(
        surveyStatus === 'COMPLETED'
          ? '취향이 저장되었습니다.'
          : surveyStatus === 'SKIPPED'
            ? '설문을 건너뛰었습니다.'
            : '취향 입력을 초기화했습니다.',
      )
    } catch (error) {
      if (!sameSession()) return
      if (error instanceof ApiClientError && error.status === 401) {
        client.removeQueries({ queryKey: ['account', user.id] })
        client.setQueryData(['session'], null)
      }
      if (mounted.current) ui.error(error)
    } finally {
      usePreferenceWrites.getState().finish(user.id, owner)
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    void save('COMPLETED')
  }
  function numberField(
    key: keyof Omit<PreferenceDraft, 'categories' | 'taste' | 'aroma'>,
    label: string,
    price = false,
  ) {
    return (
      <label className="field-group">
        <span>{label}</span>
        <input
          className="form-control"
          aria-label={label}
          type="number"
          min={0}
          max={price ? 2147483647 : 100}
          step={price ? 1 : 0.01}
          placeholder={
            key === 'targetAbvPercent' ? '아직 모르겠어요' : '제한 없음'
          }
          value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      </label>
    )
  }
  return (
    <>
      <p className="muted">
        저장 상태: <strong>{statusLabels[savedStatus]}</strong> · 이 취향은 내
        계정에만 저장됩니다.
      </p>
      <form
        className="preferences-form"
        aria-label="내 취향 설정"
        onSubmit={submit}
      >
        <section className="preference-section">
          <h2>선호하는 주류</h2>
          <p className="muted">
            더 좋아하는 취향을 적어 주세요. 다른 주종을 제외하거나 반드시 지킬
            범위를 바꾸지는 않습니다.
          </p>
          <fieldset className="feature-tags">
            <legend>선호하는 주종</legend>
            <label className="field-group">
              <span>선호 상태</span>
              <select
                className="form-select"
                aria-label="주종 선호 상태"
                value={draft.categories.status}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    categories: {
                      ...draft.categories,
                      status: e.target.value as TagStatus,
                    },
                  })
                }
              >
                <option value="unknown">아직 모르겠어요</option>
                <option value="empty">특별히 선호하는 주종 없음</option>
                <option value="tags">선호하는 주종 선택</option>
              </select>
            </label>
            {draft.categories.status === 'tags' && (
              <div className="preference-categories">
                {categories.map(({ label }) => (
                  <label key={label}>
                    <input
                      type="checkbox"
                      checked={draft.categories.values.includes(label)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          categories: {
                            ...draft.categories,
                            values: e.target.checked
                              ? [...draft.categories.values, label]
                              : draft.categories.values.filter(
                                  (value) => value !== label,
                                ),
                          },
                        })
                      }
                    />{' '}
                    {label}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <div className="feature-tag-grid">
            <TagEditor
              label="맛 태그"
              value={draft.taste}
              onChange={(taste) => setDraft({ ...draft, taste })}
              unknownLabel="아직 모르겠어요"
              emptyLabel="특별히 선호하는 맛 없음"
              tagsLabel="선호하는 맛 직접 입력"
            />
            <TagEditor
              label="향 태그"
              value={draft.aroma}
              onChange={(aroma) => setDraft({ ...draft, aroma })}
              unknownLabel="아직 모르겠어요"
              emptyLabel="특별히 선호하는 향 없음"
              tagsLabel="선호하는 향 직접 입력"
            />
          </div>
          {numberField('targetAbvPercent', '선호 도수 (%)')}
        </section>
        <section className="preference-section">
          <h2>반드시 지킬 가격·도수 범위</h2>
          <p className="muted">
            비워 두면 해당 제한을 두지 않습니다. 0을 입력하면 실제 경계값으로
            저장합니다. 선호 도수가 이 범위 밖이어도 두 입력을 각각 유지합니다.
          </p>
          <div className="preference-ranges">
            {numberField('minPriceKrw', '최소 가격 (원)', true)}
            {numberField('maxPriceKrw', '최대 가격 (원)', true)}
            {numberField('minAbvPercent', '최소 도수 (%)')}
            {numberField('maxAbvPercent', '최대 도수 (%)')}
          </div>
        </section>
        <div className="button-row">
          <button
            className="btn btn-dark"
            disabled={pending}
            aria-busy={pending}
          >
            취향 저장
          </button>
          <button
            className="btn btn-outline-dark"
            type="button"
            disabled={pending}
            onClick={() => setConfirm('SKIPPED')}
          >
            이번에는 건너뛰기
          </button>
          <button
            className="text-button"
            type="button"
            disabled={pending}
            onClick={() => setConfirm('NOT_STARTED')}
          >
            저장값 초기화
          </button>
        </div>
      </form>
      <div className="button-row">
        <Link className="btn btn-outline-dark" to="/discover">기본 주류 둘러보기</Link>
        <p className="muted">취향을 아직 정하지 않았거나 이번에 건너뛰어도 둘러볼 수 있어요.</p>
      </div>
      {confirm && (
        <Confirm
          confirmLabel={confirm === 'SKIPPED' ? '건너뛰기' : '초기화'}
          title={
            confirm === 'SKIPPED'
              ? '설문을 건너뛸까요?'
              : '취향 입력을 초기화할까요?'
          }
          description="저장된 취향과 가격·도수 범위를 모두 비웁니다."
          pending={pending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            void save(confirm)
          }}
        />
      )}
    </>
  )
}
