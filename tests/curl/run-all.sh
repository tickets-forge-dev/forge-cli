#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Run all curl test suites in order.
#
# Usage:
#   ./tests/curl/run-all.sh
#   FORGE_API_URL=http://localhost:3000/api ./tests/curl/run-all.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BOLD='\033[1m'
RED='\033[0;31m'
GREEN='\033[0;32m'
RESET='\033[0m'

SUITES=(
  "smoke.sh"
  "develop.sh"
)

FAILED=0

for suite in "${SUITES[@]}"; do
  echo -e "\n${BOLD}═══ ${suite} ═══${RESET}\n"
  if bash "${SCRIPT_DIR}/${suite}"; then
    :
  else
    ((FAILED++))
  fi
done

echo ""
echo -e "${BOLD}════════════════════════════════════${RESET}"
if [[ $FAILED -gt 0 ]]; then
  echo -e "${RED}${BOLD}${FAILED} suite(s) failed${RESET}"
  exit 1
else
  echo -e "${GREEN}${BOLD}All suites passed${RESET}"
  exit 0
fi
