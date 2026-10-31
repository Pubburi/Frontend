import { describe, expect, it } from 'vitest'
import {
  buildFeaturePayload,
  featuresToDraft,
  unknownFeatures,
} from './productFeatures'

describe('상품 특성 전체 교체 입력 계약', () => {
  it('미확인 값을 0이나 빈 태그로 만들지 않고 일곱 필드를 모두 전송한다', () => {
    expect(buildFeaturePayload(featuresToDraft(unknownFeatures()))).toEqual({
      volumeMl: null,
      description: null,
      tasteTags: null,
      aromaTags: null,
      sourceName: null,
      sourceUrl: null,
      sourceNote: null,
    })
    const draft = featuresToDraft({
      ...unknownFeatures(),
      tasteTags: [],
      sourceName: '검수 근거',
    })
    expect(draft.taste.status).toBe('empty')
    expect(draft.aroma.status).toBe('unknown')
    expect(buildFeaturePayload(draft)).toMatchObject({
      tasteTags: [],
      aromaTags: null,
      sourceName: '검수 근거',
    })
  })

  it('확인한 용량·설명·태그와 전체 출처를 정확한 JSON 타입으로 만든다', () => {
    const draft = featuresToDraft({
      ...unknownFeatures(),
      volumeMl: 750,
      description: ' 검수된 설명 ',
      tasteTags: ['SWEET', ' floral '],
      aromaTags: [],
      sourceName: ' 검수 표본 ',
      sourceUrl: 'https://example.com/source',
      sourceNote: ' 공개 검수 범위 ',
    })
    expect(buildFeaturePayload(draft)).toEqual({
      volumeMl: 750,
      description: '검수된 설명',
      tasteTags: ['SWEET', 'floral'],
      aromaTags: [],
      sourceName: '검수 표본',
      sourceUrl: 'https://example.com/source',
      sourceNote: '공개 검수 범위',
    })
  })

  it('확인한 값이나 빈 태그 배열에도 출처명을 요구한다', () => {
    for (const changes of [
      { volumeMl: 500 },
      { description: '설명' },
      { tasteTags: [] },
      { aromaTags: ['검증용'] },
    ]) {
      expect(() =>
        buildFeaturePayload(
          featuresToDraft({ ...unknownFeatures(), ...changes }),
        ),
      ).toThrow('출처명')
    }
    expect(
      buildFeaturePayload(
        featuresToDraft({ ...unknownFeatures(), sourceNote: '출처 확인 예정' }),
      ).sourceNote,
    ).toBe('출처 확인 예정')
  })

  it('소수·지수 표기·0·범위 초과 용량을 조용히 숫자로 바꾸지 않는다', () => {
    for (const volumeMl of ['0', '-1', '1.5', '1e3', 'NaN', '1000001'])
      expect(() =>
        buildFeaturePayload({
          ...featuresToDraft(unknownFeatures()),
          volumeMl,
        }),
      ).toThrow('정수')
  })

  it('맛·향의 공백/정규화 중복·개수·길이 위반을 전송하지 않는다', () => {
    for (const values of [
      [],
      [''],
      ['one', '', 'two'],
      ['SWEET', ' sweet '],
      ['a'.repeat(41)],
      Array.from({ length: 21 }, (_, i) => `tag-${i}`),
    ])
      expect(() =>
        buildFeaturePayload({
          ...featuresToDraft({ ...unknownFeatures(), sourceName: '근거' }),
          taste: { status: 'tags', values },
        }),
      ).toThrow()
  })

  it('내부 개행이 포함된 단일 태그를 구분자로 다시 나누지 않는다', () => {
    const existing = {
      ...unknownFeatures(),
      tasteTags: ['owned\nfixture'],
      sourceName: '직접 작성 표본',
    }
    const draft = featuresToDraft(existing)
    expect(draft.taste.values).toEqual(['owned\nfixture'])
    expect(
      buildFeaturePayload({ ...draft, description: '설명만 변경' }).tasteTags,
    ).toEqual(existing.tasteTags)
  })

  it('계정 정보·다른 프로토콜·상대 URL을 거부하고 선택적 출처를 길이 제한한다', () => {
    for (const sourceUrl of [
      'https://user:secret@example.com/',
      'file:///tmp/source',
      '/source',
      'https://example.com/a\nb',
    ])
      expect(() =>
        buildFeaturePayload({
          ...featuresToDraft(unknownFeatures()),
          sourceUrl,
        }),
      ).toThrow('출처 URL')
    expect(() =>
      buildFeaturePayload({
        ...featuresToDraft(unknownFeatures()),
        sourceName: 'a'.repeat(201),
      }),
    ).toThrow('200자')
    expect(() =>
      buildFeaturePayload({
        ...featuresToDraft(unknownFeatures()),
        description: 'a'.repeat(2001),
      }),
    ).toThrow('2000자')
  })
})
