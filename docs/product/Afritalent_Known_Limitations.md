# AfriTalent — Known Limitations (Early Access)

**Date:** 2026-04-29  
**Status:** Pre-launch early access testing  

This document is honest about what is not yet production-ready. Early testers should be aware of these before using the platform.

---

## Authentication & Security

| Limitation | Impact | Status |
|-----------|--------|--------|
| Google OAuth requires staging redirect URI registered in Google Cloud Console | OAuth login returns to login page without creating account | Action required by admin |
| Password reset email requires SES configured | Reset link email may not send in staging | SES setup needed |
| `sameSite: strict` cookie was causing cross-domain auth failures | Profile save, OAuth, and other API calls failed silently | Fixed in commit `ffc84e1` |

---

## Verification

| Limitation | Impact | Status |
|-----------|--------|--------|
| Phone verification requires AT credentials | No OTP SMS sent until AT secrets deployed | Fixed pipeline; secrets need adding to GitHub |
| Evidence review has no admin email notification | Admin must proactively check trust queue | Follow-up: add dispatch on evidence submit |
| Identity verification (government ID) is manual review | Can take time; no estimated SLA shown | UX improvement needed |
| LinkedIn authenticity signal requires page refresh after profile save | Trust center doesn't auto-refresh | Follow-up: invalidate trust cache on profile save |

---

## Content & Data

| Limitation | Impact | Status |
|-----------|--------|--------|
| Company directory is empty | 0 real employer profiles | Early access: honest "coming soon" shown |
| Learning Hub content is seeded (not live courses) | Users see starter content, not enrolled curriculum | By design for early access |
| Salary data is sparse | Few community-submitted salaries | Grows as candidates submit |
| Interview insights are sample scenarios | Not real user submissions yet | Grows as users share experiences |
| Homepage stats (3+ candidates, 2+ companies) | Very early stage | Honest — not inflated |
| Testimonials on homepage and companies page | Placeholder copy | Must be replaced with real user quotes before public launch |

---

## AI Features

| Limitation | Impact | Status |
|-----------|--------|--------|
| AI resume review requires paste (no upload) | User must manually paste resume text | Follow-up: add file extraction |
| Mara AI chat lacks AfriTalent-specific grounding | Generic responses on platform questions | Follow-up: add product context to system prompt |
| AI match may return 500 if ANTHROPIC_API_KEY missing in env | Internal server error visible | Fixed via secrets pipeline deployment |
| Recent runs counter reset on page refresh | Run history shows 0 until backend is queried | UX issue — loading state present |

---

## Mobile & Accessibility

| Limitation | Impact | Status |
|-----------|--------|--------|
| No native mobile app | Mobile users use web/PWA | Acceptable for early access |
| Arabic (AR) RTL layout not tested | May have layout issues | Follow-up |

---

## Notifications & Messaging

| Limitation | Impact | Status |
|-----------|--------|--------|
| Browser push notifications require VAPID keys | Push delivery disabled until configured | Follow-up: add VAPID keys to staging |
| Email notifications require SES configuration | Emails may not send | SES setup needed |
| In-app notifications work | Real-time in-app alerts functional | Working |

---

## What Is Safe to Show Early Testers

✅ Job discovery and search  
✅ Trust Center and verification checklist  
✅ Profile creation and editing  
✅ AI resume analysis and job matching (requires ANTHROPIC_API_KEY)  
✅ Interview preparation content  
✅ Learning Hub starter content  
✅ Salary data exploration  
✅ Application tracking  
✅ Alert preferences  
✅ Password reset flow  

---

## What Should NOT Be Shown as Production-Ready

❌ Google OAuth (requires Google Cloud Console setup)  
❌ SMS phone verification (requires AT secrets deployment)  
❌ Company directory (no real companies)  
❌ Placeholder testimonials  
❌ Browser push notification delivery  
❌ Email delivery (SES not confirmed)  
