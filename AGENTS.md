# Frontend working guide

- Current stack is Vue 3, Vite, Pinia and Vue Router. React migration is future work.
- Keep API calls in src/services/api.js with credentials: include and existing /api contracts.
- Preserve customer/admin state separation, lazy admin loading and product route query state.
- Keep local style.css primitives, ink/forest/gold/cream palette and WebP images.
- Root validation: npm run check. Image tooling: npm run optimize:images.
- Do not commit node_modules/, dist/, credentials or .env. Update docs with changes.
- Use PRs and Conventional Commits. Mobile implementation is separately owned.
