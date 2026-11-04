# 의존성 관리

현재 버전의 정본은 [package.json](../package.json)과 [package-lock.json](../package-lock.json), Node는 [.nvmrc](../.nvmrc)다. React·Router·Query·Zustand·TypeScript와 Vite6을 사용하며 Vue/Pinia 런타임은 없다.

- `npm ci`로 잠긴 그래프를 설치하고 `npm run audit:deps`로 보통 이상 권고를 실패 처리한다.
- 버전을 바꿀 때 peer 호환성과 [전체 검사](TESTING.md)를 확인한다. 강제 audit fix·peer 검사 생략·근거 없는 override로 통과시키지 않는다.
- Vite/Vitest는 개발/검사 도구이며 공개 API로 운영하지 않는다. sharp는 저장소 이미지 도구이며 사용자 업로드 API가 아니다.
- 실행별 audit 수·버전 조사와 이전 Vue 보안 수정은 [Git 이력](https://github.com/Pubburi/Frontend/blob/3cfefbae0a3002515c0ae63d29a8797c582e24d0/docs/DEPENDENCIES.md)에 남아 있다. 현재 그래프의 결과나 앱 성능으로 재사용하지 않는다.
