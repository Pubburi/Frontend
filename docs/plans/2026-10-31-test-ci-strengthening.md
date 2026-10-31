# 프론트 테스트·CI 보강

- 기존 CI는 locked 설치·audit·이미지 도구·Vitest·build를 실행했으나 실제 브라우저에서 빌드 산출물을 검증하지 않았다.
- 고정 Playwright/Chromium으로 production preview를 실행해 탐색/장바구니·세션/권한 가드·실패 복구·404 흐름을 확인한다.
- API는 명시적 fixture로 모킹한다. 실제 Backend 통합·모델·React 전환 완료로 표시하지 않는다.
- JUnit/HTML/실패 trace를 CI artifact로 보관하고 생성물은 ignore·저장소 검사로 보호한다.
- 실행 명령·실제 결과와 PR/CI 근거는 완료 후 인계한다. 이번 보강을 앱 성능 개선이나 새 README 사례로 집계하지 않는다.
- 로컬 Node 24의 locked 설치·audit 0개·이미지 변환·기존 Vitest 20개·프로덕션 빌드를 확인했다. 브라우저 최초 실행의 주종 label 선택자 timeout은 role 기반 combobox 선택자로 수정했으며 앱 코드는 변경하지 않았다.
- 최종 `npm run check` 전체가 성공했다. 기존 단위 20개·브라우저 5개 흐름과 audit·이미지·빌드를 모두 통과했고 JUnit/HTML을 생성했다. PR/main CI 근거는 조정자 인계 후 연결한다.
