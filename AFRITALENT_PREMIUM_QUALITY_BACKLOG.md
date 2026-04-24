# AfriTalent — Premium Quality Backlog

Ranked remediation backlog produced by the 2026-04-23 agentic QA audit.
Companion to [`AFRITALENT_AGENTIC_AI_QA_REPORT.md`](./AFRITALENT_AGENTIC_AI_QA_REPORT.md).

Format: `[ID] Title — severity — effort — owner-suggested — done-criteria`.

Severity key:
- **Critical** — blocks public launch.
- **High** — degrades premium framing, or carries user-harm / trust risk.
- **Medium** — impacts retention / cost / polish.
- **Recommended** — should-have within 30 days of launch.

Effort in **eng-days** (1 day = ~6 focused hours).

---

## Critical (blocks public launch)

### `BACKLOG-1` — Job matches: add `explanation` + `verifiedEmployer` + trust badges
- **Severity:** Critical
- **Effort:** 3–4 eng-days (backend 2 + frontend 1–2)
- **Current state:** `findJobMatches` returns only `{ jobId, title, company, location, type, seniority, slug, score, matchMethod }`. Frontend shows score with no "why".
- **Done when:**
  - `GET /api/skills/job-matcher/matches` returns per-match: `explanation` (20–60 words, rubric-graded `WARN` or better), `verifiedEmployer`, `visaSponsorship`, `salaryRange`, `freshness`.
  - Match cards render `explanation` (with short/"read more"), a "Verified" badge for `verifiedEmployer=true`, visa pill when `visaSponsorship=true`, salary range when present.
  - 0 cost regression vs. today: explanation generation reuses Haiku FAST tier with strict `max_tokens=180`.
- **Risk mitigation:** Fail-closed — if explanation generation fails, return match with `explanation=null` rather than blocking the list.
- **Linked spec:** `frontend/e2e/agentic-job-matching.spec.ts` has an "intentional fail when these fields land" assertion that will signal when this lands.

### `BACKLOG-2` — AI-authored application flow: add explicit review & approval gate
- **Severity:** Critical
- **Effort:** 2 eng-days
- **Current state:** `POST /api/quick-apply` and `POST /api/autopilot/apply` generate a cover letter and create an `Application` row in the same call. No user-approval step. `autopilot/batch` does the same across up to 50 jobs.
- **Done when:**
  - Two endpoints: `POST /api/applications/draft` (returns `{ draftId, coverLetter, source, qualityReport }`) and `POST /api/applications/submit` (requires `{ draftId, approved: true, edits? }`).
  - UI renders the preview + tone toggle + "Edit before applying" + explicit "Submit application" button.
  - `ApplicationDraft` table (or redis TTL cache) retains draft for ≥ 24h.
  - Batch apply requires per-draft approval **or** an explicit workspace-level "auto-approve drafts" preference the user must opt into with consent text.
  - Audit log row for each submitted draft (`draftId`, `userId`, `jobId`, `approvedAt`).
- **Compliance note:** aligns with the existing `ChatConsent` pattern in `backend/src/routes/chat-consent.ts`.
- **Linked spec:** `frontend/e2e/agentic-application-flow.spec.ts` documents the current single-call behaviour and should be updated once the two-step flow ships.

### `BACKLOG-3` — Resume builder: per-section in-place editing
- **Severity:** Critical
- **Effort:** 2 eng-days
- **Current state:** `frontend/src/app/candidate/resume-builder/page.tsx` renders AI output inside a `<pre>`. Only "Edit Inputs" exists — which destroys the generated content.
- **Done when:**
  - Generated resume renders one card per section (summary, skills, experience[], education[], certifications[]).
  - Each bullet / skill / section has an inline edit affordance.
  - On save, frontend serializes sections back to `rawText` via the same format `buildResume` produces (or calls a new helper the backend exposes) and POSTs to `/api/skills/resume-builder/save`.
  - "Regenerate section" and "Regenerate all" are separate buttons.
  - Undo/redo for last 10 edits client-side.
- **Backend change needed:** none — `buildResume` already returns structured `sections`.

### `BACKLOG-4` — Cover letter: remove readOnly, wire tone, add draft save
- **Severity:** Critical
- **Effort:** 1 eng-day
- **Current state:** `frontend/src/app/candidate/cover-letter/page.tsx` — `readOnly` textarea; tone selector present but **not** sent to the API; no save.
- **Done when:**
  - Textarea is editable (controlled component, local draft state survives re-renders).
  - Tone `{ professional | conversational | executive }` is included in the `/generate` body.
  - "Regenerate" button re-calls `/generate` with current tone; user's manual edits are preserved behind a confirmation modal.
  - "Save draft" button persists to either the `Application.coverLetter` field (if a draftId exists) or local storage keyed by `jobId+userId`.
- **Rubric hook:** show the rubric `grade` + top-3 `issues[]` in a small panel so users can self-correct.

### `BACKLOG-5` — Rotate leaked OpenAI + Anthropic API keys
- **Severity:** Critical
- **Effort:** 0.5 eng-day
- **Current state:** Both keys were exposed in an earlier conversation; neither has been rotated. Staging `afritalent-staging/app-secrets` still holds the exposed values.
- **Done when:**
  - New keys minted in OpenAI + Anthropic consoles.
  - `backend/.env` + `afritalent-staging/app-secrets` + GitHub Actions secrets all updated.
  - Staging App Runner redeployed and `/api/health/ai` shows `ok` for both providers.
  - `SemanticDocument` rows written under the hash-provider fallback are truncated before the first real re-index.
- **Do not skip** — leaked keys with live credits are exploitable.

---

## High

### `BACKLOG-6` — Integrate deterministic quality rubric into `/generate` handlers
- **Severity:** High
- **Effort:** 0.5 eng-day
- **Current state:** `backend/src/lib/ai/quality/quality-rubric.ts` is landed and tested (13/13 green) but not wired into the two generate paths.
- **Done when:**
  - `resume-builder.ts` and `application-writer.ts` call `gradeAiOutput` on the model output.
  - On `FAIL`, retry once with a stricter system prompt; on second FAIL, fall back to the template builder and set `source='template-fallback'`.
  - `score`, `grade`, and first 3 `issues[]` are logged per request (structured JSON).

### `BACKLOG-7` — Per-skill kill switch
- **Severity:** High
- **Effort:** 0.5 eng-day
- **Current state:** Only the global `SKILLS_ENABLED` flag exists. Can't disable resume-builder while leaving cover-letter running.
- **Done when:** `SKILL_RESUME_BUILDER_ENABLED`, `SKILL_COVER_LETTER_ENABLED`, `SKILL_JOB_MATCHER_ENABLED`, `SKILL_CAREER_ADVISOR_ENABLED` independent flags; admin UI toggles them without redeploy.

### `BACKLOG-8` — Add Ashby HQ source to aggregator
- **Severity:** High
- **Effort:** 2 eng-days
- **Current state:** 11 sources present; Ashby (YC-favourite ATS) missing. Shape is similar to Greenhouse / Lever.
- **Done when:**
  - `backend/src/lib/jobs/aggregator/sources/ashby.ts` + config list of boards.
  - Deduplicates against existing Greenhouse / Lever listings via `buildSourceFingerprint`.
  - Unit test under `sources/__tests__/ashby.test.ts`.
  - Added to `aggregator/index.ts` with feature flag `SOURCE_ASHBY_ENABLED`.

### `BACKLOG-9` — Stripe test-mode end-to-end
- **Severity:** High (blocks paid flows)
- **Effort:** 1 eng-day
- **Done when:** test-mode keys set in staging, `POST /api/billing/checkout` round-trips to a webhook, subscription flips to `PROFESSIONAL`, one smoke test in `e2e/gate-c-entitlements.spec.ts` passes.

### `BACKLOG-10` — Flutterwave KYC completion
- **Severity:** High (blocks Africa-specific payment flows)
- **Effort:** blocked on vendor (doc prep + review ~1 eng-day on our side)
- **Done when:** Flutterwave dashboard shows KYC approved; staging checkout round-trips.

### `BACKLOG-11` — Per-route rate limiter on `/api/skills/*`
- **Severity:** High
- **Effort:** 0.5 eng-day
- **Current state:** Global rate limit exists; skills routes can be abused to burn AI spend (each generate costs $0.003–$0.03).
- **Done when:** `express-rate-limit` limiter on `/api/skills/*` at 30/min/user and 6/min for `*/generate` specifically.

### `BACKLOG-12` — Surface "AI vs template" source pill to the user
- **Severity:** High
- **Effort:** 0.25 eng-day
- **Current state:** `writeCoverLetter` returns `source: 'ai' | 'template'` but UI hides it. User cannot tell when they got the degraded fallback.
- **Done when:** small pill rendered next to the preview in both resume-builder and cover-letter pages.

---

## Medium

### `BACKLOG-13` — "Regenerate with different tone" single-click UX
- **Severity:** Medium
- **Effort:** 0.5 eng-day
- Adds three chip buttons (professional / conversational / executive) above the cover letter textarea; clicking re-runs `/generate` with that tone.

### `BACKLOG-14` — Semantic reindex job visible to admin
- **Severity:** Medium
- **Effort:** 1 eng-day
- Admin page showing embedding coverage per table (`UserResume.embedding` populated %, `Job.embedding` populated %), with "Reindex unembedded" buttons backed by the existing `embedPublishedJobs` helper.

### `BACKLOG-15` — Deduplicate across employer vs aggregator-sourced rows
- **Severity:** Medium
- **Effort:** 1 eng-day
- When an employer posts the same role both directly and via their ATS board, today we can end up with two entries. Extend `buildSourceFingerprint` to consider `employerId` alongside title+company+location.

### `BACKLOG-16` — Terraform reconciliation
- **Severity:** Medium
- **Effort:** 1 eng-day
- Run `terraform plan` against intended staging state; reconcile drift before the first prod deploy.

### `BACKLOG-17` — Candidate "my applications" screen surfaces cover-letter source + rubric grade
- **Severity:** Medium
- **Effort:** 0.5 eng-day
- Extends `/api/skills/application-writer/my-applications` to include the rubric report we logged per draft; UI shows a small `PASS / WARN / FAIL` chip.

### `BACKLOG-18` — ATS scanner surface on resume builder
- **Severity:** Medium
- **Effort:** 0.5 eng-day
- `/api/skills/resume-builder/scan-ats` exists but has no UI entry point; add a "Scan for target job" panel driven by an optional `jobDescription` paste.

---

## Recommended (within 30 days of launch)

### `BACKLOG-19` — Add YC Work at a Startup source (TOS-sensitive)
- **Severity:** Recommended
- **Effort:** 3 eng-days (including legal review)

### `BACKLOG-20` — Add Otta source (partnership required)
- **Severity:** Recommended
- **Effort:** Blocked on partnership

### `BACKLOG-21` — Live cost dashboard for AI spend
- **Severity:** Recommended
- **Effort:** 2 eng-days
- Per-day OpenAI + Anthropic spend with alert thresholds, sourced from the existing `aiUsageLog` / budget tracker tables.

### `BACKLOG-22` — Localize cover letter & resume builder prompts
- **Severity:** Recommended
- **Effort:** 2 eng-days
- Five language targets already supported in the translator (`fr / pt / ar / sw / es`); extend generation to accept a `locale` arg so output is localized at source.

### `BACKLOG-23` — Interview prep surface parity (backend has it, UI thin)
- **Severity:** Recommended
- **Effort:** 2 eng-days

### `BACKLOG-24` — Employer verification visibility on profiles
- **Severity:** Recommended
- **Effort:** 1 eng-day
- Show verified checkmark on employer profile page + in search / apply screens.

### `BACKLOG-25` — Accessibility sweep on resume-builder & cover-letter screens
- **Severity:** Recommended
- **Effort:** 1.5 eng-days
- Full keyboard traversal, ARIA labels on generate / regenerate / save buttons, screen-reader live region for generation progress.

---

## Roll-up: minimum premium launch package

| Phase | Items | Effort |
|-------|-------|--------|
| Immediate security | BACKLOG-5 | 0.5 d |
| Editing + consent | BACKLOG-3, BACKLOG-4, BACKLOG-2 | 5 d |
| Explanations & trust | BACKLOG-1 | 3–4 d |
| Quality hardening | BACKLOG-6, BACKLOG-11, BACKLOG-12 | 1.25 d |
| Coverage & kill switches | BACKLOG-7, BACKLOG-8 | 2.5 d |
| Payments | BACKLOG-9, BACKLOG-10 | 1 d + vendor |
| **Total (excluding vendor)** | | **~13–14 eng-days** |

After this package lands, a private beta is reasonable. A fully public launch
should additionally clear BACKLOG-14 through BACKLOG-17 for an operationally
sane first 30 days.
