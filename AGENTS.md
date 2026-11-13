# Frontend working guide

## Product and code

- Use Vite·React·TypeScript·React Router·TanStack Query·Zustand. Customer/admin routes are React; do not add a Vue bridge.
- Keep API calls in `src/services/api.js`, `/api`/ApiResponse contracts and `credentials: include`. Backend owns business/API/DB rules; Recommendation owns models/data. Do not duplicate their implementation docs.
- Keep session/server data in Query with current account/route ownership. Preserve auth/HTTP lifetimes, latest requests, draft/quantity ownership, lazy admin loading, raw `pubburi-cart` storage, keyboard access and the existing CSS/WebP assets.
- Preserve the current palette and clear primary actions. Reduce unnecessary navigation/repeated input and retain input through recoverable errors. Use generative images for needed theme-matched decorative assets/icons, while keeping interactive controls accessible. Follow the concise UX references in [ROADMAP](docs/ROADMAP.md).
- Current scope/status and deadlines live in [ROADMAP](docs/ROADMAP.md): all 20 MVP features by 2026-12-31 KST and final delivery by 2027-02-05. Mandatory permission/error/data/keyboard acceptance is part of each MVP feature. Stop implementation, commits and merges on 2027-02-06.
- Prioritize remaining mandatory work and acceptance defects. AWS·mobile implementation·real payment/shipping·chatbots require separate scope/authorization. Do not invent product results, contribution or performance.
- Start the additional optimization as soon as the current Notion to-do list is complete. Pick one Frontend UX issue, measure the same mobile and desktop flows before and after, and change the design if needed. Verify the improvement and merge its PR before the final deadline.

## Work and review

- Follow [CONTRIBUTING](CONTRIBUTING.md), [TESTING](docs/TESTING.md) and the coordinator's file/Git ownership. Use one writer per repo; never overwrite user work or take an active lease. Shared runtime and Notion belong to the coordinator. Common ownership rules are in [Backend AGENTS](https://github.com/Pubburi/Backend/blob/main/AGENTS.md).
- Keep `node_modules`/`dist`/credentials/`.env` and `.pubburi` out of Git. Preserve private context; never print secrets or private planning URLs.
- `npm run check` is required. Keep required `frontend-ci`, completed latest-head Codex review, no unresolved findings, Korean Conventional squash, main CI and only fully merged branch cleanup. Pending/failed/quota-limited review is not approval. Review correctness/ownership/API issues in Korean; do not weaken protection.
- Work in this same scheduled chat every six hours (gpt-6.1-sol/ultra). Use the existing checkout and a short branch name for the task. New worktrees and the `codex/` prefix for new branches are prohibited. Coordinator manages shared integration and merge gates.

## Documentation

- Maintain existing current docs only when behavior, contracts, commands or status change. Do not create dated run logs, repeated plans/measurements/audit docs or append a new Notion entry for routine execution. Put change-specific rationale/results in the PR; Git preserves removed history. One ignored handoff is enough when needed.
- Do not add/edit comments, body, assignees or labels on closed/merged PRs. Keep necessary follow-up work in GitHub Projects/Discussions and Notion to-do/done items; do not create unused records.
- Keep one representative README case with verifiable evidence. Replace it when a better example is supported by a concrete reproduction, implementation and result. Keep evidence in its PR or an immutable Git commit.
- Keep source provenance. Do not restore unrelated-project/developer sections, responsibility tables, planning-link collections or mobile narration in README. Use verified real screens only.

## README 대표 사례 검토

**문제 → 원인 → 해결 → 결과 → 대체안/회고 → 코드** 순서를 지킨다. 사용자에게 발생한 문제, 재현 조건, 선택한 해결책, 확인한 결과와 한계를 설명한다. 성능은 동일 조건에서 전후를 측정한 경우에만 수치로 쓴다. 사례에는 하이퍼링크를 넣지 않고, 현재 소스에서 해결의 핵심이 드러나는 짧은 코드를 펼쳐 보여 준다. 근거 링크는 [사례 근거](docs/case-study-register.md)에 둔다.
