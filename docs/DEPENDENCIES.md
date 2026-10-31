# 의존성 보안 점검

점검일: **2026-10-31**. 기준 main은 `82c78b9`이며 Node 24를 사용했다.
변경 전 `npm audit`는 높음 8·보통 6, 총 14개 항목을 보고했다.
갱신한 lockfile의 **전체 및 운영 의존성 audit는 모두 0개**다.
이는 해당 시점 npm 보안 데이터베이스와 의존성 그래프의 검사 결과다.
실제 공격 재현 결과나 모든 보안 위험의 부재를 뜻하지 않는다.

## 적용 버전과 판단

| 패키지 | 변경 전 lock | 변경 후 lock | 근거 |
|---|---|---|---|
| Vue | 3.5.14 | 3.5.44 | server-renderer 속성명 차단 수정이 포함된 3.5.42 이상 |
| Vite | 6.4.3 | 6.4.5 | 개발 서버 파일 접근·편집기 관련 수정, 6.4.4 deny-query 회귀를 피한 6.4.5 |
| Vitest | 4.1.9 | 4.1.12 | mock 등록과 경로 처리 수정의 4.1.12 백포트 |
| sharp | 0.33.5 | 0.35.5 | libvips·libheif·librsvg 관련 수정 포함 |
| Vue Test Utils | 2.4.11 | 제거 | 소스·테스트·스크립트에 사용처가 없고 기존 20개 테스트는 Vitest·jsdom만 사용 |

공식 근거: [Vue 권고](https://github.com/vuejs/core/security/advisories/GHSA-g2v6-rqmx-r4w6),
[Vite 6.4.5 권고](https://github.com/vitejs/vite/security/advisories/GHSA-8g5g-mxqh-grgj),
[Vitest mock 등록 권고](https://github.com/vitest-dev/vitest/security/advisories/GHSA-qxg6-89mg-rqv8),
[Vitest 경로 권고](https://github.com/vitest-dev/vitest/security/advisories/GHSA-xp26-3454-mjgp),
[sharp 권고](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w).
Vue 프로젝트 권고의 패치 표기가 오래된 경우 [갱신된 Reviewed Advisory](https://github.com/advisories/GHSA-g2v6-rqmx-r4w6)와 배포된 버전을 함께 확인한다.

Vue 3·Vite 6·Vitest 4를 유지하고 plugin-vue 5.2.4의 peer 범위와 Node 24 호환성을 확인했다.
사용하지 않는 Vue Test Utils와 js-beautify·glob·minimatch 등의 경로를 제거했고,
PostCSS 8.5.32·nanoid 3.3.20·source-map-js 1.2.2 등도 수정 버전으로 잠갔다.
강제 audit fix, peer 검사 생략, 근거 없는 전이 패키지 override는 사용하지 않았다.

## 현재 이용 경로와 검증

- 웹은 CSR이며 SSR 경로를 제공하지 않는다. Vue의 SSR 패키지가 그래프에 포함되는 사실과 현재 사용 경로를 구분하고, 수정 버전 자체도 적용했다.
- Vite·Vitest는 개발·테스트 도구다. 공개 개발 서버나 Vitest UI/API를 운영하지 않으며 현재 개발 실행은 loopback 주소를 사용한다.
- sharp는 저장소 이미지 최적화 도구이며 사용자 업로드 처리 API가 아니다. PNG와 EXIF 방향이 있는 JPEG를 실제 스크립트로 WebP 변환하는 검증을 추가했다. 임시 폴더를 사용해 저장소 자산을 수정하지 않는다.
- Node 24에서 깨끗한 `npm ci`, 기존 테스트 20개, 이미지 도구, 프로덕션 빌드를 통과했다. 로컬 DB·API·웹 프록시와 홈·목록·검색·상세 화면도 확인했으며 브라우저 콘솔 오류는 없었다.
- 기존 npm 11.5.2의 peer 해석에서 `edgesOut` 오류가 재현돼 전역 설정을 바꾸지 않고 격리된 npm 12.2.1로 lockfile을 생성했다. 이후 같은 lockfile의 `npm ci`·전체 검증은 npm 11.5.2에서도 통과했다. [npm 이슈](https://github.com/npm/cli/issues/9787)

```bash
npm run check
npm audit --omit=dev
```

CI와 로컬 검사에는 보통 이상 보안 권고를 실패 처리하는 `audit:deps`와 native 이미지 도구 검증을 포함한다.
새 권고가 발표되면 다시 평가한다. React 전환 시에도 전환 전후 그래프를 별도로 검사한다.
audit 항목 감소나 테스트 개수로 앱 성능 향상을 주장하지 않는다.
