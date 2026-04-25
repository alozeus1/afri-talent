# AfriTalent — Agentic AI QA & Premium Product Audit

**Audit branch:** `feat/agentic-qa-audit-2026-04-23`
**Auditor role:** Senior QA + Product Auditor + AI Quality Evaluator + DevSecOps
**Date:** 2026-04-23
**Scope:** End-to-end candidate surfaces — resume builder, cover-letter writer, job
matching, employer verification, application assistance, AI safety, e2e coverage,
job ingestion — plus security of AI endpoints and premium-tier user experience.

> Delivery style: "what is true right now" first, then evidence, then the fix.
> All findings are reproducible against `feat/agentic-qa-audit-2026-04-23` without
> mutating production data. Live-AI sampling was budget-capped at ~$0.50.

---

## 1. Executive summary

AfriTalent has a **sophisticated AI backbone** — a mature multi-agent orchestrator
(`backend/src/lib/ai/orchestrator/`), strict no-fabrication prompts, budget
tracking, truncation caps, a truth-guard retry loop, and a well-designed job
ingestion aggregator with 11 sources, deduplication, and completeness scoring.

However, **the candidate-facing UX does not expose this quality to the user.**
Three issues alone block "premium" framing:

| # | Surface | Symptom | User perception |
|---|---------|---------|-----------------|
| 1 | `/candidate/resume-builder` | AI output renders as a read-only `<pre>` block; only "Edit Inputs" (which destroys the result) is available. | "I paid for this and I can't even fix a typo." |
| 2 | `/candidate/cover-letter` | `textarea` is `readOnly`, the tone selector is *not* forwarded to the API, no draft/save persistence. | "The tone picker does nothing." |
| 3 | `/candidate/job-matches` | Only a match percentage is shown. No "why this matched," no verified-employer signal, no savings/visa badges. | "This is just a job board with numbers." |

Backend is ready to support editing and richer match surfaces with modest
extensions. The work is largely frontend state management plus two backend
fields (`explanation`, `verifiedEmployer`). See §6 and the companion
[`AFRITALENT_PREMIUM_QUALITY_BACKLOG.md`](./AFRITALENT_PREMIUM_QUALITY_BACKLOG.md)
for ranked remediation.

**Not-ready-for-public-launch verdict.** Three critical UX blockers, two consent
blockers in the AI-assisted application flow, and ongoing operational blockers
(key rotation, staging reindex, Stripe test-mode, Flutterwave KYC) remain open.
Closing the UX + consent blockers is 3–5 engineer-days of focused work.

---

## 2. Audit method

| Phase | What was done | Mutation? |
|-------|---------------|-----------|
| 1 | Read orchestrator, agents, sub-skill libraries, routes, aggregator, sources, frontend candidate pages. | No |
| 2 | Built a deterministic AI quality rubric (`backend/src/lib/ai/quality/quality-rubric.ts`) + 13 Vitest cases covering banned phrases, placeholders, length, filler density, quantification, keyword coverage. | Code-only (new files) |
| 3 | Authored 5 agentic Playwright suites under `frontend/e2e/agentic-*.spec.ts`, gated with `E2E_RUN_AGENTIC=1`. | Code-only |
| 4 | Inventoried aggregator sources vs. the premium-brief coverage target. | No |
| 5 | Wrote this report + the premium quality backlog. | No |

All new code, specs, and reports live on the isolated branch
`feat/agentic-qa-audit-2026-04-23`. No infra, Stripe, Flutterwave, or production
data was touched.

### Run commands

```bash
# Backend — AI quality rubric unit suite
cd backend
npx vitest run src/lib/ai/quality

# Frontend — gated agentic e2e specs (requires backend + frontend + seeded DB)
cd frontend
E2E_RUN_AGENTIC=1 npx playwright test agentic-resume-builder \
                                     agentic-cover-letter \
                                     agentic-job-matching \
                                     agentic-application-flow \
                                     agentic-empty-states
```

Prereqs for the e2e run:
- `backend/.env` has `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and does **not** have `MOCK_AI=1`.
- `candidate@example.com` has a `PROFESSIONAL` subscription.
- `prisma migrate dev && prisma db seed` has been run.
- Backend on `:4000`, frontend on `:3000`.

---

## 3. AI layer — deep-read findings

### 3.1 Orchestrator (`backend/src/lib/ai/orchestrator/index.ts`, `agents.ts`)

| Strength | Evidence |
|----------|----------|
| Model budget tracking with hard fail-closed at spend cap. | `budget.ts` enforces per-run ceilings. |
| Truncation caps on every LLM context window. | Agent-level `MAX_INPUT_CHARS`. |
| Strict no-fabrication prompts; every sub-agent is told "if data is missing, say so." | `agents.ts` prompt templates for Summarizer, Matcher, Reviewer, Explainer, Normalizer, Writer. |
| Truth guard: parsed output is re-graded; on FAIL, one retry with stricter instruction. | `runWithTruthGuard`. |
| Two-tier model split (`AI_FAST_MODEL` + `AI_QUALITY_MODEL`) controlled via env, currently both Claude Haiku 4.5. | `backend/.env`. |
| Match scoring thresholds are explicit constants (`MATCH_SCORE_THRESHOLD=55`, `MUST_HAVE=60`). | `index.ts`. |

### 3.2 Sub-skill libraries (`backend/src/lib/ai/skills/*`)

| Skill | Returns | Notes |
|-------|---------|-------|
| `resume-builder.buildResume` | `{ sections: { summary, skills[], experience[], education[], certifications[] }, rawText, source }` | Structured output is **already** available; frontend must start rendering sections instead of rawText to unlock editing. |
| `application-writer.writeCoverLetter` | `{ coverLetter, source }` | Tone argument *is* consumed in the prompt — frontend just never sends it. |
| `job-matcher.findJobMatches` | `{ jobId, title, company, location, type, seniority, slug, score, matchMethod }` | No `explanation`, no `verifiedEmployer`, no salary/visa badges. |
| `career-advisor.analyseCareer` | strongly-typed advice JSON | Persists to `CareerAdvice` table. |
| `ats-scanner.scanResumeAts` | structured score object | Present but not surfaced prominently in UI. |
| `resume-translator.translateResume` | multilingual resume | `fr / pt / ar / sw / es` supported. |

### 3.3 Cover-letter quality fallback (`backend/src/lib/ai/cover-letter.ts`)

Has a deterministic template fallback when `AI_DISABLED=1` or `MOCK_AI=1` or no
`ANTHROPIC_API_KEY` — good for degraded-mode operation. But the template output
is notably lower quality than the AI output; the frontend does not tell the user
which source they got.

### 3.4 Deterministic quality rubric (new)

`backend/src/lib/ai/quality/quality-rubric.ts` ships in this audit branch and
enforces:

- **Banned phrases:** "hard-working", "team player", "results-driven", "rockstar", "ninja", "synergy", etc. → `error`.
- **Placeholder leaks:** `[insert x]`, `{{var}}`, `TBD`, `lorem ipsum` → `error`.
- **Length windows:** cover letter 180–320 words, resume ≥ 250 words, match explanation 20–60 words → `warn`.
- **Quantification:** resumes must have ≥ 1 metric-bearing sentence → `warn`.
- **Filler density:** > 4% → `warn`.
- **Sentence length:** average > 32 words → `warn`.
- **ATS keyword coverage:** user can pass `expectedKeywords` and missing keywords are flagged.

Scoring deducts 15 per `error`, 7 per `warn`, 2 per `info`. Grades: `PASS ≥ 80`,
`WARN 55..79`, `FAIL < 55 or any error`. The rubric is a pure function with zero
external deps and **13 passing Vitest cases**:

```
Test Files  1 passed (1)
     Tests  13 passed (13)
```

Recommended: wire this rubric into the `/generate` handlers of resume-builder and
application-writer and log the grade per request; short-term use it as a regression
safeguard in CI, longer-term reject `FAIL` outputs and auto-retry.

---

## 4. Candidate-facing UX findings

### 4.1 Critical — resume output is not editable (BLOCKER-1)

- File: `frontend/src/app/candidate/resume-builder/page.tsx`
- The generated resume is rendered inside `<pre>` with no editing affordances.
- Only recovery path: "Edit Inputs" — which clears the output.
- Evidence that this is unnecessary friction: backend already returns
  `resume.sections` (summary + skills[] + experience[] + education[] + certifications[]).
- Fix shape: map each section to an editable block, track local draft state, call
  `/api/skills/resume-builder/save` with updated `content` + regenerated `rawText`.
- Estimated effort: **2 engineer-days**, no backend change required.

### 4.2 Critical — cover letter is read-only and tone is ignored (BLOCKER-2)

- File: `frontend/src/app/candidate/cover-letter/page.tsx`
- The textarea has `readOnly` set unconditionally.
- The tone `<select>` is in the DOM but its value is **never** included in the fetch
  body sent to `/api/skills/application-writer/generate`.
- No draft persistence — regenerating discards the previous draft.
- Fix shape: remove `readOnly`, controlled textarea with diff-preserve, send `tone`
  in body, add "Save as draft" → `/submit` only fires when the user clicks Apply.
- Estimated effort: **1 engineer-day**, no backend change required.

### 4.3 Critical — job matches lack "why" + trust signals (BLOCKER-3)

- File: `frontend/src/app/candidate/job-matches/page.tsx`
- UI only shows `match %`. No `explanation`, no verified-employer badge, no
  salary/visa signal.
- Backend response (`JobMatch` interface) has no `explanation` or
  `verifiedEmployer` fields either — this is a **backend + frontend** change.
- Autopilot's `/api/autopilot/matches` route already joins `employer.companyName`
  via `JobAlert`, but neither path surfaces `employer.isVerified` or returns a
  generated rationale.
- Recommended minimum fields to add to the API response and render:
  - `explanation: string` (20–60 words, rubric-graded before return)
  - `verifiedEmployer: boolean`
  - `visaSponsorship: boolean`
  - `salaryRange?: { min, max, currency }`
  - `freshness: 'new' | 'recent' | 'standard'`
- Estimated effort: **3–4 engineer-days** (new columns-from-joins + prompt tuning + rubric gating + frontend cards).

### 4.4 High — no explicit consent step before AI-authored application submission

- Files: `backend/src/routes/quick-apply.ts`, `backend/src/routes/autopilot.ts`
  (handlers `/apply` and `/batch`).
- A single POST generates the cover letter and creates the `Application` row in
  the same transaction. User never sees/approves the AI draft.
- Contrast: chat has a real consent gate (`backend/src/routes/chat-consent.ts`,
  `ChatConsent.privacyNotice / termsOfUse / dataStorage`).
- Risk: users could submit AI content they disagree with to real employers.
- Fix shape: split into two endpoints — `draft` (returns preview + `draftId`) and
  `submit` (requires `{ draftId, approved: true, edits? }`).
- Estimated effort: **2 engineer-days** (route split + frontend review screen + audit log).

### 4.5 Medium — "apply pack" source of cover letter not surfaced

- `autopilot.ts` logs `coverLetterSource: 'ai' | 'template'` to the task
  `outputSummary`, but the candidate never sees which they got.
- Recommend displaying a small "AI-assisted" vs "Template" pill above the preview.

### 4.6 Medium — no "regenerate with different tone" UX

- Backend supports `tone: 'professional' | 'conversational' | 'executive'` but
  the current UI has no single-click regenerate.

---

## 5. Security / consent / DevSecOps findings

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| S1 | OpenAI + Anthropic keys were exposed in an earlier chat and have not yet been rotated. | **Critical** | Rotate both keys today. Block: `op item edit`, then `aws secretsmanager update-secret afritalent-staging/app-secrets`, then force App Runner redeploy. |
| S2 | `SemanticDocument` rows were written while using the hash-based embeddings fallback; they are poisoned. | High | Truncate the table before the first real re-index run in staging. |
| S3 | The AI-auto-apply path creates live applications without user review (§4.4). | High | Add consent gate. |
| S4 | `SKILLS_ENABLED` is a **client-readable** boolean only — cannot be used to kill a single agent. | Medium | Introduce per-skill flags (`SKILL_RESUME_BUILDER_ENABLED`, etc.). |
| S5 | `/api/skills/resume-builder/scan-ats` accepts `jobDescription` up to 5k chars with no rate-limit specific to skills. | Medium | Add a narrow rate limiter (10/min/user) on `/api/skills/*`. |
| S6 | No deterministic pre-send quality gate in production — today we ship whatever Claude returns. | Medium | Integrate the new rubric; reject `FAIL` and serve the template fallback instead. |
| S7 | Stripe is still non-test-mode configured. | High | Set up test-mode secrets before any public rollout. |
| S8 | Flutterwave KYC not completed. | High | Complete KYC or hide Flutterwave CTAs. |
| S9 | Terraform drift not reconciled. | Medium | Run `terraform plan` against the intended state and reconcile before first prod deploy. |

---

## 6. Aggregator / scraper coverage matrix

Source of truth: `backend/src/lib/jobs/aggregator/sources/*`.

| Source | Type | File | Licensing / compliance | Priority | Status | Notes |
|--------|------|------|------------------------|----------|--------|-------|
| Adzuna | Official API | `adzuna.ts` | Partner API, requires key. | P0 | ✓ in use | Legitimate, stable. Quota-aware. |
| Apify | Apify actors | `apify.ts` | Third-party scraping service; risk transfers to Apify for TOS compliance. | P1 | ✓ in use | Convenient but legally fuzzy if source site disallows scraping. Document each actor's origin. |
| Arbeitnow | Public API | `arbeitnow.ts` | Open API, fair use. | P2 | ✓ in use | EU focus — complements African sources. |
| Greenhouse | Official ATS API | `greenhouse.ts` | Public board API per-employer. | P0 | ✓ in use | 16 default boards (configurable). Excellent data quality. |
| Himalayas | Public API | `himalayas.ts` | Remote-only niche board, open API. | P2 | ✓ in use | |
| Jobberman | Paid API / scrape | `jobberman.ts` | Commercial site — verify license. | P0 for NG | ✓ in use | Largest Nigeria-focused source. TOS review needed. |
| Jobs in Cyprus (via Remotive) | Public API | `jobsincyprus.ts` | Open Remotive API. | P3 | ✓ in use | Edge market. |
| Lever | Official ATS API | `lever.ts` | Public board API per-employer. | P0 | ✓ in use | 6 default sites (configurable). |
| RemoteOK | Public JSON feed | `remoteok.ts` | Fair-use TOS, credit required. | P1 | ✓ in use | High-signal remote. |
| WeWorkRemotely | RSS feed | `weworkremotely.ts` | RSS permitted. | P1 | ✓ in use | |
| Workable | Official ATS API | `workable.ts` | Public board API per-employer. | P1 | ✓ in use | |
| **Ashby HQ** | Official ATS API | — | Public board API per-employer. | **P1 — missing** | ✗ | YC-favourite ATS. Similar shape to Lever/Greenhouse. Est. 2 days. |
| **YC Work at a Startup** | Semi-public API | — | Requires auth, TOS-sensitive. | **P2 — missing** | ✗ | High candidate demand; review TOS first. Est. 3 days. |
| **Otta (Welcome to the Jungle EU)** | Private API / site scrape | — | Scraping restricted — prefer partnerships. | **P3 — missing** | ✗ | Only pursue with a partnership deal. |

**Missing-but-recommended action:** add **Ashby** first (API shape mirrors
Greenhouse/Lever, easiest 2-day lift, high-signal YC cohort).

### Aggregator quality controls already in place

- `buildSourceFingerprint` deduplicates across sources.
- Completeness scoring prefers rows with description, salary, location, tags.
- Freshness window keeps postings newer than N days.
- Visa-sponsorship detection, seniority heuristics, HTML entity decoding, skills
  extraction all live in `sources/base.ts`.

---

## 7. Employer verification

- `Employer.isVerified` exists in schema; admin-trust routes drive approval.
- `admin-trust.ts` handles both employer and candidate verification approvals
  with notifications.
- Gap: `JobMatch` API response does not surface `isVerified` to the candidate UI
  — documented as BLOCKER-3.

---

## 8. Tests & quality gates added by this audit

| Artifact | Location | Gating |
|----------|----------|--------|
| AI quality rubric module | `backend/src/lib/ai/quality/quality-rubric.ts` | Pure TS |
| Rubric Vitest suite (13 cases, all passing) | `backend/src/lib/ai/quality/__tests__/quality-rubric.test.ts` | Part of backend `npm test` |
| Agentic resume builder spec | `frontend/e2e/agentic-resume-builder.spec.ts` | `E2E_RUN_AGENTIC=1` |
| Agentic cover letter spec | `frontend/e2e/agentic-cover-letter.spec.ts` | `E2E_RUN_AGENTIC=1` |
| Agentic job matching spec | `frontend/e2e/agentic-job-matching.spec.ts` | `E2E_RUN_AGENTIC=1` |
| Agentic application flow spec | `frontend/e2e/agentic-application-flow.spec.ts` | `E2E_RUN_AGENTIC=1` |
| Agentic empty states spec | `frontend/e2e/agentic-empty-states.spec.ts` | `E2E_RUN_AGENTIC=1` |

`E2E_RUN_AGENTIC` defaults to off so these suites never fire in the normal CI or
deploy workflow. Run them on demand when validating premium quality.

---

## 9. Readiness verdict & minimum path to public launch

**Not ready.** Minimum remediation before public launch:

1. Close BLOCKERs 1, 2, 3 (§4.1–§4.3). ~6–7 eng-days.
2. Add the AI-application consent gate (§4.4). ~2 eng-days.
3. Rotate leaked keys, re-truncate `SemanticDocument`, reindex (§5 S1–S2). ~0.5 eng-day.
4. Stripe test-mode + Flutterwave KYC (§5 S7–S8). Blocking for payments only.
5. Integrate the rubric into the two `/generate` handlers with fail-closed behaviour. ~0.5 eng-day.
6. Add Ashby source (§6). ~2 eng-days.

After these, a **soft** launch with a small private cohort is reasonable. A full
public launch additionally requires the operational checklist from the prior
session (staging reindex, App Runner redeploy on rotated secrets, Terraform
reconciliation, first prod deploy, Lighthouse + canary green).

---

## 10. Attachments

- **Backlog** — [`AFRITALENT_PREMIUM_QUALITY_BACKLOG.md`](./AFRITALENT_PREMIUM_QUALITY_BACKLOG.md)
- **Rubric module** — `backend/src/lib/ai/quality/quality-rubric.ts`
- **Rubric tests** — `backend/src/lib/ai/quality/__tests__/quality-rubric.test.ts`
- **Agentic e2e specs** — `frontend/e2e/agentic-*.spec.ts`

No production data was modified to produce this report.
