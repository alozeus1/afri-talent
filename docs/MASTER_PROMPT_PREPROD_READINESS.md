# AfriTalent — Master Agent Prompt: Close the Gap to Pre-Prod Testing

> Paste everything below the line into a fresh agent session as its primary brief.
> It is grounded in verified CI evidence from `main` HEAD as of 2026-07-08
> (CI run 28977541134). Unlike aspirational briefs, every "verified" claim here is
> backed by a test run; every "gap" is a thing that is provably NOT yet verified.

---

## 0. Role and outcome

You are the senior engineer finishing **AfriTalent** to the point where a **pre-prod
(internal/closed) testing round** can begin with confidence. This is a narrower bar
than public launch: the goal is that internal testers can exercise **all core loops
end-to-end against a real, seeded environment**, and that the AI + billing flows —
today's biggest unverified risk — are actually proven, not merely unit-mocked.

**Pre-prod "done" =** every core loop has a passing, non-skipped end-to-end test (or a
documented manual verification with evidence) against a running stack with seeded data;
no half-built feature is reachable; billing works in test/sandbox mode end-to-end.

## 1. Non-negotiable operating rules

Unchanged from `CLAUDE.md` / `AGENTS.md` / `STAGING_RUNBOOK.md`:
1. No pushing to `main`, deploying prod, touching prod secrets, applying infra, or
   destructive migrations without explicit human approval. Surface, don't self-authorize.
2. Branch → PR → CI green → human review. One concern per PR.
3. Deploy/infra/incident work: read `STAGING_RUNBOOK.md` first; update it same-session
   after any material live change.
4. Live app account `108188564905` — act via GitHub Actions OIDC or the local
   `afritalent` profile only; never wholesale local changes.
5. Evidence before assertions. "Tests pass" requires showing the run. A **skipped**
   test is NOT a passing test — treat skips as unverified.

## 2. Verified state (CI run 28977541134, `main` HEAD, pgvector env)

**Genuinely proven end-to-end / green:**
- Backend suite: **726 passed / 1 skipped** across 91 files.
- Frontend unit, all lint/typecheck/build (both apps): pass.
- Playwright E2E: **152 passed, 1 flaky (passed on retry), 0 failed**, 29 skipped.
- Security posture: audit findings H1–H3, M1–M5 fixed and re-verified; deps clean;
  phone/OTP log redaction in place.
- Feature breadth: 10/11 previously-"uncertain" areas fully wired with persistence;
  orphaned candidate tools now surfaced (PR #233); GDPR export/delete UI (PR #234).
- Prod Terraform stack complete + CI-validated (PRs #232); cutover runbook exists.

**NOT verified (the 29 E2E skips — these are the pre-prod gaps):**
- **AI job-matching is hard-skipped**: `test.skip(true, "Match endpoint not returning
  200 in this env")` in `frontend/e2e/agentic-job-matching.spec.ts`. Matching is never
  E2E-asserted to return 200.
- **Live-AI agentic suites gated off**: cover-letter + matching run only under
  `E2E_RUN_AGENTIC=1`; CI runs them with `MOCK_AI`. The real orchestrator path
  (resume_review / job_match / apply_pack against a live model) is not E2E-exercised.
- **Stripe billing/checkout E2E skipped** when Stripe unconfigured (no keys in CI);
  `phase2-stripe-billing-api.spec.ts` skips the whole suite.
- Several UI/schema smokes skip when the seed DB has **no published jobs**.

**Environment reality:**
- Dev/staging stack (`108188564905`) is **deliberately suspended** for cost control
  (CloudFront 503 is expected). Pre-prod testing requires resuming it + seeding data.
  Resume procedure is in `STAGING_RUNBOOK.md` ("To resume the dev webapp").

## 3. Known product gaps (from code, independent of the skips)

1. **Apply dispatch is 5/7** (`backend/src/lib/apply/dispatch.ts`): ASSISTED_REDIRECT,
   EMAIL_DRAFT, ATS_API_{GREENHOUSE,LEVER,WORKABLE} implemented; **ATS_API_ASHBY** and
   **OPERATOR_HANDOFF** are documented stubs. **Resolved for pre-prod (2026-07-08):**
   OPERATOR_HANDOFF is flag-gated off (PR #238) so ATS-host jobs degrade to
   ASSISTED_REDIRECT instead of hard-failing; a backfill re-classifies existing rows
   (PR #239). Ashby stays flag-off (unverifiable without a real Ashby key). See §4
   decisions.
2. **ATS scanner** (`backend/src/lib/ai/skills/ats-scanner.ts`): keyword-overlap only,
   not format/parse-aware.
3. **Resume PDF export**: builder + 3 templates exist; end-to-end download to a valid,
   ATS-parseable PDF is **unverified** — confirm or fix.
4. **Billing**: Stripe test-mode + Flutterwave sandbox only; no live activation.
5. **Legal pages**: real content, dated Feb 2026, but need lawyer review before launch
   (not a pre-prod blocker; flag it).

## 4. Workstreams to reach pre-prod readiness (ordered)

Each step: branch → PR → CI green → human review. Show test evidence per step.

**Decisions locked (2026-07-08):**
- **MOCK_AI parity is the verification standard.** Do NOT run the live-AI agentic
  E2E suites against real Anthropic/OpenAI services. Run the agentic Playwright
  suites with both `E2E_RUN_AGENTIC=1` and `MOCK_AI=1` so their test gates open
  while the backend remains deterministic and cost-free.
- **Operator-handoff: degrade to clickout (done).** `OPERATOR_HANDOFF` is flag-gated
  off (PR #238) so ATS-host jobs fall through to `ASSISTED_REDIRECT` instead of
  hard-failing; `--reclassify-operator-handoff` backfill (PR #239) flips existing
  stored rows. Building the Computer Use track is out of scope for pre-prod.
- **Ashby-apply: stays flag-off.** Unverifiable without a real Ashby employer API
  key, so deferred behind `APPLY_ATS_ASHBY_ENABLED` rather than shipped untested.

**WS-1 — Make the environment testable (human-gated resume).**
- With human approval, resume the dev stack per `STAGING_RUNBOOK.md` (terraform apply to
  recreate RDS Proxy, start NAT `i-097d412dc779da13d`, scale both ECS services to 1,
  wait services-stable). Validate `/health` = 200 and CloudFront serves the app.
- Seed published jobs + test users (`prisma db seed`) so matching/apply/schema flows
  have data. Wire Stripe test keys for the E2E env. **After seeding, run
  `npx tsx backend/scripts/jobs/backfill-apply-strategy.ts --reclassify-operator-handoff`
  (dry-run first)** so any seeded OPERATOR_HANDOFF rows become appliable.

**WS-2 — Close the E2E coverage holes (the core of this brief).**
- **Job matching**: fix whatever makes the match endpoint not return 200 in the test
  env (likely embedding/pgvector/seed), then **un-skip** `agentic-job-matching`'s hard
  `test.skip(true, ...)` and prove it green (under MOCK_AI).
- **Agentic path**: run the agentic Playwright suites with
  `E2E_RUN_AGENTIC=1 MOCK_AI=1`; MOCK_AI parity is the standard (see decisions),
  so real model calls are not required.
- **Billing**: configure Stripe test keys in the E2E env so
  `phase2-stripe-billing-api` runs; add a Flutterwave sandbox smoke. Prove checkout →
  webhook → entitlement end-to-end (the signed-webhook technique is in
  `local-db-testing-env` memory).
- Exit criterion: **0 core-loop tests skipped for env/config reasons**. Agentic
  suites must execute under MOCK_AI; only real-model validation is intentionally
  out of scope.

**WS-3 — Verify the unproven product paths.**
- Resume PDF export: generate a PDF for all 3 templates, assert it downloads and is
  ATS-parseable. Add an E2E/integration test.
- Apply dispatch: confirm EMAIL_DRAFT + the 3 ATS-API adapters work against sandbox/
  fixtures. (ASHBY + OPERATOR_HANDOFF are flag-deferred — decided 2026-07-08, §4.)
- ATS scanner: at minimum document that it is keyword-only so testers don't over-trust
  the score; format-awareness is a launch (not pre-prod) item unless prioritized.

**WS-4 — Guard against half-built features being visible.**
- Re-audit nav/dashboard reachability; anything not backed by a verified flow gets
  flag-hidden (env-var flag mechanism already exists in
  `backend/src/middleware/feature-flags.ts`).

**WS-5 — Pre-prod sign-off packet.**
- One doc: what was tested, evidence links (CI run + manual), known limitations testers
  should expect (ATS score is keyword-only, billing is sandbox, Ashby/operator-handoff
  disabled), and the rollback/resume-suspend procedure.

## 5. Definition of done (pre-prod)

- [ ] Dev stack resumed, `/health` 200, app reachable, DB seeded (human-approved).
- [ ] Core-loop E2E all pass with **zero env/config skips** (agentic suites execute
      with `E2E_RUN_AGENTIC=1 MOCK_AI=1`): candidate register→verify→resume→**match (un-skipped)**→
      apply→track; employer post→triage→talent-search; admin moderate; **AI job_match +
      cover_letter + apply_pack** proven under MOCK_AI; **checkout→webhook→entitlement**
      proven in Stripe test + Flutterwave sandbox.
- [ ] Resume PDF export verified for all templates.
- [ ] No half-built feature reachable by a tester (flag-hidden otherwise).
- [ ] Sign-off packet written; `STAGING_RUNBOOK.md` current.
- [ ] Every claim above backed by a shown test run or documented manual evidence.

## 6. Open questions for the human (don't guess)

- Approve resuming the dev stack for the testing window (it incurs cost; it was
  re-confirmed suspended 2026-07-06)?
- Are Stripe **test** keys + Flutterwave **sandbox** creds available for the E2E env?

_Resolved 2026-07-08: MOCK_AI parity is sufficient (no live-AI suites); ASHBY +
OPERATOR_HANDOFF are flag-deferred (see §4 decisions)._

---

*Grounding note: verified claims trace to CI run 28977541134 on `main` HEAD
(2026-07-08). Re-verify against current `HEAD` before acting — the point of this brief
is that skipped ≠ passing, and the pre-prod gap is precisely the flows CI currently
skips.*
