<div align="center">
  <img src="docs/brand/pubburi.webp" alt="주점부리" width="96" />
  <h1>주점부리 · Frontend</h1>
  <p><strong>취향에 맞는 한 잔을 발견하고 기록하는 주류 큐레이션</strong></p>
  <p>상품 탐색·후기·데모 주문과 관리자 웹</p>
  <a href="https://github.com/Pubburi/Frontend/actions/workflows/ci.yml"><img src="https://github.com/Pubburi/Frontend/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <img src="https://img.shields.io/badge/Vue-3-4FC08D" alt="Vue 3" /> <img src="https://img.shields.io/badge/Vite-6-646CFF" alt="Vite 6" /> <img src="https://img.shields.io/badge/Node.js-24-5FA04E" alt="Node.js 24" />
</div>

<br />

## 📄 목차

- [프로젝트 개요](#overview)
- [현재 기능과 범위](#features)
- [기술 스택](#technology)
- [시스템 구조](#architecture)
- [로컬 실행](#development)
- [검증과 협업](#verification)
- [개발 계획](#roadmap)
- [관련 프로젝트와 개발자](#links)

<br />

<a id="overview"></a>

## ✍ 프로젝트 개요

상품을 탐색하고 후기를 확인하며 데모 주문을 생성하는 주점부리 웹입니다. 현재 Vue 3·Vite·Pinia·Vue Router를 사용합니다.

<a id="features"></a>

## 🥃 현재 기능과 범위

| 영역 | 현재 제공 기능 |
|---|---|
| 홈 | 배너, 주종 카테고리, 인기 상품, 매장 목록 |
| 탐색·상세 | 상품 검색·필터·정렬·페이지 이동, 가격·도수·후기 조회 |
| 회원·후기 | 회원가입·로그인, 평점과 후기 작성·수정·삭제 |
| 장바구니·주문 | 기기 내 장바구니 저장, 수량 수정, 데모 주문 접수 |
| 마이·관리자 | 주문 내역·스탬프·등급과 관리자 관리 화면 |

<a id="technology"></a>

## ⚙️ 기술 스택

| 영역 | 현재 기술 |
|---|---|
| 화면 | Vue 3, 로컬 CSS primitive |
| 상태·라우팅 | Pinia, Vue Router |
| 빌드 | Vite 6, Node.js 24, npm lockfile |
| 테스트 | Vitest, jsdom |
| 이미지 | WebP, sharp 기반 최적화 스크립트 |
| CI | GitHub Actions · frontend-ci |

<a id="architecture"></a>

## 🏛️ 시스템 구조

~~~mermaid
flowchart LR
    Views["Vue 화면 · 공통 UI"] --> Stores["Pinia · Router"]
    Stores --> Client["API client · credentials include"]
    Client --> Proxy["Vite /api proxy · 개발 환경"]
    Proxy --> Backend["Backend :9987"]
~~~

<a id="development"></a>

## 🚀 로컬 실행

Node.js 24와 실행 중인 Backend가 필요합니다. 레포 루트에서 실행합니다.

세 서버와 DB를 함께 실행하는 방법은 [로컬 통합 실행](https://github.com/Pubburi/Backend/blob/main/docs/LOCAL-DEVELOPMENT.md)을 참고하세요.

~~~bash
cp .env.example .env
npm ci
./scripts/dev.sh
~~~

- 웹: http://localhost:5173
- VITE_API_BASE_URL이 비어 있으면 /api를 사용합니다. 개발 프록시는 VITE_API_PROXY_TARGET(기본 http://127.0.0.1:9987)로 전달합니다.
- 개발 포트는 PUBBURI_FRONTEND_PORT(기본 5173)이며, 사용 중이면 다른 포트로 바꾸지 않고 종료합니다.
- 세션 인증을 위해 API client의 credentials: include를 유지합니다.
- 환경변수에 비밀키를 넣지 않습니다. VITE_ 값은 브라우저에 포함됩니다.

~~~bash
npm run optimize:images
~~~

이미지 도구는 이 레포의 public/images를 처리합니다. 대응 WebP가 있는 PNG/JPG를 다시 추가하지 않습니다.

<a id="verification"></a>

## ✅ 검증과 협업

~~~bash
npm run check
~~~

저장소 검사, lockfile 기반 설치, 의존성 보안 검사, 이미지 변환 확인, 기존 Vue 테스트와 프로덕션 빌드를 실행합니다. CI도 같은 검증을 수행합니다.

main은 PR·frontend-ci 성공·최신 main 반영·대화 해결을 요구합니다. 필수 승인은 0명이고 관리자에게도 적용합니다. Squash merge 뒤 작업 브랜치를 정리합니다.

자동화 PR은 최신 커밋의 Codex 리뷰와 관련 검증까지 통과해야 병합합니다. [개발·운영 기준](https://github.com/Pubburi/Backend/blob/main/docs/DELIVERY-PLAN.md)을 함께 적용합니다.

<a id="roadmap"></a>

## 🗺️ 개발 계획

- [x] [의존성 보안 경고 검토·수정 및 CI 검사](docs/DEPENDENCIES.md)
- [ ] Vite·React·TypeScript·React Router·TanStack Query·Zustand로 전환
- [ ] 기존 화면·라우팅·Pinia 상태·API 호출을 React 구조로 이전
- [ ] 기존 API 계약·세션 로그인·정적 자산·고객/관리자 기능 유지
- [ ] Vue 전용 테스트를 React에 맞게 전환하고 CI·문서 갱신
- [ ] 주요 고객·관리자 흐름의 기능 동등성 확인
- [ ] 취향 입력·맞춤 추천·추천 이유·피드백·검색 필터·찜 화면 구현

기한은 **2027년 2월 5일**이며 P1·P2 모두 필수 목표입니다. [전체 기능·일정](https://github.com/Pubburi/Backend/blob/main/docs/DELIVERY-PLAN.md)에 따라 진행하고, 실제 완성 화면을 검증한 뒤 이미지를 추가합니다.

<a id="links"></a>

## 🔗 관련 프로젝트와 개발자

| 레포 | 담당 |
|---|---|
| [Backend](https://github.com/Pubburi/Backend) | 회원·상품·후기·데모 주문 및 공통 API |
| [Frontend](https://github.com/Pubburi/Frontend) | 현재 Vue 웹·관리자 화면, 향후 React 전환 |
| [Recommendation](https://github.com/Pubburi/Recommendation) | 추천 서비스 기반, 향후 데이터·알고리즘·평가 |

[기획·해야 할 일](https://www.notion.so/3ff86a7a8f8a80d298adfd1b0e0c6ae6) · [협업 규칙](CONTRIBUTING.md)

| 개발자 | 이 레포의 담당 |
|---|---|
| [오인성](https://github.com/ois0886) | 웹 UI·상태·API 연동·React 전환 |

[소스 출처](docs/PROVENANCE.md)
프로젝트에는 별도 담당자의 모바일 앱도 포함되며, 이 레포는 공통 API 연동 범위를 다룹니다.
