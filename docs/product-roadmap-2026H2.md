# AfriTalent — Current-State Audit & Enhancement Roadmap (2026 H2)

Scope: incremental improvement of the existing product. No architecture
replacement, no mission change. This maps the full improvement brief
(job trust, resume AI, interview prep, learning, visa tracking, company
trust, blog, admin, security) against what the codebase already has, and
sequences the gaps into phases. Companion to `STAGING_RUNBOOK.md` and
`deploy/free-tier/DEPLOYMENT_NOTES.md`.

## 1. Current-state audit

### Exists and works (do not rebuild)
| Area | What exists |
|---|---|
| Job ingestion | 10+ source adapters, tri-key dedup, freshness/quality/risk scoring, expiry tracking, LangGraph quality gate (flagged) |
| Job trust metadata | `visaSponsorship`, `relocationAssistance`, `eligibleCountries`, `hiresFromAfrica` (badge+filter), employer trust levels, risk levels, source lineage, cross-check counts |
| Candidate AI | Orchestrator (resume review / job match / apply pack), skills routes (resume builder, ATS rubric scoring, job matcher, career advisor), semantic matching (pgvector), Mara chat |
| Autopilot | Auto-apply worker with safety gate (LangGraph), per-employer/job caps, explicit consent, batch apply |
| Interview prep | `/autopilot/interview-prep`, mock interviews with retention controls, readiness score (graph) |
| Trust layer | Employer verification levels + artifacts, candidate trust profiles, fraud detection, moderation queues, phone/OTP verification |
| Billing | Stripe + Flutterwave, regional PPP catalogs, entitlements per plan, quotas |
| Learning | `/learning` page with courses/lessons (client-side) |
| Blog | 5-agent weekly pipeline (fact-checked, human-approved), `/blog` archive, SEO-rendered posts |
| Notifications | In-app + web push + email digests + WhatsApp/Telegram digest (flagged), saved-search alerts |
| Admin | Reviews, moderation, blog approval, ops dashboards, feature flags via env |
| Security | RBAC middleware, CSRF double-submit, rate limiting, bot protection, Gitleaks/Semgrep/Trivy in CI, audit events |

### Known bugs (from 2026-07-02 UI test session) — all resolved 2026-07-06
| # | Bug | Severity | Status |
|---|---|---|---|
| B1 | Profile save fails with "CSRF token missing" | **Critical** | **Shipped** (#219/#220) — lazy CSRF seeding + retry, JSON and multipart |
| B2 | AI features surfaced raw errors for plan-gated users | High | **Shipped** (#219/#220) — ApiError status/code, upgrade CTA, copy fixed |
| B3 | No verification email on registration | High (config) | **Code shipped** (#219/#220) — skips now log loudly as `notification_delivery_skipped`; delivery still needs the SES setup in `deploy/free-tier/DEPLOYMENT_NOTES.md` |
| B4 | Dark mode: invisible text/CTAs | Medium | **Shipped** (#219/#220 + #226) — profile, learning, job-matches, immigration |
| B5 | Target country free text | Medium | **Shipped** (#219/#220 + #221) — dropdown storing ISO codes matching `Job.eligibleCountries` |
| B6 | Profile dates manual entry | Medium | **Shipped** (#219/#220) — calendar month pickers, side-aware parsing |
| B7 | Learning completion not reflected | Medium | **Shipped** (#219/#220) — featured cards show Complete/In-progress + Review |
| B8 | Salary role cards didn't filter jobs | Low | **Shipped** (#219/#220) — `?query=` accepted as search alias |
| B9 | Visa page purpose unclear | Medium | **Shipped** (#226) — readiness explainer, how-it-works, legal disclaimer |

### Risky / handle with care
- Aggregated jobs' unknown fields must render "Not confirmed", never guesses.
- AI suggestions must stay grounded in the candidate's real data (no fabricated skills) — enforce in prompts + output validation.
- Resume/document storage must remain private (signed URLs only).
- Do not ship fake metrics/testimonials — `EarlyAccessProof` stays until verified outcomes exist.

## 2. Open-source pattern references (study, don't paste)
| Reference | Take the pattern | License check before any code reuse |
|---|---|---|
| OpenResume / Reactive Resume | Resume builder UX, section model, ATS-safe layouts | AGPL (Reactive) — patterns only, no code |
| Resume Matcher / ResumeLM | JD↔resume keyword gap, match explanation UI | Verify per repo |
| Tech Interview Handbook | Role-based prep paths, question taxonomy | CC/MIT content — link, don't copy wholesale |
| LearnHouse / LMS patterns | Learning paths, module completion states, progress | AGPL (LearnHouse) — patterns only |
| USCIS-tracker projects | Status timeline UX, document checklist | Patterns only |
| TailAdmin / job-board templates | Dashboard IA, card/filter UX, empty/loading states | Verify per template |

## 3. Phased roadmap

**Phase 0 — Bug triage — ✅ SHIPPED (#219/#220):** B1, B2 (UX layer), B5, B6, B7, B8 + dark-mode
quick pass on the affected screens. Ship as one PR.

**Phase 1 — Job data quality & trust labels — ✅ SHIPPED (#221 labels, #235 card pills):** user-facing label set
(Verified employer / Salary available / Recently refreshed / External source /
Possible duplicate / Needs review), explicit "Unknown/Not confirmed"
rendering, expired/duplicate surfacing. Mostly *display* work — the metadata
already exists on `Job`.

**Phase 2 — Job detail page + "Can I apply from Africa?" — ✅ LARGELY SHIPPED (#221 verdict/report, #222 fit panel + workspace, #225 saved jobs; sticky apply bar remains):** dedicated section
computing Confirmed / Possibly / Not confirmed / Region-restricted from
`hiresFromAfrica`, `eligibleCountries`, `visaSponsorship`, `workplaceType`;
sticky apply/save bar; report-suspicious-job button (route exists in trust
layer); fit-score panel for logged-in candidates.

**Phase 3 — Resume intelligence UX:** unify existing ATS rubric + matcher +
review into one "Resume health" surface with match %, strong/missing skills,
explainable suggestions, apply-now/improve-first recommendation; resume
version history (model exists: `CandidateResumeVersion`). Free tier gets the
deterministic parts; AI parts stay plan-gated with friendly upgrade prompts.

**Phase 4 — Interview prep expansion:** role-based paths + question banks
(seed from public-domain taxonomies), practice history, STAR behavioral mode
on top of existing mock-interview infra. Ethical-use guardrails documented.

**Phase 5 — Learning dashboard — ✅ SHIPPED (#230; targetRoles ranking boost
deferred):** completion persisted server-side (`LearningProgress` model, May),
gap→course mapping fed by match results — `/learning?search=<skill>` deep
links from the job-fit panel filter the catalog, and `/api/learning/recommended`
returns truthful `gapSkills` rendered as "Fills your gap" chips. Admin-managed
content via Resource CMS categories remains.

**Phase 6 — Visa & relocation readiness — ✅ SHIPPED (#226, clarity pass on existing tracker; reminders/statuses vocabulary remain):** informational tracker (statuses:
Not started → Researching → Sponsorship confirmed → Documents → Submitted →
Waiting → Approved/Rejected/Closed), document checklist, reminders via
existing notification system, country notes, prominent not-legal-advice
disclaimer. Replaces the current vague page.

**Phase 7 — Company trust pages — ✅ SHIPPED (#235; SEO/SSR for company pages
deferred):** `Company` (reviews) and `Employer`+trust profile served from one
normalized `/api/companies` surface; granular employer trust badge; derived
(not hardcoded) hires-from-Africa; "Not enough verified data yet" empty
states; job detail links to the employer's company page.

**Phase 8 — Content engine:** blog categories (career advice, scam awareness,
visa explainers, negotiation), related-jobs/learning links, author/updated
metadata. Weekly pipeline already feeds it.

**Phase 9 — Admin & moderation consolidation:** single moderation dashboard
over the existing queues (jobs, employers, scam reports, blog, AI audit),
platform trust metrics, feature-flag panel.

## 4. Feature flags
Existing env-flag pattern (`SKILLS_ENABLED`, `PHASE4_*`, `LANGGRAPH_*`,
`BLOG_AUTOMATION_ENABLED`) extends to: `INTERVIEW_PREP_V2_ENABLED`,
`LEARNING_DASHBOARD_V2_ENABLED`, `VISA_TRACKER_ENABLED`,
`COMPANY_TRUST_PAGES_ENABLED`. All new phases default OFF.

## 5. Testing gates (every phase)
Typecheck + lint + unit (Jest/Vitest) + Playwright e2e on touched flows +
axe-core accessibility pass on new pages + Semgrep/Trivy (already in CI) +
preview smoke test on Vercel.

## 6. Security invariants (non-negotiable)
RBAC on every new route; candidate data visible to employers only after an
application or explicit consent; resumes via signed URLs only; AI outputs
logged with PII controls; deletion/export honored; no legal advice framing on
visa content.


## Verification Report — cycle closed 2026-07-06

**Shipped (all squash-merged to `main`, Vercel auto-deployed):**
| PR | Contents |
|---|---|
| #219/#220 | Bug-bash round 1 (B1–B8 fixes) + this roadmap |
| #221 | Phase 1: truth-first trust labels, "Can I apply from Africa?" verdict, report-suspicious-job, ISO-code country picker |
| #222 | Phase 2: deterministic job-fit panel, dashboard "My workspace" map |
| #225 | Saved jobs end-to-end — `SavedJob` model + migration, `/api/saved-jobs`, save toggle, `/candidate/saved-jobs` |
| #226 | Phase 6: visa readiness explainer, legal disclaimer, dark-mode pass, dashboard entry |
| #230 | Phase 5 wrap-up: `/learning?search=` deep links, `gapSkills` on recommendations, "Fills your gap" chips (merged 2026-07-07) |
| #235 | Phase 1 card pills (`africaPill` on job cards + saved jobs) and Phase 7 company trust pages (crash fix, granular trust badge, honest hires-from-Africa) (merged 2026-07-07) |

**Tested:** backend + frontend `tsc --noEmit` clean on every PR; 112+ Jest
tests (14 new for trust labels/verdicts); ESLint clean; full CI green on the
final head of each PR (incl. Playwright E2E + Lighthouse); Codex review
findings fixed and resolved on #220/#221 (multipart CSRF retry, period-parse
side handling, ISO country codes).

**Screens affected:** job detail, jobs list/filters, candidate dashboard,
candidate profile, learning, job matches, salaries, immigration,
`/candidate/saved-jobs` (new).

**Remains:** Phases 3, 4, 8, 9 (resume-health surface, interview-prep
expansion, content engine, admin consolidation); Phase 2 sticky apply bar;
deferred follow-ups — targetRoles-based ranking boost for learning
recommendations (#230), SEO/SSR + sitemap for company pages (#235), Resource
CMS admin content management (Phase 5).

**Risks / operational notes:**
- GitHub Actions intermittently dropped `pull_request` webhook events during
  the cycle (#218/#220/#221) — worked around with amend+force-push; check
  repo Settings → Webhooks if it recurs.
- Codex is out of review credits — no automated review on #222/#225/#226.
- **VM action required** to complete the cycle: sync + restart applies the
  SavedJob migration and backend fixes (`git pull` → backend `npm ci &&
  npx prisma generate && npm run build` → `native-backend-stop.sh &&
  native-backend-start.sh`).
- B3 email delivery still needs the SES setup (DEPLOYMENT_NOTES.md).

**Live smoke checklist (acceptance for this cycle):** save/unsave a job and
check `/candidate/saved-jobs`; open a job detail — verdict card, fit panel,
trust labels, save + report buttons; `/immigration` explainer + disclaimer;
dashboard workspace grid; dark-mode on profile/learning/matches; profile
save round-trips.

**Recommended next phase:** Phase 3 — unify the existing ATS rubric,
matcher, and review flows into one "Resume health" surface (free tier gets
the deterministic parts); then Phase 8 content engine on the blog pipeline.

## Cycle addendum — 2026-07-07 (Phases 5, 1-remainder, 7)

Shipped as #230 and #235 (see PR table above). Verified: full CI green on
#230; #235 validated by local typecheck/lint/Jest/Vitest (19 frontend + 19
backend tests on touched suites) and post-merge main CI. VM sync completed
2026-08-06 (no migrations this cycle). Live smoke: `/learning?search=…`
filters + gap chips; Africa pills on job cards/saved jobs; company pages
load with granular badges and honest data; job detail → company link.
