import { describe, expect, it } from 'vitest'
import { publicSourceLink } from './publicProductFeatures'

describe('공개 출처 링크의 실제 탐색 경계', () => {
  it('계정 정보 없는 절대 http와 https만 URL로 제공한다', () => {
    expect(publicSourceLink('https://example.test/facts?item=1#source')).toBe('https://example.test/facts?item=1#source')
    expect(publicSourceLink('HTTP://example.test')).toBe('http://example.test/')
  })

  it('프로토콜 실행·상대 주소·잘못된 호스트·제어 문자는 탐색하지 않는다', () => {
    for (const value of [null, '', 'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', '//example.test', '/facts',
      'ftp://example.test/facts', 'https://', ' https://example.test', 'https://example.test/a b',
      'https://example.test/\n', 'https://example.test/\u0000', 'https://example.test/\u007f'])
      expect(publicSourceLink(value)).toBeNull()
  })

  it('일반·인코딩된 계정 정보는 URL과 함께 노출하지 않는다', () => {
    for (const value of ['https://user:pass@example.test', 'http://user@example.test', 'https://%75ser:%70ass@example.test'])
      expect(publicSourceLink(value)).toBeNull()
  })
})
