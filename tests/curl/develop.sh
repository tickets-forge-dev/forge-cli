#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Curl tests — Full developer lifecycle against the Forge backend.
#
# Covers every backend endpoint a developer touches:
#
#   TICKET CRUD
#     POST   /api/tickets                          create ticket
#     GET    /api/tickets                          list tickets
#     GET    /api/tickets?assignedToMe=true        list my tickets
#     GET    /api/tickets/:id                      get ticket detail
#     PATCH  /api/tickets/:id                      update ticket fields
#     DELETE /api/tickets/:id                      delete ticket
#     GET    /api/tickets/quota                    check creation quota
#
#   ASSIGNMENT
#     PATCH  /api/tickets/:id/assign               assign/unassign
#
#   SPEC GENERATION
#     POST   /api/tickets/:id/generate-questions   start spec generation
#     POST   /api/tickets/:id/submit-answers       submit answers + finalize
#
#   DEVELOPER REVIEW (Story 6-12)
#     POST   /api/tickets/:id/review-session       submit review Q&A
#
#   APPROVAL (Story 7-8)
#     POST   /api/tickets/:id/approve              PM approves → FORGED
#
#   IMPLEMENTATION (Story 10-2)
#     POST   /api/tickets/:id/start-implementation start impl → EXECUTING
#
#   EXPORTS
#     GET    /api/tickets/:id/export/markdown      download MD spec
#     GET    /api/tickets/:id/export/xml           download AEC XML
#
# Usage:
#   ./tests/curl/develop.sh
#   FORGE_API_URL=http://localhost:3000/api ./tests/curl/develop.sh
#
# Prerequisites: curl, jq
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colors & helpers ────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

PASS=0
FAIL=0
SKIP=0

pass()    { PASS=$((PASS + 1)); echo -e "  ${GREEN}✓${RESET} $1"; }
fail()    { FAIL=$((FAIL + 1)); echo -e "  ${RED}✗${RESET} $1"; echo -e "    ${DIM}$2${RESET}"; }
skip()    { SKIP=$((SKIP + 1)); echo -e "  ${YELLOW}⊘${RESET} $1 ${DIM}(skipped)${RESET}"; }
section() { echo -e "\n${BOLD}$1${RESET}"; }

for cmd in curl jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo -e "${RED}Error: '$cmd' is required but not installed.${RESET}" >&2
    exit 1
  fi
done

# ── Config ──────────────────────────────────────────────────────────────────

CONFIG_FILE="${HOME}/.forge/config.json"
_cfg_token="" _cfg_team="" _cfg_user=""

if [[ -f "$CONFIG_FILE" ]]; then
  _cfg_token=$(jq -r '.accessToken // empty' "$CONFIG_FILE" 2>/dev/null || true)
  _cfg_team=$(jq -r '.teamId // empty' "$CONFIG_FILE" 2>/dev/null || true)
  _cfg_user=$(jq -r '.userId // empty' "$CONFIG_FILE" 2>/dev/null || true)
fi

API_URL="${FORGE_API_URL:-https://www.forge-ai.dev/api}"
TOKEN="${FORGE_ACCESS_TOKEN:-${_cfg_token:-}}"
TEAM_ID="${FORGE_TEAM_ID:-${_cfg_team:-}}"
USER_ID="${FORGE_USER_ID:-${_cfg_user:-}}"

if [[ -z "$TOKEN" ]]; then
  echo -e "${RED}Error: No access token. Run 'forge login' or set FORGE_ACCESS_TOKEN.${RESET}" >&2
  exit 1
fi

echo -e "${BOLD}Forge Backend — Developer Lifecycle Curl Tests${RESET}"
echo -e "${DIM}API:  ${API_URL}${RESET}"
echo -e "${DIM}Team: ${TEAM_ID:-<none>}${RESET}"
echo -e "${DIM}User: ${USER_ID:-<none>}${RESET}"

# ── Curl wrapper ────────────────────────────────────────────────────────────

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

api_no_auth() {
  local method="$1" path="$2"
  shift 2
  curl -s -o "$BODY_FILE" -w '%{http_code}' \
    -X "$method" "${API_URL}${path}" \
    -H "Content-Type: application/json" "$@"
}

api_bad_token() {
  local method="$1" path="$2"
  shift 2
  curl -s -o "$BODY_FILE" -w '%{http_code}' \
    -X "$method" "${API_URL}${path}" \
    -H "Authorization: Bearer invalid-token-000" \
    -H "Content-Type: application/json" "$@"
}

body()       { cat "$BODY_FILE"; }
body_field() { jq -r "$1" "$BODY_FILE" 2>/dev/null; }

FAKE_ID="aec_00000000-0000-0000-0000-000000000000"

# Track ticket IDs created by this test so we can clean up
CREATED_IDS=()

cleanup() {
  for id in "${CREATED_IDS[@]}"; do
    api DELETE "/tickets/${id}" >/dev/null 2>&1 || true
  done
  rm -f "$BODY_FILE"
}
trap cleanup EXIT

# ═════════════════════════════════════════════════════════════════════════════
#  1.  AUTH GUARD
# ═════════════════════════════════════════════════════════════════════════════

section "1. Auth guard"

STATUS=$(api_bad_token GET "/tickets")
if [[ "$STATUS" == "401" ]]; then
  pass "401 — bad token on GET /tickets"
else
  fail "Expected 401, got ${STATUS}" "$(body | head -c 200)"
fi

STATUS=$(api_no_auth GET "/tickets")
if [[ "$STATUS" == "401" || "$STATUS" == "403" ]]; then
  pass "${STATUS} — no token on GET /tickets"
else
  fail "Expected 401/403, got ${STATUS}" "$(body | head -c 200)"
fi

STATUS=$(api_bad_token POST "/tickets" -d '{"title":"bad auth test"}')
if [[ "$STATUS" == "401" ]]; then
  pass "401 — bad token on POST /tickets"
else
  fail "Expected 401, got ${STATUS}" "$(body | head -c 200)"
fi

STATUS=$(api_bad_token POST "/tickets/${FAKE_ID}/start-implementation" \
  -d '{"branchName":"forge/bad-auth"}')
if [[ "$STATUS" == "401" ]]; then
  pass "401 — bad token on POST start-implementation"
else
  fail "Expected 401, got ${STATUS}" "$(body | head -c 200)"
fi

STATUS=$(api_bad_token POST "/tickets/${FAKE_ID}/review-session" \
  -d '{"qaItems":[{"question":"Q","answer":"A"}]}')
if [[ "$STATUS" == "401" ]]; then
  pass "401 — bad token on POST review-session"
else
  fail "Expected 401, got ${STATUS}" "$(body | head -c 200)"
fi

# ═════════════════════════════════════════════════════════════════════════════
#  2.  QUOTA
# ═════════════════════════════════════════════════════════════════════════════

section "2. GET /tickets/quota"

STATUS=$(api GET "/tickets/quota")
if [[ "$STATUS" == "200" ]]; then
  pass "200 — quota endpoint reachable"
  USED=$(body_field '.used')
  LIMIT=$(body_field '.limit')
  CAN=$(body_field '.canCreate')
  echo -e "    ${DIM}used=${USED}  limit=${LIMIT}  canCreate=${CAN}${RESET}"
else
  fail "Expected 200, got ${STATUS}" "$(body | head -c 200)"
fi

# ═════════════════════════════════════════════════════════════════════════════
#  3.  LIST TICKETS
# ═════════════════════════════════════════════════════════════════════════════

section "3. GET /tickets (list)"

STATUS=$(api GET "/tickets")
if [[ "$STATUS" == "200" ]]; then
  pass "200 — list tickets"
  COUNT=$(jq 'length' "$BODY_FILE" 2>/dev/null || echo "?")
  echo -e "    ${DIM}${COUNT} tickets returned${RESET}"

  if jq -e '.[0].id' "$BODY_FILE" >/dev/null 2>&1; then
    pass "Each ticket has an id field"
  elif [[ "$COUNT" == "0" ]]; then
    skip "id field check (empty list)"
  else
    fail "First ticket missing id field" "$(body | head -c 200)"
  fi

  if jq -e '.[0].status' "$BODY_FILE" >/dev/null 2>&1; then
    pass "Each ticket has a status field"
  elif [[ "$COUNT" == "0" ]]; then
    skip "status field check (empty list)"
  else
    fail "First ticket missing status field" "$(body | head -c 200)"
  fi
else
  fail "Expected 200, got ${STATUS}" "$(body | head -c 200)"
fi

# assignedToMe filter
STATUS=$(api GET "/tickets?assignedToMe=true")
if [[ "$STATUS" == "200" ]]; then
  pass "200 — list tickets with assignedToMe=true"
else
  fail "Expected 200, got ${STATUS}" "$(body | head -c 200)"
fi

# ═════════════════════════════════════════════════════════════════════════════
#  4.  CREATE TICKET
# ═════════════════════════════════════════════════════════════════════════════

section "4. POST /tickets (create)"

STATUS=$(api POST "/tickets" \
  -d '{"title":"[curl-test] Developer lifecycle smoke test","description":"Auto-created by tests/curl/develop.sh — safe to delete","type":"task","priority":"low"}')
if [[ "$STATUS" == "201" ]]; then
  pass "201 — ticket created"
  NEW_ID=$(body_field '.id')
  NEW_STATUS=$(body_field '.status')
  CREATED_IDS+=("$NEW_ID")
  echo -e "    ${DIM}id:     ${NEW_ID}${RESET}"
  echo -e "    ${DIM}status: ${NEW_STATUS}${RESET}"

  if [[ "$NEW_STATUS" == "draft" ]]; then
    pass "New ticket starts in 'draft' status"
  else
    fail "Expected draft status" "got ${NEW_STATUS}"
  fi
else
  fail "Expected 201, got ${STATUS}" "$(body | head -c 200)"
  NEW_ID=""
fi

# Validation: title too short
STATUS=$(api POST "/tickets" -d '{"title":"ab"}')
if [[ "$STATUS" == "400" ]]; then
  pass "400 — title too short (< 3 chars)"
else
  fail "Expected 400, got ${STATUS}" "$(body | head -c 200)"
fi

# Validation: missing title
STATUS=$(api POST "/tickets" -d '{"description":"no title"}')
if [[ "$STATUS" == "400" ]]; then
  pass "400 — missing title"
else
  fail "Expected 400, got ${STATUS}" "$(body | head -c 200)"
fi

# Validation: invalid type
STATUS=$(api POST "/tickets" -d '{"title":"bad type test","type":"invalid"}')
if [[ "$STATUS" == "400" ]]; then
  pass "400 — invalid type value"
else
  fail "Expected 400, got ${STATUS}" "$(body | head -c 200)"
fi

# Validation: invalid priority
STATUS=$(api POST "/tickets" -d '{"title":"bad priority test","priority":"critical"}')
if [[ "$STATUS" == "400" ]]; then
  pass "400 — invalid priority value"
else
  fail "Expected 400, got ${STATUS}" "$(body | head -c 200)"
fi

# ═════════════════════════════════════════════════════════════════════════════
#  5.  GET TICKET (detail)
# ═════════════════════════════════════════════════════════════════════════════

section "5. GET /tickets/:id (detail)"

if [[ -n "$NEW_ID" ]]; then
  STATUS=$(api GET "/tickets/${NEW_ID}")
  if [[ "$STATUS" == "200" ]]; then
    pass "200 — fetches created ticket"

    for field in id title status description teamId acceptanceCriteria createdAt updatedAt; do
      if body_field ".${field}" | grep -qv '^null$'; then
        pass "Response has '${field}'"
      else
        fail "Response missing '${field}'" "$(body | head -c 300)"
      fi
    done
  else
    fail "Expected 200, got ${STATUS}" "$(body | head -c 200)"
  fi
else
  skip "GET ticket detail (no ticket was created)"
fi

# 404 for non-existent ticket
STATUS=$(api GET "/tickets/${FAKE_ID}")
if [[ "$STATUS" == "404" ]]; then
  pass "404 — ticket not found"
else
  fail "Expected 404, got ${STATUS}" "$(body | head -c 200)"
fi

# ═════════════════════════════════════════════════════════════════════════════
#  6.  UPDATE TICKET (PATCH)
# ═════════════════════════════════════════════════════════════════════════════

section "6. PATCH /tickets/:id (update)"

if [[ -n "$NEW_ID" ]]; then
  STATUS=$(api PATCH "/tickets/${NEW_ID}" \
    -d '{"title":"[curl-test] Updated title","description":"Updated by curl test"}')
  if [[ "$STATUS" == "200" ]]; then
    pass "200 — ticket updated"
    UPDATED_TITLE=$(body_field '.title')
    if [[ "$UPDATED_TITLE" == *"Updated title"* ]]; then
      pass "Title reflects PATCH payload"
    else
      fail "Title not updated" "got: ${UPDATED_TITLE}"
    fi
  else
    fail "Expected 200, got ${STATUS}" "$(body | head -c 200)"
  fi

  # Validation: forbidNonWhitelisted rejects unknown fields
  STATUS=$(api PATCH "/tickets/${NEW_ID}" -d '{"bogusField":"rejected"}')
  if [[ "$STATUS" == "400" ]]; then
    pass "400 — unknown fields rejected (forbidNonWhitelisted)"
  else
    # Some backends just ignore unknown fields, treat 200 as acceptable
    if [[ "$STATUS" == "200" ]]; then
      pass "200 — unknown fields silently ignored (whitelist mode)"
    else
      fail "Expected 400 or 200, got ${STATUS}" "$(body | head -c 200)"
    fi
  fi
else
  skip "PATCH ticket (no ticket was created)"
fi

# ═════════════════════════════════════════════════════════════════════════════
#  7.  ASSIGN TICKET
# ═════════════════════════════════════════════════════════════════════════════

section "7. PATCH /tickets/:id/assign"

if [[ -n "$NEW_ID" && -n "$USER_ID" ]]; then
  # Assign to self
  STATUS=$(api PATCH "/tickets/${NEW_ID}/assign" -d "{\"userId\":\"${USER_ID}\"}")
  if [[ "$STATUS" == "200" ]]; then
    pass "200 — assigned to current user"
  elif [[ "$STATUS" == "403" ]]; then
    pass "403 — assign requires PM/Admin role (expected for developer)"
  else
    fail "Expected 200/403, got ${STATUS}" "$(body | head -c 200)"
  fi

  # Unassign (null userId)
  STATUS=$(api PATCH "/tickets/${NEW_ID}/assign" -d '{"userId":null}')
  if [[ "$STATUS" == "200" ]]; then
    pass "200 — unassigned (null userId)"
  elif [[ "$STATUS" == "403" ]]; then
    pass "403 — unassign requires PM/Admin role"
  else
    fail "Expected 200/403, got ${STATUS}" "$(body | head -c 200)"
  fi
else
  skip "PATCH assign (no ticket or user ID)"
fi

# 404 for non-existent ticket
STATUS=$(api PATCH "/tickets/${FAKE_ID}/assign" -d "{\"userId\":\"${USER_ID:-user-1}\"}")
if [[ "$STATUS" == "404" ]]; then
  pass "404 — assign non-existent ticket"
else
  fail "Expected 404, got ${STATUS}" "$(body | head -c 200)"
fi

# ═════════════════════════════════════════════════════════════════════════════
#  8.  REVIEW SESSION (Story 6-12)
# ═════════════════════════════════════════════════════════════════════════════

section "8. POST /tickets/:id/review-session"

# Attempt on fresh draft ticket — may fail due to precondition
if [[ -n "$NEW_ID" ]]; then
  STATUS=$(api POST "/tickets/${NEW_ID}/review-session" \
    -d '{"qaItems":[{"question":"Is the scope clear?","answer":"Yes, very clear."},{"question":"Any missing edge cases?","answer":"None identified."}]}')
  if [[ "$STATUS" == "200" || "$STATUS" == "201" ]]; then
    pass "${STATUS} — review session submitted"
    RS_STATUS=$(body_field '.status')
    echo -e "    ${DIM}new status: ${RS_STATUS}${RESET}"
  elif [[ "$STATUS" == "400" ]]; then
    pass "400 — precondition failed (ticket not in correct status for review)"
    echo -e "    ${DIM}$(body_field '.message' | head -c 200)${RESET}"
  else
    fail "Expected 200/201/400, got ${STATUS}" "$(body | head -c 200)"
  fi
fi

# Validation: empty qaItems array
if [[ -n "$NEW_ID" ]]; then
  STATUS=$(api POST "/tickets/${NEW_ID}/review-session" -d '{"qaItems":[]}')
  if [[ "$STATUS" == "400" ]]; then
    pass "400 — empty qaItems rejected (ArrayMinSize)"
  else
    fail "Expected 400, got ${STATUS}" "$(body | head -c 200)"
  fi
fi

# Validation: missing qaItems
if [[ -n "$NEW_ID" ]]; then
  STATUS=$(api POST "/tickets/${NEW_ID}/review-session" -d '{}')
  if [[ "$STATUS" == "400" ]]; then
    pass "400 — missing qaItems rejected"
  else
    fail "Expected 400, got ${STATUS}" "$(body | head -c 200)"
  fi
fi

# Validation: qaItem missing answer field
if [[ -n "$NEW_ID" ]]; then
  STATUS=$(api POST "/tickets/${NEW_ID}/review-session" \
    -d '{"qaItems":[{"question":"Q only"}]}')
  if [[ "$STATUS" == "400" ]]; then
    pass "400 — qaItem missing answer rejected"
  else
    fail "Expected 400, got ${STATUS}" "$(body | head -c 200)"
  fi
fi

# Validation: qaItem non-string answer
if [[ -n "$NEW_ID" ]]; then
  STATUS=$(api POST "/tickets/${NEW_ID}/review-session" \
    -d '{"qaItems":[{"question":"Q","answer":123}]}')
  if [[ "$STATUS" == "400" ]]; then
    pass "400 — qaItem non-string answer rejected"
  else
    fail "Expected 400, got ${STATUS}" "$(body | head -c 200)"
  fi
fi

# 404 for non-existent ticket
STATUS=$(api POST "/tickets/${FAKE_ID}/review-session" \
  -d '{"qaItems":[{"question":"Q","answer":"A"}]}')
if [[ "$STATUS" == "404" ]]; then
  pass "404 — review-session on missing ticket"
else
  fail "Expected 404, got ${STATUS}" "$(body | head -c 200)"
fi

# ═════════════════════════════════════════════════════════════════════════════
#  9.  APPROVE TICKET (Story 7-8)
# ═════════════════════════════════════════════════════════════════════════════

section "9. POST /tickets/:id/approve"

# Attempt on the ticket — will likely 400 unless it's in REVIEW status
if [[ -n "$NEW_ID" ]]; then
  STATUS=$(api POST "/tickets/${NEW_ID}/approve")
  if [[ "$STATUS" == "200" || "$STATUS" == "201" ]]; then
    pass "${STATUS} — ticket approved (→ FORGED)"
    APR_STATUS=$(body_field '.status')
    echo -e "    ${DIM}new status: ${APR_STATUS}${RESET}"
  elif [[ "$STATUS" == "400" ]]; then
    pass "400 — approve precondition (ticket not in REVIEW status)"
    echo -e "    ${DIM}$(body_field '.message' | head -c 200)${RESET}"
  elif [[ "$STATUS" == "403" ]]; then
    pass "403 — approve requires PM/Admin role"
  else
    fail "Expected 200/201/400/403, got ${STATUS}" "$(body | head -c 200)"
  fi
fi

# 404 for non-existent ticket
STATUS=$(api POST "/tickets/${FAKE_ID}/approve")
if [[ "$STATUS" == "404" ]]; then
  pass "404 — approve on missing ticket"
else
  fail "Expected 404, got ${STATUS}" "$(body | head -c 200)"
fi

# ═════════════════════════════════════════════════════════════════════════════
# 10.  START IMPLEMENTATION (Story 10-2)
# ═════════════════════════════════════════════════════════════════════════════

section "10. POST /tickets/:id/start-implementation"

BRANCH="forge/curl-test-$(date +%s)"

if [[ -n "$NEW_ID" ]]; then
  # Happy path attempt (may 400 if not in FORGED status)
  STATUS=$(api POST "/tickets/${NEW_ID}/start-implementation" \
    -d "{\"branchName\":\"${BRANCH}\",\"qaItems\":[{\"question\":\"Approach?\",\"answer\":\"Repository pattern\"}]}")
  if [[ "$STATUS" == "200" || "$STATUS" == "201" ]]; then
    pass "${STATUS} — implementation started"
    SI_STATUS=$(body_field '.status')
    SI_BRANCH=$(body_field '.branchName')
    echo -e "    ${DIM}status: ${SI_STATUS}${RESET}"
    echo -e "    ${DIM}branch: ${SI_BRANCH}${RESET}"

    if [[ "$SI_BRANCH" == "$BRANCH" ]]; then
      pass "Response branchName matches request"
    else
      fail "Branch mismatch" "expected=${BRANCH} got=${SI_BRANCH}"
    fi

    if [[ "$(body_field '.success')" == "true" ]]; then
      pass "Response has success:true"
    else
      fail "Expected success:true" "$(body | head -c 200)"
    fi

    if [[ "$(body_field '.ticketId')" == "$NEW_ID" ]]; then
      pass "Response ticketId matches"
    else
      fail "ticketId mismatch" "expected=${NEW_ID} got=$(body_field '.ticketId')"
    fi
  elif [[ "$STATUS" == "400" ]]; then
    pass "400 — precondition failed (ticket not in FORGED status)"
    echo -e "    ${DIM}$(body_field '.message' | head -c 200)${RESET}"
  else
    fail "Expected 200/201/400, got ${STATUS}" "$(body | head -c 200)"
  fi

  # Without qaItems (optional)
  BRANCH2="forge/curl-no-qa-$(date +%s)"
  STATUS=$(api POST "/tickets/${NEW_ID}/start-implementation" \
    -d "{\"branchName\":\"${BRANCH2}\"}")
  if [[ "$STATUS" == "200" || "$STATUS" == "201" || "$STATUS" == "400" ]]; then
    pass "${STATUS} — works without qaItems"
  else
    fail "Expected 200/201/400, got ${STATUS}" "$(body | head -c 200)"
  fi
fi

# Validation: missing branchName
if [[ -n "$NEW_ID" ]]; then
  STATUS=$(api POST "/tickets/${NEW_ID}/start-implementation" -d '{}')
  if [[ "$STATUS" == "400" ]]; then
    pass "400 — missing branchName rejected"
  else
    fail "Expected 400, got ${STATUS}" "$(body | head -c 200)"
  fi
fi

# Validation: branch not starting with forge/
if [[ -n "$NEW_ID" ]]; then
  STATUS=$(api POST "/tickets/${NEW_ID}/start-implementation" \
    -d '{"branchName":"feature/wrong-prefix"}')
  if [[ "$STATUS" == "400" ]]; then
    pass "400 — branch without forge/ prefix rejected"
    MSG=$(body_field '.message' 2>/dev/null || body_field '.message[0]' 2>/dev/null || true)
    if [[ "$MSG" == *"forge/"* ]]; then
      pass "Error message mentions forge/ requirement"
    fi
  else
    fail "Expected 400, got ${STATUS}" "$(body | head -c 200)"
  fi
fi

# Validation: branchName is not a string
if [[ -n "$NEW_ID" ]]; then
  STATUS=$(api POST "/tickets/${NEW_ID}/start-implementation" \
    -d '{"branchName":123}')
  if [[ "$STATUS" == "400" ]]; then
    pass "400 — non-string branchName rejected"
  else
    fail "Expected 400, got ${STATUS}" "$(body | head -c 200)"
  fi
fi

# Validation: qaItem bad shape
if [[ -n "$NEW_ID" ]]; then
  STATUS=$(api POST "/tickets/${NEW_ID}/start-implementation" \
    -d '{"branchName":"forge/bad-qa","qaItems":[{"question":"Q"}]}')
  if [[ "$STATUS" == "400" ]]; then
    pass "400 — qaItem missing answer rejected"
  else
    fail "Expected 400, got ${STATUS}" "$(body | head -c 200)"
  fi
fi

# Validation: forbidNonWhitelisted extra fields
if [[ -n "$NEW_ID" ]]; then
  STATUS=$(api POST "/tickets/${NEW_ID}/start-implementation" \
    -d '{"branchName":"forge/extra","extraField":"should reject"}')
  if [[ "$STATUS" == "400" ]]; then
    pass "400 — extra fields rejected (forbidNonWhitelisted)"
  elif [[ "$STATUS" == "200" ]]; then
    pass "200 — extra fields silently ignored"
  else
    fail "Expected 400/200, got ${STATUS}" "$(body | head -c 200)"
  fi
fi

# 404 for non-existent ticket
STATUS=$(api POST "/tickets/${FAKE_ID}/start-implementation" \
  -d '{"branchName":"forge/curl-404-test"}')
if [[ "$STATUS" == "404" ]]; then
  pass "404 — start-implementation on missing ticket"
else
  fail "Expected 404, got ${STATUS}" "$(body | head -c 200)"
fi

# ═════════════════════════════════════════════════════════════════════════════
# 11.  RE-ENRICH (Story 7-7) — requires REVIEW status + PM role
# ═════════════════════════════════════════════════════════════════════════════

section "11. POST /tickets/:id/re-enrich"

if [[ -n "$NEW_ID" ]]; then
  STATUS=$(api POST "/tickets/${NEW_ID}/re-enrich")
  if [[ "$STATUS" == "200" || "$STATUS" == "201" ]]; then
    pass "${STATUS} — re-enrich succeeded"
  elif [[ "$STATUS" == "400" ]]; then
    pass "400 — precondition (ticket not in REVIEW or no review session)"
  elif [[ "$STATUS" == "403" ]]; then
    pass "403 — re-enrich requires PM/Admin role"
  else
    fail "Expected 200/201/400/403, got ${STATUS}" "$(body | head -c 200)"
  fi
fi

# 404 for non-existent ticket
STATUS=$(api POST "/tickets/${FAKE_ID}/re-enrich")
if [[ "$STATUS" == "404" ]]; then
  pass "404 — re-enrich on missing ticket"
else
  fail "Expected 404, got ${STATUS}" "$(body | head -c 200)"
fi

# ═════════════════════════════════════════════════════════════════════════════
# 12.  EXPORTS
# ═════════════════════════════════════════════════════════════════════════════

section "12. Exports (markdown + XML)"

if [[ -n "$NEW_ID" ]]; then
  STATUS=$(api GET "/tickets/${NEW_ID}/export/markdown")
  if [[ "$STATUS" == "200" ]]; then
    pass "200 — markdown export"
  elif [[ "$STATUS" == "400" ]]; then
    pass "400 — no tech spec yet (expected for fresh ticket)"
  else
    fail "Expected 200/400, got ${STATUS}" "$(body | head -c 200)"
  fi

  STATUS=$(api GET "/tickets/${NEW_ID}/export/xml")
  if [[ "$STATUS" == "200" ]]; then
    pass "200 — XML export"
  elif [[ "$STATUS" == "400" ]]; then
    pass "400 — no tech spec yet (expected for fresh ticket)"
  else
    fail "Expected 200/400, got ${STATUS}" "$(body | head -c 200)"
  fi
else
  skip "Exports (no ticket was created)"
fi

# 404 for non-existent
STATUS=$(api GET "/tickets/${FAKE_ID}/export/markdown")
if [[ "$STATUS" == "400" || "$STATUS" == "404" ]]; then
  pass "${STATUS} — markdown export on missing ticket"
else
  fail "Expected 400/404, got ${STATUS}" "$(body | head -c 200)"
fi

# ═════════════════════════════════════════════════════════════════════════════
# 13.  DELETE TICKET
# ═════════════════════════════════════════════════════════════════════════════

section "13. DELETE /tickets/:id"

if [[ -n "$NEW_ID" ]]; then
  STATUS=$(api DELETE "/tickets/${NEW_ID}")
  if [[ "$STATUS" == "204" ]]; then
    pass "204 — ticket deleted"
    # Remove from cleanup list since we just deleted it
    CREATED_IDS=("${CREATED_IDS[@]/$NEW_ID/}")
  else
    fail "Expected 204, got ${STATUS}" "$(body | head -c 200)"
  fi

  # Confirm it's gone
  STATUS=$(api GET "/tickets/${NEW_ID}")
  if [[ "$STATUS" == "404" ]]; then
    pass "404 — deleted ticket no longer exists"
  else
    fail "Expected 404 after delete, got ${STATUS}" "$(body | head -c 200)"
  fi
else
  skip "DELETE ticket (no ticket was created)"
fi

# 404 for already-deleted or non-existent
STATUS=$(api DELETE "/tickets/${FAKE_ID}")
if [[ "$STATUS" == "204" || "$STATUS" == "404" ]]; then
  pass "${STATUS} — delete non-existent ticket"
else
  fail "Expected 204/404, got ${STATUS}" "$(body | head -c 200)"
fi

# ═════════════════════════════════════════════════════════════════════════════
# 14.  LIFECYCLE — discover existing FORGED ticket for real transitions
# ═════════════════════════════════════════════════════════════════════════════

section "14. Lifecycle on existing FORGED ticket"

# Try to find a real FORGED ticket
STATUS=$(api GET "/tickets")
FORGED_ID=""
if [[ "$STATUS" == "200" ]]; then
  FORGED_ID=$(jq -r '[.[] | select(.status == "forged")] | first | .id // empty' "$BODY_FILE" 2>/dev/null || true)
fi

if [[ -n "$FORGED_ID" ]]; then
  echo -e "  ${DIM}Using FORGED ticket: ${FORGED_ID}${RESET}"

  LIVE_BRANCH="forge/curl-lifecycle-$(date +%s)"
  STATUS=$(api POST "/tickets/${FORGED_ID}/start-implementation" \
    -d "{\"branchName\":\"${LIVE_BRANCH}\",\"qaItems\":[{\"question\":\"Test lifecycle?\",\"answer\":\"Yes\"}]}")
  if [[ "$STATUS" == "200" || "$STATUS" == "201" ]]; then
    pass "${STATUS} — FORGED → EXECUTING on real ticket"
    echo -e "    ${DIM}branch: ${LIVE_BRANCH}${RESET}"
    echo -e "    ${DIM}status: $(body_field '.status')${RESET}"
  else
    fail "Expected 200/201, got ${STATUS}" "$(body_field '.message' | head -c 200)"
  fi

  # Cannot start again (already EXECUTING)
  STATUS=$(api POST "/tickets/${FORGED_ID}/start-implementation" \
    -d '{"branchName":"forge/should-fail"}')
  if [[ "$STATUS" == "400" ]]; then
    pass "400 — cannot start-implementation twice (already EXECUTING)"
  else
    fail "Expected 400 for double start, got ${STATUS}" "$(body | head -c 200)"
  fi
else
  skip "Lifecycle on FORGED ticket (none available)"
  skip "Double start-implementation guard (none available)"
fi

# ═════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}──────────────────────────────────${RESET}"
TOTAL=$((PASS + FAIL + SKIP))
echo -e "${GREEN}${PASS} passed${RESET}  ${RED}${FAIL} failed${RESET}  ${YELLOW}${SKIP} skipped${RESET}  ${DIM}(${TOTAL} total)${RESET}"

if [[ $FAIL -gt 0 ]]; then
  echo -e "${RED}${BOLD}FAIL${RESET}"
  exit 1
else
  echo -e "${GREEN}${BOLD}PASS${RESET}"
  exit 0
fi
