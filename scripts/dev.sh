#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec npm run dev -- --host 127.0.0.1 --port "${PUBBURI_FRONTEND_PORT:-5173}" --strictPort
