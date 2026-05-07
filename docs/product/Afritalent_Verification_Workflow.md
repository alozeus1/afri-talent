# AfriTalent — Candidate Verification Workflow

**Date:** 2026-04-29

---

## Overview

AfriTalent's trust model has two tiers:
1. **Candidate-facing** — signals that improve the candidate's trust score and profile completeness
2. **Employer-facing** — verified signals shown to employers when browsing candidate profiles

Trust signals are earned, not purchased. Paid plans unlock features, but badges are earned through verification.

---

## Verification Checklist Items

The checklist is returned from `GET /api/trust/candidate` as `trust.checklist[]`.

| Key | Label | Navigation Target | Backend Table |
|-----|-------|-------------------|---------------|
| `email_verified` | Verify your email | `/candidate/trust` | `User.emailVerified` |
| `phone_verified` | Verify your phone number | `/candidate/trust` | `User.phoneVerifiedAt` |
| `identity_verified` | Upload ID or evidence | `/candidate/trust` | `TrustVerificationArtifact` |
| `profile_complete` | Complete your profile | `/candidate/profile` | `Candidate.*` fields |
| `skill_verified` | Add a verified skill | `/candidate/trust` | `TrustVerificationArtifact` |
| `evidence_uploaded` | Upload certificate/evidence | `/candidate/trust` | `TrustVerificationArtifact` |
| `employer_profile_complete` | Complete employer-facing profile | `/candidate/profile` | `Candidate.*` fields |

---

## Email Verification

**Route:** `POST /api/auth/email/send-verification`  
**Flow:**
1. Registration triggers automatic email verification dispatch (via dispatcher)
2. User receives link via email (sent via AWS SES using `SES_FROM_EMAIL`)
3. Link calls `GET /api/auth/email/verify?token=...`
4. `User.emailVerified` set to `true`

**Current staging state:** Requires SES configuration with verified domain.

---

## Phone Verification (OTP)

**Route:** `POST /api/auth/phone/request-otp` + `POST /api/auth/phone/verify`  
**Flow:**
1. Candidate enters phone number in E.164 format (e.g., `+2348012345678`)
2. Backend generates 6-digit OTP, hashes it, stores in `UserPhoneOtp`
3. Backend calls Africa's Talking SMS API via `sendSms()`
4. Candidate enters code → backend verifies hash, sets `User.phoneVerifiedAt`
5. Trust score updated; `PHONE_VERIFIED` notification dispatched

**Rate limits:** 5 attempts max per OTP; new OTP expires old ones; 10-minute expiry  
**Staging requirements:** `AT_API_KEY`, `AT_USERNAME=sandbox`, `AT_SANDBOX=true`, `SMS_ENABLED=true` in GitHub secrets

---

## Evidence / Certificate Submission

**Route:** `POST /api/trust/candidate/submit-evidence`  
**Flow:**
1. Candidate submits URL or file reference for a credential/certificate
2. Status set to `PENDING` in `TrustVerificationArtifact`
3. Evidence appears in admin trust queue at `/admin/trust`
4. Admin reviews: Approve / Reject / Request more information
5. On approval: status set to `APPROVED`; candidate trust score updated; badge shown

**What candidates see:** "Pending review — submitted evidence is reviewed before it becomes visible to employers"  
**What employers see:** Only `APPROVED` evidence  
**Review SLA:** Not yet defined — follow-up sprint

---

## Linked Authenticity Signals (LinkedIn, GitHub, Portfolio)

**Route:** `PUT /api/profile` (updates `linkedinUrl`, `githubUrl`, `portfolioUrl`)  
**Flow:**
1. Candidate adds URLs via Edit Profile
2. Profile save persists URLs to `Candidate` table
3. Trust center reads from same data source

**Known gap:** Trust center does not auto-refresh after profile save. Candidate must reload the trust center page.

---

## Trust Score Calculation

Trust scores are calculated by `backend/src/lib/trust/service.ts`.  
Factors include (partial list):
- Email verified: +points
- Phone verified: +points
- Identity evidence approved: +points
- Skills evidence approved: +points per skill
- Profile completeness percentage
- Linked profiles (LinkedIn, GitHub, portfolio)

Scores are displayed on the Trust Profile page as a numeric value and category (Emerging / Established / Verified).

---

## Admin Review Path

Admin moderators access the trust review queue at `/admin/trust`:
- View all pending verification artifacts
- Open evidence URL/file
- Approve / Reject / Request additional info
- Add reviewer note
- Status update reflected immediately to candidate

**Route:** `GET /api/admin/trust/verification-queue`  
**Auth:** Requires `ADMIN` role
