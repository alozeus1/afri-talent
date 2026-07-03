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

### Known bugs (from 2026-07-02 UI test session)
| # | Bug | Severity | Status |
|---|---|---|---|
| B1 | Profile save fails with "CSRF token missing" — profile never updates | **Critical** | Fix in flight |
| B2 | AI job matching / ATS / resume review appear broken for new users | High | Mostly plan-gating (PROFESSIONAL) surfaced as raw errors — needs friendly upgrade UX + real error separation |
| B3 | No verification email on registration | High (config) | SES not configured on free-tier VM — needs `SES_FROM_EMAIL` + AWS creds in `.env`, or a fallback provider |
| B4 | Dark mode: some text/CTAs invisible | Medium | Contrast audit pass needed |
| B5 | Target country is free text | Medium | Country dropdown fix in flight |
| B6 | Profile dates manual text entry | Medium | Native date/month pickers fix in flight |
| B7 | Learning completion not reflected on landing card | Medium | Fix in flight |
| B8 | Salary page role cards don't link to filtered jobs | Low | Fix in flight |
| B9 | Visa page purpose unclear | Medium | Phase 6 redesign (tracker + checklist + disclaimer) |

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

**Phase 0 — Bug triage (now):** B1, B2 (UX layer), B5, B6, B7, B8 + dark-mode
quick pass on the affected screens. Ship as one PR.

**Phase 1 — Job data quality & trust labels:** user-facing label set
(Verified employer / Salary available / Recently refreshed / External source /
Possible duplicate / Needs review), explicit "Unknown/Not confirmed"
rendering, expired/duplicate surfacing. Mostly *display* work — the metadata
already exists on `Job`.

**Phase 2 — Job detail page + "Can I apply from Africa?":** dedicated section
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

**Phase 5 — Learning dashboard:** per-role paths, completion persisted
server-side (new `LearningProgress` model), gap→course mapping fed by match
results ("missing Kubernetes → do this lab first"), admin-managed content via
Resource CMS categories.

**Phase 6 — Visa & relocation readiness:** informational tracker (statuses:
Not started → Researching → Sponsorship confirmed → Documents → Submitted →
Waiting → Approved/Rejected/Closed), document checklist, reminders via
existing notification system, country notes, prominent not-legal-advice
disclaimer. Replaces the current vague page.

**Phase 7 — Company trust pages:** merge `Company` (reviews,
`hiresFromAfrica`) with `Employer`+trust profile into one public company
surface; "Not enough verified data yet" for empty sections.

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
