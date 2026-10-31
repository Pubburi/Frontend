# FE03 삭제 처리 중 확인창 키보드 포커스 유지

## 문제·수정 전 근거

기준 main은 `198f0f49c4ff2fd17a4e9cc71f47528fb586e801`이다. React 이전을 다시 수행하지 않고 기존 관리자 삭제 확인창의 비동기/키보드 경계를 검증했다.

삭제 요청 중 취소/삭제 버튼이 모두 disabled가 되면 Tab 대상이 사라진다. 기존 코드는 section 내부 keydown과 첫/마지막 활성 버튼만 검사했으므로, disabled 전환 뒤 포커스가 배경으로 이동하면 더 이상 확인창이 키 입력을 받지 못했다. 화면에는 aria-modal 확인창이 남아 있는데 키보드 사용자는 배경으로 빠지는 상태였다.

Node 24·Vite production bundle·Playwright Chromium·직접 작성한 ApiResponse fixture를 사용했다. DELETE 응답을 Promise gate로 보류하고 실제 키보드로 확인창 진입 → Shift+Tab/Enter로 삭제 → pending에서 Tab 순서를 실행했다. 시간 지연값이나 실제 외부 사용자는 쓰지 않았다.

| 조건 | 수정 전 포커스 이탈 | 수정 후 같은 조건 |
|---|---|---|
| 일반 웹 1280×900 | 1/1 | 0/1 |
| 좁은 웹 390×844 | 1/1 | 0/1 |

수정 전 두 흐름 모두 `dialog.contains(document.activeElement)`가 false가 되는 것을 먼저 확인했다. 좁은 화면은 반응형 웹 검증이며 별도 모바일 앱 구현/테스트가 아니다. 표는 정한 회귀 흐름의 정확성 결과이며 전체 접근성 점수·실사용 오류율·성능 개선율을 뜻하지 않는다.

## 선택·구현

- 확인창이 열려 있는 동안 document capture 단계에서 Tab/Escape를 처리한다. 이미 포커스가 section 밖으로 이동한 경우에도 현재 확인창으로 되돌릴 수 있게 한다. 브라우저 탭 전환 등 modifier 단축키는 가로채지 않는다.
- 활성 버튼이 0개면 tabindex=-1인 확인창 자체에 포커스를 둔다. 처리 중에도 focus 가능한 안전한 대상을 유지하고, 응답 후 버튼이 다시 활성화되면 첫/마지막 버튼 순환을 복원한다.
- 비동기 상태/취소 callback의 최신 값을 ref로 읽고, 매 렌더마다 listener를 재등록하거나 이전 trigger로 포커스를 되돌리지 않는다. unmount 때 capture listener를 제거하고 연결돼 있는 원래 trigger로 복귀한다.
- 삭제 진행 중 Escape/닫기를 막는 기존 정책과 쓰기 singleflight를 보존한다. 서버 요청을 취소했다거나 결과 미확인 상태를 취소 완료로 표시하지 않는다. 실패 응답 후에는 취소 버튼/순환/Escape가 다시 동작한다.
- API·DB·권한·장바구니·검색·CSS·정적 자산은 변경하지 않는다.

기존 first/last 버튼 경계 조건 하나만 추가하면 포커스가 disabled 전환으로 이미 section 밖에 있는 경우에는 동작하지 않는다. 네이티브 dialog나 접근성 라이브러리로 전체 모달을 교체하는 대안도 있으나, 이번에는 현재 레이아웃과 비동기 삭제 정책을 유지하는 작은 수정으로 처리한다. 중첩 모달·다른 focusable 컨트롤·전체 스크린리더/브라우저 조합은 별도 검증 대상이다.

## 검증 범위

같은 두 viewport에서 pending의 Tab/Shift+Tab 유지·Escape 시 확인창 유지 → 503 실패 → 버튼 활성 복원 → 정/역방향 순환 → Escape 닫기 → 원래 삭제 버튼 복귀까지 확인한다. 요청을 보류한 동안 재전송이 없고 실패 뒤 상품이 남는지 검사한다. 직접 작성한 fixture 검증이며 실제 Backend/MySQL 삭제 통합과 구분한다.

```bash
VITE_API_BASE_URL=/api npm run build
npm run test:browser -- --grep '삭제 처리 중에도'
npm run check
```

수정 후 해당 두 흐름은 통과했다. 최종 `npm run check`에서 locked 설치·audit 0·이미지 도구·strict TypeScript·단위 25개·프로덕션 빌드·Chromium 20개가 통과했다. 새 두 조건 외 기존 저장/검색/race/고객·관리자 CRUD 흐름도 보존했다. PR·latest Codex 리뷰·CI·main 반영 상태는 실제 실행 결과와 조정자의 인계를 따른다. 보류 응답을 실제 서비스 응답 시간으로 사용하지 않고, 테스트 수/CI 시간을 성능 성과로 표시하지 않는다.

## README 사례 비교

현재 네 사례 중 API 오류 계약은 공통 전송 경계를 설명하는 기존 코드 정리다. 이번 확인창 사례는 실제 파괴적 작업의 비동기 상태 전환·DOM focus 소유·listener 수명·오류 복구를 재현하고 구현과 대안을 확인했으므로 Frontend 채용 관점에서 더 구체적인 문제 해결 근거가 있다고 판단했다. 세 번째 사례만 교체하고 API client와 기존 테스트 자체는 보존한다. 나머지 세 사례와 총 네 개를 유지한다.

근거: [W3C APG Modal Dialog의 키보드/복귀 지침](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). 해당 지침을 참고한 범위 검증이며 전체 WCAG 적합성 인증을 주장하지 않는다.
