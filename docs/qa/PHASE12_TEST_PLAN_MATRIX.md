# Phase 1/2 QA Test Plan Matrix

## Scope
This matrix validates implemented Phase 1 (foundation) and Phase 2 (growth) capabilities and defines extension coverage for later phases.

Legend:
- `AUTO` = automated in CI-capable suites
- `MANUAL` = manual QA checklist required
- `EXT` = extension coverage target for later phases

## 1) Functional Testing
| Area | Scenario | Coverage | Suite / File |
|---|---|---|---|
| Auth flows | register, login, me, logout session invalidation | AUTO | `backend/src/__tests__/auth-api.test.ts`, `frontend/e2e/gate-a-security.spec.ts`, `frontend/e2e/phase1-foundation-smoke.spec.ts` |
| OAuth flows | providers list, provider mismatch guardrails | AUTO | `backend/src/__tests__/oauth-email-api.test.ts`, `backend/src/__tests__/phase12-quality-integration.test.ts` |
| Email verification | status, resend, verify token, sensitive action gating | AUTO | `backend/src/__tests__/oauth-email-api.test.ts`, `backend/src/__tests__/phase12-quality-integration.test.ts`, `frontend/e2e/phase2-quality-api.spec.ts` |
| Pricing by region | query-based region, geo-header region, region endpoints | AUTO | `backend/src/__tests__/phase12-quality-integration.test.ts`, `frontend/e2e/phase2-quality-api.spec.ts` |
| Subscription checkout | checkout creation, portal/webhook path validation | AUTO | `backend/src/__tests__/phase12-quality-integration.test.ts`, `frontend/e2e/phase2-quality-api.spec.ts` |
| Free vs paid gating | verification gate + plan upgrade recommendation paths | AUTO | `backend/src/__tests__/oauth-email-api.test.ts`, `frontend/e2e/phase2-quality-api.spec.ts` |
| Candidate flows | signup, browse jobs, apply path | AUTO | `frontend/e2e/phase2-quality-api.spec.ts`, `frontend/e2e/ui-phase2-regression.spec.ts` |
| Employer flows | signup, create job, upgrade attempt | AUTO | `frontend/e2e/phase2-quality-api.spec.ts` |
| Job search/filter | list + filter contracts + query caps | AUTO | `backend/src/__tests__/jobs-api.test.ts`, `frontend/e2e/gate-a-security.spec.ts` |
| Job detail pages | detail fetch and apply UX hooks | AUTO | `frontend/e2e/ui-phase2-regression.spec.ts` |
| Google for Jobs schema | JobPosting present for active jobs, absent for expired jobs | AUTO | `frontend/src/components/jobs/__tests__/job-jsonld.test.tsx`, `backend/src/__tests__/jobs-api.test.ts`, `frontend/e2e/ui-phase2-regression.spec.ts` |
| OpenAPI docs | spec availability + key route presence | AUTO | `backend/src/__tests__/phase12-quality-integration.test.ts`, `frontend/e2e/phase2-quality-api.spec.ts` |
| Notifications | unread count, list/read endpoints | AUTO | `frontend/e2e/gate-b-schema.spec.ts`, `frontend/e2e/phase2-quality-api.spec.ts` |
| Resume parsing | parse/apply draft safety controls and confirmation behavior | AUTO + MANUAL | `backend/src/routes/resume-parser.ts` exercised by API smoke; deep parsing UX in manual checklist |
| Multilingual routing | locale redirect + localized pages | AUTO | `frontend/src/lib/i18n/__tests__/routing.test.ts`, `frontend/e2e/ui-phase2-regression.spec.ts` |

## 2) Integration Testing
| Area | Scenario | Coverage | Suite / File |
|---|---|---|---|
| Frontend-backend contracts | API client payload/endpoint integrity | AUTO | `frontend/src/lib/__tests__/api-contracts.test.ts` |
| Stripe checkout/webhooks | session creation, invalid signature rejection, webhook processing | AUTO | `backend/src/__tests__/phase12-quality-integration.test.ts`, `frontend/e2e/phase2-quality-api.spec.ts` |
| Email token flow | token issuance + verification transaction | AUTO | `backend/src/__tests__/phase12-quality-integration.test.ts` |
| Job aggregator adapters | Greenhouse/Lever/Workable normalization + resilience | AUTO | `backend/src/lib/jobs/aggregator/sources/__tests__/board-adapters.test.ts` |
| Analytics events | ingestion contract + model endpoint | AUTO | `backend/src/__tests__/phase12-quality-integration.test.ts`, `frontend/e2e/phase2-quality-api.spec.ts` |
| Hero data stats | public stats backed by aggregate counts | AUTO | `backend/src/__tests__/phase12-quality-integration.test.ts`, `frontend/e2e/phase2-quality-api.spec.ts` |

## 3) End-to-End Testing
| Area | Scenario | Coverage | Suite / File |
|---|---|---|---|
| Desktop + mobile viewport | dedicated projects (`desktop-web`, `mobile-web`) | AUTO | `frontend/playwright.config.ts`, `frontend/e2e/ui-phase2-regression.spec.ts` |
| Candidate journey | signup → email verification actions → browse → apply → upgrade attempt | AUTO | `frontend/e2e/phase2-quality-api.spec.ts` |
| Employer journey | signup → profile bootstrap via register → post job → upgrade attempt | AUTO | `frontend/e2e/phase2-quality-api.spec.ts` |
| Pricing journey | pricing route + region switches + checkout path | AUTO | `frontend/e2e/phase2-quality-api.spec.ts`, `frontend/e2e/ui-phase2-regression.spec.ts` |
| Expired jobs behavior | expired jobs hidden from list/detail + no schema emission | AUTO | `backend/src/__tests__/jobs-api.test.ts`, `frontend/src/components/jobs/__tests__/job-jsonld.test.tsx` |
| 404 behavior | custom 404 page CTA and messaging | AUTO | `frontend/e2e/ui-phase2-regression.spec.ts` |

## 4) Accessibility Coverage
| Area | Scenario | Coverage | Suite / File |
|---|---|---|---|
| Keyboard navigation | tab focus progression on top nav | AUTO | `frontend/e2e/ui-phase2-regression.spec.ts` |
| Focus states | focusable nav + controls visible and operable | AUTO + MANUAL | E2E smoke + manual checklist |
| Labels / ARIA | menu toggles/dialog/controls have accessible labels | AUTO | `frontend/e2e/ui-phase2-regression.spec.ts`, component tests |
| Color contrast | contrast checks across light/dark + call-to-actions | MANUAL | `docs/qa/PHASE12_MANUAL_QA_CHECKLIST.md` |
| Screen-reader sanity | landmark and control announcement checks | MANUAL | `docs/qa/PHASE12_MANUAL_QA_CHECKLIST.md` |
| Reduced motion | verify motion safety when OS requests reduced motion | MANUAL | `docs/qa/PHASE12_MANUAL_QA_CHECKLIST.md` |

## 5) Performance Coverage
| Area | Scenario | Coverage | Suite / File |
|---|---|---|---|
| Lighthouse CI | perf/accessibility/best-practices SEO gate | MANUAL + CI JOB TARGET | `frontend/lighthouserc.json` |
| Core Web Vitals smoke | homepage render stability under throttling | AUTO | `frontend/e2e/ui-phase2-regression.spec.ts` |
| API latency | health/pricing/jobs endpoint responsiveness | AUTO | `frontend/e2e/phase2-quality-api.spec.ts` (time-aware smoke), manual benchmark gate |
| Loading skeletons | skeleton visible before slow API completion | AUTO | `frontend/e2e/ui-phase2-regression.spec.ts` |
| Low-bandwidth mobile | delayed asset delivery resilience | AUTO | `frontend/e2e/ui-phase2-regression.spec.ts` |

## 6) Security + Resilience Coverage
| Area | Scenario | Coverage | Suite / File |
|---|---|---|---|
| Unverified abuse | unverified user blocked on sensitive actions | AUTO | `backend/src/__tests__/oauth-email-api.test.ts`, `backend/src/__tests__/phase12-quality-integration.test.ts`, `frontend/e2e/phase2-quality-api.spec.ts` |
| OAuth linking edge cases | provider mismatch, unverified linking safeguards | AUTO | `backend/src/__tests__/oauth-email-api.test.ts` |
| Token replay prevention | logout invalidates auth session/token | AUTO | `frontend/e2e/gate-a-security.spec.ts` |
| Rate limiting | auth and verification limiter behavior | AUTO + MANUAL | `frontend/e2e/gate-a-security.spec.ts`, manual abuse loop checks |
| Region tampering | invalid billing-country payload rejected | AUTO | `backend/src/__tests__/phase12-quality-integration.test.ts`, `frontend/e2e/phase2-quality-api.spec.ts` |
| Entitlement bypass | role-gated/admin routes protected | AUTO | `frontend/e2e/phase2-quality-api.spec.ts` |
| Demo creds hidden in prod | production-only credential suppression | AUTO + MANUAL | login logic + production smoke in checklist |
| Webhook validation | invalid Stripe signature rejection | AUTO | `backend/src/__tests__/phase12-quality-integration.test.ts`, `frontend/e2e/phase2-quality-api.spec.ts` |

## 7) Visual Regression Coverage
| Area | Scenario | Coverage | Suite / File |
|---|---|---|---|
| Pricing page | region selector, interval toggles, cards | AUTO + MANUAL | `frontend/e2e/ui-phase2-regression.spec.ts`, screenshot baseline review |
| Auth pages | login/register state and CTA consistency | AUTO + MANUAL | existing component tests + manual screenshots |
| Dashboard | role-based dashboard checks | MANUAL | checklist with role matrix |
| Job list/detail | skeleton, cards, schema pages | AUTO | `frontend/e2e/ui-phase2-regression.spec.ts` |
| Mobile nav | drawer open/close and a11y labels | AUTO | `frontend/e2e/ui-phase2-regression.spec.ts` |
| Loading states | skeleton/pulse states under delayed network | AUTO | `frontend/e2e/ui-phase2-regression.spec.ts` |
| Dark mode | theme toggle and dark class application | AUTO | `frontend/e2e/ui-phase2-regression.spec.ts` |

## Extension Coverage for Later Phases (Phase 3+)
| Future Area | Extension Tests |
|---|---|
| Mobile app | API contract parity tests, deep-link auth tests, offline state tests, push token rotation tests |
| ATS integrations | per-provider sync conformance tests, dedup correctness tests, webhook replay/idempotency tests |
| AI video interviews | PII redaction checks, retention enforcement tests, consent revocation tests, storage access audits |
| Employer subscriptions/tiers | entitlement matrix tests per tier, proration tests, invoice tax localization tests |
| Advanced analytics | event completeness SLA tests, funnel data reconciliation tests, dashboard aggregation drift alerts |
| Regional payments | payment method fallback tests, currency/tax display correctness, webhook failure retry tests |
| Phase 4 moat features | social graph abuse tests, bot subscription abuse controls, partner API auth/rate-limit and data provenance checks |
