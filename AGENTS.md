# Frontend working guide

## Product and code

- Use Vite·React·TypeScript·React Router·TanStack Query·Zustand. Customer/admin routes are React; do not add a Vue bridge.
- Keep API calls in `src/services/api.js`, `/api`/ApiResponse contracts and `credentials: include`. Backend owns business/API/DB rules; Recommendation owns models/data. Do not duplicate their implementation docs.
- Keep session/server data in Query with current account/route ownership. Preserve auth/HTTP lifetimes, latest requests, draft/quantity ownership, lazy admin loading, raw `pubburi-cart` storage, keyboard access and the existing CSS/WebP assets.
- Preserve the current palette and clear primary actions. Reduce unnecessary navigation/repeated input and retain input through recoverable errors. Use generative images for needed theme-matched decorative assets/icons, while keeping interactive controls accessible. Follow the concise UX references in [ROADMAP](docs/ROADMAP.md).
- Current scope/status and deadlines live in [ROADMAP](docs/ROADMAP.md): all 20 MVP features by 2026-12-31 KST; extra improvements from 2027-01-01 after MVP; final 2027-02-05; no implementation/commits/merges from 2027-02-06. Mandatory permission/error/data/keyboard acceptance is part of each MVP feature.
- Prioritize remaining mandatory work and acceptance defects. AWS·mobile implementation·real payment/shipping·chatbots require separate scope/authorization. Do not invent product results, contribution or performance.

## Work and review

- Follow [CONTRIBUTING](CONTRIBUTING.md), [TESTING](docs/TESTING.md) and the coordinator's file/Git ownership. Use one writer per repo; never overwrite user work or take an active lease. Shared runtime and Notion belong to the coordinator. Common ownership rules are in [Backend AGENTS](https://github.com/Pubburi/Backend/blob/main/AGENTS.md).
- Keep `node_modules`/`dist`/credentials/`.env` and `.pubburi` out of Git. Preserve private context; never print secrets or private planning URLs.
- `npm run check` is required. Keep required `frontend-ci`, completed latest-head Codex review, no unresolved findings, Korean Conventional squash, main CI and only fully merged branch cleanup. Pending/failed/quota-limited review is not approval. Review correctness/ownership/API issues in Korean; do not weaken protection.
- Work in this same scheduled chat (four hours, gpt-6.1-sol/ultra); do not create duplicate chats/schedules. Coordinator manages shared integration and merge gates.

## Documentation

- Maintain existing current docs only when behavior, contracts, commands or status change. Do not create dated run logs, repeated plans/measurements/audit docs or append a new Notion entry for routine execution. Put change-specific rationale/results in the PR; Git preserves removed history. One ignored handoff is enough when needed.
- Do not add/edit comments, body, assignees or labels on closed/merged PRs. Keep necessary follow-up work in GitHub Projects/Discussions and Notion to-do/done items; do not create unused records.
- Review current README cases and new evidence each run; update only for stronger independent evidence and do not write unchanged per-run reports. Keep four real cases/source evidence and exclude tests/CI totals. Historical proof may link to its PR or immutable Git commit.
- Keep source provenance. Do not restore unrelated-project/developer sections, responsibility tables, planning-link collections or mobile narration in README. Use verified real screens only.

## README 대표 사례 검토

대표 사례는 주기적으로 검토하며 **문제 → 원인 → 해결 → 결과 → 대체안/회고 → 코드** 순서를 유지한다. 실제 오류 개선·최적화의 원인/대안·전후 실측과 한계, 현재 핵심 코드로 설명할 수 있는 소재를 우선한다. 기존 사례보다 채용 관점에서 더 설득력 있는 근거를 확보했을 때만 해당 사례를 교체하고 나머지 내용/순서는 보존한다. 최신 작업·코드량·테스트/CI 수만으로 교체하거나 없는 성능/기여를 만들지 않는다. 코드는 문제 해결을 결정한 실제 분기·데이터 경계만 짧게 기본으로 펼치고, 전체 함수·파일 대신 현재 전체 소스 링크를 붙인다. 비교는 계속하되 변경 없는 매회 유지 보고서는 만들지 않는다.
