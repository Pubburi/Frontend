# Frontend working guide

## Product and code

- Use Vite·React·TypeScript·React Router·TanStack Query·Zustand. Customer/admin routes are React; do not add a Vue bridge.
- Keep API calls in `src/services/api.js`, `/api`/ApiResponse contracts and `credentials: include`. Backend owns business/API/DB rules; Recommendation owns models/data. Do not duplicate their implementation docs.
- Keep session/server data in Query with current account/route ownership. Preserve auth/HTTP lifetimes, latest requests, draft/quantity ownership, lazy admin loading, raw `pubburi-cart` storage, keyboard access and the existing CSS/WebP assets.
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
- Keep README's four real cases and source evidence. Replace only for a stronger independent problem; do not force a per-run comparison/update or copy tests/CI totals into README. Historical proof may link to its PR or immutable Git commit.
- Keep source provenance. Do not restore unrelated-project/developer sections, responsibility tables, planning-link collections or mobile narration in README. Use verified real screens only.
