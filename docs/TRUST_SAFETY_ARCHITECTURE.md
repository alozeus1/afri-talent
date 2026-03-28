# TRUST & SAFETY ARCHITECTURE

## Goal
AfriTalent should be credibly safer than a generic jobs board by combining verification, risk scoring, moderation, visible trust signals, and clear user education.

## Core design principles
- Never trust a single signal by itself.
- Use both positive trust signals and negative risk signals.
- Separate evidence collection from badge granting.
- Keep high-risk actions reversible with audit history.
- Preserve onboarding conversion by making deeper checks progressive.

## Trust domains

### 1. Employer trust
- Verification ladder:
  - `UNVERIFIED`
  - `EMAIL_DOMAIN_VERIFIED`
  - `BUSINESS_DOC_VERIFIED`
  - `MANUAL_REVIEW_APPROVED`
  - `PREMIUM_TRUSTED`
- Signals used:
  - company email domain
  - website and domain match
  - LinkedIn company page
  - business registration evidence
  - moderation history
  - posting velocity
  - open trust reports
- Product enforcement:
  - no public posting until the minimum threshold is met
  - stronger verification required for suspicious or high-volume employers
  - riskier jobs are auto-held for moderation

### 2. Candidate authenticity
- Verification ladder:
  - `UNVERIFIED`
  - `EMAIL_VERIFIED`
  - `PHONE_VERIFIED`
  - `IDENTITY_DOCUMENT_VERIFIED`
  - `SKILLS_VERIFIED`
  - `EMPLOYMENT_HISTORY_PARTIALLY_VERIFIED`
- Signals used:
  - email verification
  - phone OTP
  - optional identity evidence
  - skills and certification evidence
  - employment proof
  - LinkedIn, GitHub, portfolio
  - profile completeness
  - application velocity
  - abuse reports
- Product enforcement:
  - verification remains progressive for most candidates
  - premium employer filters can target higher-trust candidates
  - suspicious activity can trigger throttling or holds

### 3. Scam and fraud prevention
- Detection areas:
  - throwaway domains
  - domain mismatch
  - duplicated employer footprint
  - fake salary bait
  - off-platform contact requests
  - fee and deposit requests
  - impersonation attempts
  - spam application bursts
  - fake or low-completeness candidate profiles
- Technical pattern:
  - rule engine for explicit patterns
  - risk score accumulation
  - auto-hold thresholds
  - moderation case creation
  - abuse reporting from both sides
  - audit logs for every case action

## Data model
- `EmployerTrustProfile`
- `CandidateTrustProfile`
- `VerificationArtifact`
- `PhoneVerificationChallenge`
- `TrustRiskEvent`
- `TrustCase`
- `TrustCaseAction`
- `AbuseReport`
- trust fields on jobs, applications, and users for holds, risk level, and restriction state

## Service layer
- `assessEmployerTrust`
- `assessCandidateTrust`
- `assessContentRisk`
- `assessJobPostingRisk`
- `assessApplicationRisk`
- trust profile refresh helpers
- trust case and trust event recording helpers

## API surfaces
- Candidate trust endpoints:
  - summary
  - phone OTP request
  - phone OTP verification
  - candidate artifact submission
- Employer trust endpoints:
  - summary
  - trust profile update
  - employer artifact submission
- Shared trust endpoints:
  - abuse report submission
  - messaging safety guidance
- Admin trust endpoints:
  - dashboard
  - verification queue
  - risk queue
  - report queue
  - artifact review
  - trust case actions
  - report actions

## UX surfaces
- employer dashboard trust summary
- candidate dashboard trust summary
- employer trust page
- candidate trust page
- trust center
- abuse report page
- trust badges on jobs and talent cards
- scam guidance in messaging and job detail
- admin trust operations dashboard

## Security posture
- File uploads are presigned and scoped by verification purpose.
- Badge display is driven by server-side checks only.
- High-risk content is blocked or held server-side, not just warned client-side.
- Admin actions require reason codes and are persisted to case history.

## Operational workflow
1. User submits evidence or creates potentially risky content.
2. Server refreshes trust profile and recalculates risk.
3. If thresholds are crossed, the platform auto-holds content or access.
4. A moderation case is created with linked artifacts and reports.
5. Admin resolves the case with a reason-coded action.
6. Notifications and visible badges update based on actual outcomes.
