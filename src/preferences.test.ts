import { describe, expect, it } from 'vitest'
import {
  buildPreferencePayload,
  emptyPreferences,
  preferencesToDraft,
} from './preferences'

describe('본인 명시취향 입력 계약', () => {
  it('세 설문 상태와 전체 unknown 교체를 구분하고 소유 선택자를 보내지 않는다', () => {
    for (const status of ['NOT_STARTED', 'SKIPPED', 'COMPLETED'] as const) {
      const value = emptyPreferences(status)
      expect(value.surveyStatus).toBe(status)
      expect(Object.keys(value)).toEqual([
        'surveyStatus',
        'softPreferences',
        'hardConstraints',
      ])
      expect(
        Object.values(value.softPreferences).every((field) => field === null),
      ).toBe(true)
      expect(
        Object.values(value.hardConstraints).every((field) => field === null),
      ).toBe(true)
    }
    expect(
      buildPreferencePayload(
        preferencesToDraft(emptyPreferences('NOT_STARTED')),
      ),
    ).toEqual(emptyPreferences('COMPLETED'))
  })
  it('미선택 null과 선호없음 [] 및 실제 0 경계를 보존한다', () => {
    const initial = emptyPreferences('COMPLETED')
    initial.softPreferences.categories = []
    initial.softPreferences.aromaTags = []
    initial.hardConstraints.maxPriceKrw = 0
    initial.hardConstraints.minAbvPercent = 0
    expect(buildPreferencePayload(preferencesToDraft(initial))).toEqual(initial)
  })
  it('선호 도수가 필수 범위 밖이어도 각각 유지하며 태그 내부개행을 나누지 않는다', () => {
    const value = emptyPreferences('COMPLETED')
    value.softPreferences = {
      categories: ['약 · 청주', '탁주'],
      tasteTags: ['owned\nfixture'],
      aromaTags: [],
      targetAbvPercent: 80.25,
    }
    value.hardConstraints = {
      minPriceKrw: 0,
      maxPriceKrw: 0,
      minAbvPercent: 0,
      maxAbvPercent: 10.5,
    }
    expect(buildPreferencePayload(preferencesToDraft(value))).toEqual(value)
  })
  it('존재하지 않는 주종·중복·빈 선택과 정규화 중복 태그를 거부한다', () => {
    for (const values of [[], ['약청주'], ['탁주', '탁주']])
      expect(() =>
        buildPreferencePayload({
          ...preferencesToDraft(emptyPreferences('COMPLETED')),
          categories: { status: 'tags', values },
        }),
      ).toThrow('주종')
    expect(() =>
      buildPreferencePayload({
        ...preferencesToDraft(emptyPreferences('COMPLETED')),
        taste: { status: 'tags', values: ['SWEET', ' sweet '] },
      }),
    ).toThrow('중복')
  })
  it('가격 소수/범위 초과와 도수 정밀도/범위·역전 조건을 거부한다', () => {
    const draft = preferencesToDraft(emptyPreferences('COMPLETED'))
    for (const maxPriceKrw of ['-1', '1.2', '2147483648', '1e2'])
      expect(() => buildPreferencePayload({ ...draft, maxPriceKrw })).toThrow()
    for (const targetAbvPercent of ['-1', '100.01', '12.345', 'NaN'])
      expect(() =>
        buildPreferencePayload({ ...draft, targetAbvPercent }),
      ).toThrow()
    expect(() =>
      buildPreferencePayload({ ...draft, minPriceKrw: '2', maxPriceKrw: '1' }),
    ).toThrow('최소값')
    expect(() =>
      buildPreferencePayload({
        ...draft,
        minAbvPercent: '2',
        maxAbvPercent: '1',
      }),
    ).toThrow('최소값')
  })
})
