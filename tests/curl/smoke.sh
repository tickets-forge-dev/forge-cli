#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Curl smoke tests — core API health checks.
#
# Quick sanity tests that the Forge API is reachable and auth works.
# Run this before the feature-specific tests.
#
# Usage:
#   ./tests/curl/smoke.sh
#   FORGE_API_URL=http://localhost:3000/api ./tests/curl/smoke.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo -e "  ${GREEN}✓${RESET} $1"; }
fail() { FAIL=$((FAIL + 1)); echo -e "  ${RED}✗${RESET} $1"; echo -e "    ${DIM}$2${RESET}"; }

for cmd in curl jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo -e "${RED}Error: '$cmd' is required but not installed.${RESET}" >&2
    exit 1
  fi
done

# ── Config ──────────────────────────────────────────────────────────────────

CONFIG_FILE="${HOME}/.forge/config.json"

if [[ -f "$CONFIG_FILE" ]]; then
  _cfg_token=$(jq -r '.accessToken // empty' "$CONFIG_FILE" 2>/dev/null || true)
  _cfg_team=$(jq -r '.teamId // empty' "$CONFIG_FILE" 2>/dev/null || true)
fi

API_URL="${FORGE_API_URL:-https://www.forge-ai.dev/api}"
TOKEN="${FORGE_ACCESS_TOKEN:-${_cfg_token:-}}"
TEAM_ID="${FORGE_TEAM_ID:-${_cfg_team:-}}"

if [[ -z "$TOKEN" ]]; then
  echo -e "${RED}Error: No access token. Run 'forge login' or set FORGE_ACCESS_TOKEN.${RESET}" >&2
  exit 1
fi

echo -e "${BOLD}Forge API — Smoke Tests${RESET}"
echo -e "${DIM}API: ${API_URL}${RESET}"

BODY_FILE=$(mktemp)
trap 'rm -f "$BODY_FILE"' EXIT

api() {
  local method="$1" path="$2"
  shift 2
  local headers=(-H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json")
  [[ -n "${TEAM_ID}" ]] && headers+=(-H "x-team-id: ${TEAM_ID}")

  curl -s -o "$BODY_FILE" -w '%{http_code}' \
    -X "$method" "${API_URL}${path}" \
    "${headers[@]}" "$@"
}

# ═════════════════════════════════════════════════════════════════════════════

echo -e "\n${BOLD}Connectivity${RESET}"

# API reachable
STATUS=$(api GET "/tickets" 2>/dev/null) || STATUS="000"
if [[ "$STATUS" != "000" ]]; then
  pass "API is reachable (HTTP ${STATUS})"
else
  fail "API unreachable" "Cannot connect to ${API_URL}"
  echo -e "\n${RED}${BOLD}FAIL${RESET} — cannot reach API, aborting."
  exit 1
fi

# Authenticated list
if [[ "$STATUS" == "200" ]]; then
  pass "GET /tickets — 200 OK (authenticated)"
  COUNT=$(jq 'length' "$BODY_FILE" 2>/dev/null || echo "?")
  echo -e "    ${DIM}${COUNT} tickets returned${RESET}"
else
  fail "GET /tickets — expected 200, got ${STATUS}" "$(cat "$BODY_FILE" | head -c 200)"
fi

echo -e "\n${BOLD}Auth rejection${RESET}"

# 401 with bad token
OLD_TOKEN="$TOKEN"
TOKEN="bad-token-000"
STATUS=$(api GET "/tickets")
TOKEN="$OLD_TOKEN"
if [[ "$STATUS" == "401" ]]; then
  pass "401 — bad token rejected"
else
  fail "Expected 401 for bad token, got ${STATUS}" "$(cat "$BODY_FILE" | head -c 200)"
fi

# 404 for non-existent ticket
STATUS=$(api GET "/tickets/nonexistent_00000000-0000-0000-0000-000000000000")
if [[ "$STATUS" == "404" ]]; then
  pass "404 — non-existent ticket"
else
  fail "Expected 404, got ${STATUS}" "$(cat "$BODY_FILE" | head -c 200)"
fi

# ── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}──────────────────────────────────${RESET}"
TOTAL=$((PASS + FAIL))
echo -e "${GREEN}${PASS} passed${RESET}  ${RED}${FAIL} failed${RESET}  ${DIM}(${TOTAL} total)${RESET}"

if [[ $FAIL -gt 0 ]]; then
  echo -e "${RED}${BOLD}FAIL${RESET}"
  exit 1
else
  echo -e "${GREEN}${BOLD}PASS${RESET}"
  exit 0
fi
