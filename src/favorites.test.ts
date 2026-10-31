import { describe, expect, it } from 'vitest'
import { favoritePage, favoritesPageKey, favoriteStatusKey } from './favorites'

describe('본인 찜 목록의 유한 페이지와 계정별 읽기 키', () => {
  it('URL의 유효한 페이지를 유지하고 잘못된 값과 SQL offset 범위 초과를 첫 페이지로 정규화한다', () => {
    expect(favoritePage('2')).toBe(2)
    expect(favoritePage('178956971')).toBe(178956971)
    for (const value of [
      null,
      '',
      '0',
      '-1',
      '1.2',
      '1e2',
      'NaN',
      '178956972',
      '9007199254740992',
    ])
      expect(favoritePage(value)).toBe(1)
  })
  it('같은 페이지라도 계정과 쓰기 완료 세대를 구분한다', () => {
    expect(favoritesPageKey('member', 2, 1)).toEqual([
      'account',
      'member',
      'favorites',
      'page',
      2,
      1,
    ])
    expect(favoriteStatusKey('other', 901, 3)).toEqual([
      'account',
      'other',
      'favorites',
      'status',
      901,
      3,
    ])
  })
})
