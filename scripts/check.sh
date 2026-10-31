#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/check_repository.py
npm ci
npm run audit:deps
npm run check:images
npm run test
VITE_API_BASE_URL=/api npm run build
npm run test:browser
