# 브라우저 API fixture 격리와 로그아웃 전환 완료

## 관측과 범위

기준 main `e709d53`의 관리자 포커스 수정은 이미 병합·main 검사/브랜치 정리까지 완료했다. 해당 전체 검사는 통과했지만 기존 최근 본 상품 test 부근에서 `/api/auth/me`가 preview 개발 프록시로 전달된 연결 거절 경고가 있었다. testcase 통과를 API 격리 성공으로 표시할 수 없어 별도 검사 결함으로 다룬다. 프로덕션 `src`·API·배포 파일은 바꾸지 않는다. 현재 완료 8/20과 전체 MVP/FE03·DB 기한을 유지한다.

원 전체 로그·동결 main/production 빌드·기존 test·최초 guard/trace를 보존했다. 공유 개발 서버 대신 자체 loopback guard를 연결한 기존 단일 test에서도 브라우저는 통과했지만 인증 GET 1건이 fixture 밖으로 빠졌다. body의 logout click 직후 다음 로그인 주소로 이동하는 동안이었고 AfterHooks/route teardown 뒤가 아니었다.

추가 읽기용 CDP/context 관측의 같은 입력별 1회 비교는 page route 원형에서 누락 1, context route만 바꾼 조건에서 0, logout 200·Home·이름 제거까지 기다린 page route 조건에서 0이었다. 누락 요청의 Referer는 이전 `/recent`였고 새 document 이동 직후 서버 guard에 도착했다. 새 로그인 document의 인증 조회는 별도로 정상 route됐다. 관측 밖의 Chromium 내부 continue/이전 frame 경로까지 원인을 단정하거나 context route 하나가 모든 이탈 요청을 보장한다고 주장하지 않는다.

원 test는 click 완료를 인증 쓰기/React 전환 완료와 같게 취급하고 곧바로 `page.goto`했다. 순차 성공 흐름은 실제 logout 200와 Home/계정 UI 반영까지 기다리도록 고친다. 503·보류 등 의도한 불확실 인증 검사에는 이 성공 대기를 적용하지 않는다. 프로덕션 logout 동작을 test의 순서 문제로 재작성하지 않는다.

## 검사 runner의 경계

- Node runner가 Vite preview 자식과 Playwright 자식을 직접 시작한다. 기본은 자체 127.0.0.1 동적 포트다. 명시 포트는 strict bind하고 개발 서비스 포트를 거부한다. 기존 서버를 재사용하거나 다른 프로세스를 종료하지 않는다.
- preview는 `configFile:false`와 빈 proxy로 시작해 개발 Backend 설정을 상속하지 않는다. 임시 owner marker/실제 loopback origin을 runner와 Playwright 시작 단계에서 확인한다.
- `/api` 누락은 503과 일반 오류 envelope로 거절한다. 기록은 method/path뿐이며 query·header/body·자격은 수집하지 않는다. 누락을 무조건 expected로 바꾸거나 Backend로 전달하지 않는다.
- Playwright가 code 0이어도 누락 수가 있으면 runner는 code 1이다. 자식 실패·중단·서버 정리 실패도 실패로 전파한다. 부모는 자식 종료와 소유 서버 close/최종 counter를 확인하고 report를 남긴다.
- IPC 소유자가 사라지면 preview도 같은 close 절차를 수행한다. 시작 중인 서버도 기다려 닫고, 끊어진 채널에 완료 메시지를 보내거나 다시 disconnect하지 않는다.
- 정상 browser 목록/현재 privacy·카트·R06 sameURL/native popup·F11 snapshot 회귀와 required CI job/protection은 유지한다. source/배포 해시가 기준과 같은지 별도로 확인한다.

단순히 경고를 필터링하거나 fixture의 허용 오류 목록을 늘리는 방법은 test 본문 중 실제 누락을 숨겨 사용하지 않는다. logout 대기만으로 다른 누락을 막는다고 주장하지 않으며, HTTP guard와 runner exit 검사도 함께 둔다. 서비스 시간/제품 오류율 개선은 측정하지 않는다.

## 고정 전후와 실제 negative 계약

새 guard에 수정 전 기존 단일 test를 연결했을 때 실제 browser 1개는 pass/child code 0이지만 누락 GET 1건으로 runner code 1이었다. 같은 test에 명시 전환 완료 대기를 적용한 뒤 browser pass/runner code 0·누락 0을 확인했다. 원 source·trace·두 runner report를 덮어쓰지 않았다.

별도 negative는 실제 Chromium의 image document에서 query/header/body에 가짜 구분값을 넣어 의도 API를 한 번 호출한다. browser는 guard 503을 기대해 통과한다. 그럼에도 runner는 code 1이어야 하고, 기록은 정확한 POST/path 1건이어야 하며 가짜 query/자격/body 구분값이 로그/runner report에 없어야 한다. preview owner 확인·서버 close도 검증한다. 이 계약은 full check와 required CI에서 재실행한다. negative 검사의 상위 성공을 일반 브라우저 검사 성공이나 Backend 실제 검증으로 바꾸지 않는다.

첫 후보의 전체 165개 단위/381개 browser 검사와 정상 close는 통과했지만, 추가 검토에서 IPC가 예기치 않게 끊긴 수명 경계는 빠져 있었다. 별도 자식의 marker 확인 후 부모 채널을 끊는 원형 probe에서 500ms 뒤에도 프로세스가 살아 있고 소유 HTTP 200을 반환했다. 해당 PID만 종료하고 첫 결과를 보존했다. 최초 observer의 close-event 대기 실패는 도구의 종료 관측 실패로 별도 남겼으며, exit-event 관측으로 교정한 결과와 혼합하지 않았다.

연결 해제에서도 close를 재사용한 뒤 같은 수명 조건은 프로세스 exit 0·소켓 연결 거절을 확인했다. 이 실제 IPC 회귀를 guard 검사에 추가해 required CI와 최종 full check에도 포함한다. 이는 browser testcase를 늘린 것이 아니며 제품 API/서비스 장애로 합산하지 않는다.

## 최종 검증

Node 24의 최종 `npm run check`가 exit 0으로 끝났다. strict TypeScript·locked 설치/audit·이미지 도구·28개 파일의 단위 165개와 정상 Chromium 381개를 통과했다. 정상 runner는 누락 API 0건·child/server exit 0·preview close를 확인했다. 별도 실제 negative 1조건과 IPC 수명 1조건도 각각 기대 결과를 확인했으며 정상 browser 수에 더하지 않았다.

제품 `src` 85개와 production 배포 파일 100개는 기준 main `e709d53` 동결본과 전 파일 해시가 같다. 의존성 lock·현재 테스트 목록과 required job/protection을 유지했고, 실제 업무 API·DB·공유 개발 포트에 접근하지 않는 자체 fixture 검증이다.

## 남은 경계와 README

관리자 허용 100자 이름의 가로폭은 [앞선 계획](2026-11-04-admin-keyboard-edit-focus.md)의 별도 필수 FE03/C04 결함으로 남긴다. 이 PR은 제품 UI/전체 FE03/C04·나머지 R/F의 완료 수를 늘리지 않는다.

README 전체와 실제 네 사례를 보존한다. test/CI 격리 소재를 독립 제품 장애·새 성능 사례로 만들지 않으며 더 강한 사례가 생긴 것으로 판단하지 않는다. 테스트 수/원 실패/negative 계약·현재 제약은 이 기록과 PR에만 남긴다.
