# Candidate Authenticity and Quality Layer

## Goal

AfriTalent should help employers trust marketplace candidates more than generic job boards by combining:

- identity and contact verification
- structured profile completeness
- evidence-backed skills
- partner-issued trust markers
- explainable, multi-signal candidate trust scoring

## Product Design

### Candidate trust profile

The candidate trust profile is designed around layered evidence instead of a single badge.

Core inputs:

- email verification
- phone verification
- identity-document approval
- active resume presence
- structured work history
- work history consistency
- structured education entries
- certification evidence
- LinkedIn, GitHub, and portfolio links
- verified skill badges
- partner-issued trust markers
- unresolved reports and suspicious activity

Candidate-facing principles:

- make the trust model legible without exposing raw scoring weights
- show what is verified, what is strengthening, and what still needs attention
- let candidates improve trust incrementally

Employer-facing principles:

- never show a badge without real backing data
- privilege verified skills, partner signals, and complete profiles in filters and cards
- keep premium trust filters entitlement-aware

## Data Model

### Extended candidate profile

`CandidateProfile` now stores:

- `workHistory`
- `educationHistory`
- `certifications`

This moves the platform away from a flat “headline plus tags” profile and gives trust scoring structured evidence to inspect.

### Candidate trust profile

`CandidateTrustProfile` now stores:

- `verifiedSkillCount`
- `partnerSignalCount`
- `assessmentBacked`
- `fullyCompletedProfile`
- `explainabilitySignals`

This lets search, candidate UX, and employer UX all reuse a single derived trust record.

### Verified skills

`CandidateVerifiedSkill` stores:

- skill name
- verification method
- verification status
- supporting artifact or assessment lineage
- optional partner linkage
- reviewer linkage
- score, note, and timestamps

Supported methods:

- `CERTIFICATE`
- `PORTFOLIO`
- `ASSESSMENT`
- `MANUAL_REVIEW`
- `PARTNER_ISSUED`

### Partner-issued markers

`CandidatePartnerMarker` stores:

- candidate
- partner
- marker type
- status
- label and description
- issuing reviewer
- optional partner record lineage

Supported partner organization types:

- `UNIVERSITY`
- `BOOTCAMP`
- `TRAINING_INSTITUTE`
- `SCHOLARSHIP_PARTNER`

## Trust Scoring Model

### Scoring philosophy

The scoring model is intentionally multi-signal and partially opaque.

What is explainable:

- which evidence categories are helping or hurting trust
- whether a signal is verified, strengthening, or still missing
- whether a profile is eligible for premium employer trust filters

What is not exposed directly:

- exact numeric weights for each signal
- exact premium threshold logic
- internal fraud heuristics

### Positive trust signals

- verified email
- verified phone
- approved identity documentation
- active resume
- strong profile completeness
- structured and consistent work history
- education and certification evidence
- LinkedIn, GitHub, and portfolio links
- verified skills
- assessment-backed skills
- partner-issued trust markers

### Negative signals

- unresolved abuse reports
- extreme application velocity
- thin or inconsistent work history
- missing resume
- poor completeness

### Premium employer filter eligibility

Premium trust filtering is reserved for candidates with:

- strong authenticity score
- low risk score
- sufficiently complete profile
- real higher-confidence evidence such as identity, verified skills, or partner backing

## Verified Skill Workflows

### Certificate-backed

1. Candidate uploads a certificate or public credential URL.
2. A `VerificationArtifact` is created.
3. A linked `CandidateVerifiedSkill` record is created in `PENDING`.
4. Admin review can approve, reject, or request more information.
5. Approval converts the skill to `VERIFIED` and updates the trust profile.

### Portfolio-backed

1. Candidate submits a portfolio, GitHub, or public work sample URL.
2. A `CandidateVerifiedSkill` record is created in `PENDING`.
3. Admin review is used for trust-sensitive roles or ambiguous evidence.

### Assessment-backed

1. Candidate completes a skill assessment.
2. On completion, the system evaluates the result.
3. Strong results create or update a `CandidateVerifiedSkill` in `VERIFIED`.
4. Weak results do not silently mint employer-facing trust.

### Manual review

Admin or specialist reviewers can issue manually reviewed skills for high-value roles where employers need stronger evidence.

## Partner Architecture

### Partner model

The existing partner system has been generalized from “university only” into a broader institutional trust layer while preserving the current `UniversityPartner` and `UniversityPartnerRecord` table family.

Each partner can:

- ingest records through the partner API
- issue candidate trust markers
- issue partner-backed verified skills

### Partner-issued trust markers

Examples:

- university verified
- bootcamp verified
- training verified
- scholarship alumni
- scholarship fellow
- partner recommended

These markers are visible to employers and count as high-confidence trust signals.

## Employer Filtering

Talent search now supports:

- verified candidates only
- verified skills only
- fully completed profiles only
- assessment-backed candidates only

Entitlement model:

- verified candidate
- verified skill
- assessment-backed filters

are premium-trust filters for employers, while full-profile completeness can remain broadly available.

## Candidate UX

### Candidate trust page

The candidate trust page now shows:

- trust summary
- explainability cards
- verification checklist
- phone verification
- identity and employment evidence submission
- verified skill submission workflow
- partner markers
- assessment history

### Candidate profile editor

The profile editor now supports:

- structured work history
- structured education
- structured certifications

This supports both trust scoring and future search and matching quality improvements.

## Admin Operations

Admin partner tooling now supports:

- creating partner organizations
- reviewing partner record intake
- issuing partner markers
- issuing verified skills through partner or manual-review methods

Admin trust review also now propagates certificate review decisions back into linked verified-skill records.

## APIs

Key candidate trust APIs:

- `GET /api/trust/candidate/summary`
- `POST /api/trust/candidate/phone/request-otp`
- `POST /api/trust/candidate/phone/verify-otp`
- `POST /api/trust/candidate/artifacts`
- `POST /api/trust/candidate/skills`

Key employer discovery APIs:

- `GET /api/talent`
- `GET /api/talent/:userId`

Key partner admin APIs:

- `POST /api/university-partners/admin/partners`
- `GET /api/university-partners/admin/partners`
- `GET /api/university-partners/admin/partners/:partnerId/records`
- `POST /api/university-partners/admin/partners/:partnerId/markers`
- `POST /api/university-partners/admin/partners/:partnerId/verified-skills`

## Rollout Notes

Recommended rollout sequence:

1. Enable schema and backfill trust-profile refreshes.
2. Launch candidate UI for trust, skills, and structured profile fields.
3. Enable employer filters behind premium entitlement and observe usage.
4. Roll out admin partner operations to a small ops cohort.
5. Add first institutional partners and validate manual review throughput.

## Success Metrics

- percentage of candidates with verified phone
- percentage of candidates with at least one verified skill
- percentage of candidates with partner markers
- share of talent searches using trust filters
- shortlist rate for verified vs non-verified candidates
- employer conversion after viewing trusted candidates
- false-positive rate for rejected skill evidence
- time from candidate submission to verification decision
