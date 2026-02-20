#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# AfriTalent Orchestrator — HTTP Golden Test
#
# Calls POST /api/orchestrator/run against a running local server,
# validates the response shape, and prints the top match score.
#
# Usage:
#   ./backend/scripts/orchestrator_golden_test.sh [api_base_url]
#
# Environment overrides:
#   CANDIDATE_EMAIL   login email    (default: candidate@example.com)
#   CANDIDATE_PASS    login password (default: Password123!)
#   RUN_TYPE          job_match | apply_pack (default: job_match)
#   TOKEN_BUDGET      integer (default: 30000)
#
# Requirements: bash, curl, python3  (no jq needed)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

API_BASE="${1:-http://localhost:4000}"
CANDIDATE_EMAIL="${CANDIDATE_EMAIL:-candidate@example.com}"
CANDIDATE_PASS="${CANDIDATE_PASS:-Password123!}"
RUN_TYPE="${RUN_TYPE:-job_match}"
TOKEN_BUDGET="${TOKEN_BUDGET:-30000}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES="$SCRIPT_DIR/fixtures"
RESUME_FILE="$FIXTURES/resume.txt"
JOB_FILE="$FIXTURES/job_fintech.txt"

# Colour helpers (disabled when not a tty)
if [ -t 1 ]; then
  GRN='\033[0;32m'; RED='\033[0;31m'; YLW='\033[1;33m'; BLD='\033[1m'; NC='\033[0m'
else
  GRN=''; RED=''; YLW=''; BLD=''; NC=''
fi

CHECKS_PASS=0
CHECKS_FAIL=0

ok()   { printf "${GRN}  ✓ %s${NC}\n" "$1"; CHECKS_PASS=$((CHECKS_PASS + 1)); }
fail() { printf "${RED}  ✗ FAIL: %s${NC}\n" "$1"; CHECKS_FAIL=$((CHECKS_FAIL + 1)); }
info() { printf "${YLW}  → %s${NC}\n" "$1"; }
hdr()  { printf "\n${BLD}══ %s ══${NC}\n" "$1"; }

# ── 1. Dependency check ───────────────────────────────────────────────────────
hdr "Dependencies"
for cmd in curl python3; do
  if command -v "$cmd" &>/dev/null; then
    ok "$cmd $(${cmd} --version 2>&1 | head -1 | cut -d' ' -f1-3)"
  else
    fail "$cmd not found (required)"; exit 1
  fi
done

# ── 2. Fixture check ──────────────────────────────────────────────────────────
hdr "Fixtures"
for f in "$RESUME_FILE" "$JOB_FILE"; do
  if [ -f "$f" ]; then
    BYTES=$(wc -c < "$f")
    ok "$(basename "$f")  ($BYTES bytes)"
  else
    fail "Missing: $f"; exit 1
  fi
done

# ── 3. Health check ───────────────────────────────────────────────────────────
hdr "API health  ($API_BASE)"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API_BASE/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  ok "GET /health → 200"
else
  fail "GET /health → $HTTP_CODE  (is the server running?)"
  printf "    Start with: cd backend && npm run dev\n\n"; exit 1
fi

# ── 4. Login (cookie-based auth) ──────────────────────────────────────────────
hdr "Authentication"
TMPDIR_TEST=$(mktemp -d)
trap 'rm -rf "$TMPDIR_TEST"' EXIT

COOKIE_JAR="$TMPDIR_TEST/cookies.txt"
LOGIN_RESP="$TMPDIR_TEST/login.json"

HTTP_CODE=$(curl -s -o "$LOGIN_RESP" -w "%{http_code}" \
  -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  --cookie-jar "$COOKIE_JAR" \
  -d "{\"email\":\"$CANDIDATE_EMAIL\",\"password\":\"$CANDIDATE_PASS\"}" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  ok "POST /api/auth/login → 200"
else
  fail "Login failed (HTTP $HTTP_CODE)"
  python3 -m json.tool "$LOGIN_RESP" 2>/dev/null || cat "$LOGIN_RESP"
  exit 1
fi

# Confirm the auth_token cookie was set
if grep -q "auth_token" "$COOKIE_JAR" 2>/dev/null; then
  ok "auth_token cookie received"
else
  fail "auth_token cookie not found in response"
  exit 1
fi

# ── 5. Build JSON payload (python3 handles all escaping) ──────────────────────
hdr "Payload"
PAYLOAD_FILE="$TMPDIR_TEST/payload.json"

python3 - <<PYEOF
import json, sys, os, uuid

resume_text = open("$RESUME_FILE").read().strip()
job_text    = open("$JOB_FILE").read().strip()

# Validate fixture sizes against route limits
assert len(resume_text) >= 100,  f"resume too short ({len(resume_text)} chars; min 100)"
assert len(resume_text) <= 30000, f"resume too large ({len(resume_text)} chars; max 30000)"
assert len(job_text) >= 50,       f"job text too short ({len(job_text)} chars; min 50)"
assert len(job_text) <= 20000,    f"job text too large ({len(job_text)} chars; max 20000)"

# Generate a proper RFC 4122 v4 UUID for job_id (avoids Zod strict UUID rejection)
job_id = str(uuid.uuid4())

payload = {
    "run_type": "$RUN_TYPE",
    "resume_text": resume_text,
    "candidate_profile": {
        "location": "Accra, Ghana",
        "work_auth": "open_to_relocation"
    },
    "jobs": [
        {
            "job_id": job_id,
            "source": "internal",
            "raw_text": job_text
        }
    ],
    "limits": {
        "token_budget_total": int("$TOKEN_BUDGET"),
        "max_tailored_jobs": 1
    }
}

encoded = json.dumps(payload)
size_kb  = len(encoded.encode()) / 1024
assert size_kb < 250, f"Payload exceeds 250 KB body limit ({size_kb:.1f} KB)"

with open("$PAYLOAD_FILE", "w") as f:
    f.write(encoded)

print(f"  payload: {size_kb:.1f} KB  resume: {len(resume_text)} chars  job: {len(job_text)} chars  job_id: {job_id}")
PYEOF

ok "Payload built ($(wc -c < "$PAYLOAD_FILE") bytes)"

# ── 6. Call POST /api/orchestrator/run ────────────────────────────────────────
hdr "POST /api/orchestrator/run  (run_type=$RUN_TYPE, budget=$TOKEN_BUDGET)"
info "Waiting for Claude — this may take 10–60 s …"

RESULT_FILE="$TMPDIR_TEST/result.json"

HTTP_CODE=$(curl -s -o "$RESULT_FILE" -w "%{http_code}" \
  -X POST "$API_BASE/api/orchestrator/run" \
  -H "Content-Type: application/json" \
  --cookie "$COOKIE_JAR" \
  -d "@$PAYLOAD_FILE" \
  --max-time 120 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  ok "POST /api/orchestrator/run → 200"
elif [ "$HTTP_CODE" = "400" ]; then
  fail "Bad request (400) — request body rejected by server"
  printf "\n  ${BLD}Request payload sent:${NC}\n"
  python3 -c "
import json, sys
data = json.load(open('$PAYLOAD_FILE'))
# Redact resume body to keep output readable
data['resume_text'] = data['resume_text'][:80] + '... [redacted]'
for j in data.get('jobs', []):
    j['raw_text'] = j['raw_text'][:80] + '... [redacted]'
print(json.dumps(data, indent=2))
" 2>/dev/null || cat "$PAYLOAD_FILE"
  printf "\n  ${BLD}Server response:${NC}\n"
  python3 -m json.tool "$RESULT_FILE" 2>/dev/null || cat "$RESULT_FILE"
  exit 1
elif [ "$HTTP_CODE" = "429" ]; then
  fail "Rate limited (429) — increase TOKEN_BUDGET or wait"
  python3 -m json.tool "$RESULT_FILE" 2>/dev/null || cat "$RESULT_FILE"
  exit 1
elif [ "$HTTP_CODE" = "503" ]; then
  fail "AI service unavailable (503) — check ANTHROPIC_API_KEY"
  python3 -m json.tool "$RESULT_FILE" 2>/dev/null || cat "$RESULT_FILE"
  exit 1
elif [ "$HTTP_CODE" = "000" ]; then
  fail "No response from server (timeout or connection refused)"
  exit 1
else
  fail "Unexpected HTTP $HTTP_CODE"
  python3 -m json.tool "$RESULT_FILE" 2>/dev/null || cat "$RESULT_FILE"
  exit 1
fi

# ── 7. Validate response & print summary ──────────────────────────────────────
hdr "Response validation"

python3 - "$RESULT_FILE" <<'PYEOF'
import json, sys

result_file = sys.argv[1]
try:
    data = json.load(open(result_file))
except json.JSONDecodeError as e:
    print(f"  ✗ FAIL: Response is not valid JSON: {e}")
    sys.exit(1)

ok_count   = 0
fail_count = 0

def chk(cond, label, detail=""):
    global ok_count, fail_count
    if cond:
        print(f"  \033[0;32m✓\033[0m {label}")
        ok_count += 1
    else:
        msg = f"{label}  ({detail})" if detail else label
        print(f"  \033[0;31m✗ FAIL: {msg}\033[0m")
        fail_count += 1

# ── Envelope shape ─────────────────────────────────────────────────────────────
chk("status"          in data, "has 'status'")
chk("run_id"          in data, "has 'run_id'")
chk("budget"          in data, "has 'budget'")
chk("ranked_jobs"     in data, "has 'ranked_jobs'")
chk("tailored_outputs" in data, "has 'tailored_outputs'")
chk("notes_for_ui"    in data, "has 'notes_for_ui'")

status = data.get("status", "")
chk(status in ("ok", "partial", "blocked"),
    f"status is valid enum",      f"got: {status!r}")
chk(status != "blocked",
    "run did not block",          data.get("error", ""))

# ── resume_json ────────────────────────────────────────────────────────────────
rj = data.get("resume_json") or {}
chk("resume_json" in data,         "has 'resume_json'")
chk(isinstance(rj.get("skills"), list) and len(rj.get("skills", [])) > 0,
    f"resume_json.skills non-empty",
    f"found {len(rj.get('skills', []))} skills")
chk(isinstance(rj.get("experience"), list),
    "resume_json.experience is array")

# ── ranked_jobs ────────────────────────────────────────────────────────────────
ranked = data.get("ranked_jobs", [])
chk(isinstance(ranked, list) and len(ranked) > 0,
    f"ranked_jobs non-empty",     f"found {len(ranked)}")

if ranked:
    top   = ranked[0]
    match = top.get("match", {})
    score = match.get("score")
    mhpct = match.get("must_have_coverage_pct")
    rec   = match.get("recommendation", "")

    chk(isinstance(score, (int, float)),
        f"ranked_jobs[0].match.score is numeric",    f"got {score!r}")
    chk(isinstance(mhpct, (int, float)),
        "ranked_jobs[0].match.must_have_coverage_pct numeric", f"got {mhpct!r}")
    chk(rec in ("apply", "stretch", "skip"),
        f"recommendation is valid enum",             f"got {rec!r}")

# ── budget ─────────────────────────────────────────────────────────────────────
budget = data.get("budget", {})
tokens_used = budget.get("token_used_estimate", 0)
chk(isinstance(tokens_used, (int, float)) and tokens_used > 0,
    f"tokens consumed",           f"token_used_estimate={tokens_used}")

# ── tailored_outputs (present only for apply_pack above threshold) ─────────────
tailored = data.get("tailored_outputs", [])
if tailored:
    t0 = tailored[0]
    chk("tailored_resume"  in t0, "tailored_outputs[0] has tailored_resume")
    chk("cover_letter_pack" in t0, "tailored_outputs[0] has cover_letter_pack")
    chk("guard_report"      in t0, "tailored_outputs[0] has guard_report")
    cl = t0.get("cover_letter_pack", {})
    chk(isinstance(cl.get("word_count"), int) and cl.get("word_count", 0) > 0,
        f"cover_letter word_count > 0",  f"got {cl.get('word_count')!r}")
    guard = t0.get("guard_report", {})
    chk(guard.get("verdict") in ("PASS", "FAIL"),
        f"guard verdict valid",   f"got {guard.get('verdict')!r}")

# ── Print summary ──────────────────────────────────────────────────────────────
print()
print("  ─── Run summary ─────────────────────────────────────────")
print(f"  run_id      : {data.get('run_id', '?')}")
print(f"  status      : {data.get('status', '?')}")
print(f"  tokens used : {tokens_used} / {budget.get('token_budget_total', '?')}")

if ranked:
    top   = ranked[0]
    match = top.get("match", {})
    job   = top.get("job_json", {})
    print(f"  top match   : {job.get('company', '?')} – {job.get('title', '?')}")
    print(f"  score       : {match.get('score', '?')} / 100  [{match.get('recommendation', '?')}]")
    print(f"  must-haves  : {match.get('must_have_coverage_pct', '?')}% covered")
    expl = str(match.get("explanation", ""))
    print(f"  explanation : {expl[:120]}{'…' if len(expl) > 120 else ''}")
    missing = match.get("missing_must_haves", [])
    if missing:
        print(f"  missing     : {', '.join(missing[:5])}")

if tailored:
    print(f"  tailoring   : ran for {len(tailored)} job(s)")
    for t in tailored:
        gv  = t.get("guard_report", {}).get("verdict", "?")
        wc  = t.get("cover_letter_pack", {}).get("word_count", "?")
        print(f"    {t.get('job_id','?')[:8]}…  guard={gv}  cover_letter_words={wc}")
else:
    print(f"  tailoring   : skipped (run_type or below threshold)")

notes = data.get("notes_for_ui", [])
if notes:
    print(f"  notes       : {' | '.join(notes[:3])}")

print()
if fail_count:
    print(f"  \033[0;31m{fail_count} check(s) failed\033[0m")
    sys.exit(1)
else:
    print(f"  \033[0;32m{ok_count} checks passed\033[0m")
PYEOF

PYTHON_EXIT=$?

# ── Final banner ──────────────────────────────────────────────────────────────
printf "\n"
if [ $PYTHON_EXIT -eq 0 ] && [ $CHECKS_FAIL -eq 0 ]; then
  printf "${GRN}${BLD}  ✅  Golden test passed  (${CHECKS_PASS} checks)${NC}\n\n"
  exit 0
else
  printf "${RED}${BLD}  ❌  Golden test FAILED${NC}\n\n"
  exit 1
fi
