# Phase 1/2 Manual QA Checklist

## Pre-flight
- Confirm staging backend + frontend URLs.
- Confirm seeded test users exist (candidate, employer, admin).
- Confirm Stripe test mode keys/webhook secret are configured.
- Confirm email sender and inbox capture are configured (SES sandbox or test inbox).
- Confirm at least one `PUBLISHED` + one `isExpired=true` job in dataset.

## Functional
### Auth / OAuth / Email Verification
- Candidate register/login/logout works with secure cookie auth.
- Employer register creates employer profile and can access employer dashboard.
- OAuth buttons appear only when provider is enabled.
- OAuth mismatch: existing password account + wrong provider returns clear message.
- Email verification:
  - resend works
  - invalid token fails with clear UX
  - valid token marks account verified
  - unverified user blocked from billing/apply-sensitive actions

### Pricing / Billing / Entitlements
- Region selector updates pricing cards and currency display.
- `/api/pricing/me` reflects selected billing country.
- Checkout opens Stripe test checkout for valid plan.
- Invalid plan payload is rejected.
- Webhook updates subscription state and notification appears.
- FREE user sees upgrade prompts where applicable.

### Candidate / Employer Core Flows
- Candidate: browse jobs, filter, open detail, apply.
- Candidate: resume parser upload + apply draft requires explicit confirmation.
- Candidate: notifications unread count, list, mark read.
- Employer: create job, edit, view applications.
- Employer analytics page loads without JS errors.

### Search / Schema / Docs
- Job list excludes expired jobs.
- Job detail for expired/unpublished slug returns not found UX.
- Active job detail emits valid JobPosting JSON-LD.
- `/api/docs` and `/api/docs/spec.json` render.

### i18n
- Root route redirects to locale prefix.
- `en/fr/pt/ar` key pages resolve and nav translations appear.
- Locale switcher updates route and persists preference.

## Accessibility
- Keyboard-only navigation works across header/menu/forms.
- Focus ring visible on interactive controls.
- Form fields have labels and validation messages are announced.
- Dialogs and mobile drawer have proper roles/labels.
- Color contrast passes for primary buttons/links in light and dark themes.
- Screen-reader pass (VoiceOver/NVDA quick smoke) on home, login, jobs, pricing.
- Reduced-motion preference checked on key transitions.

## Performance
- Home and jobs page render with skeleton before data resolve.
- Simulated slow network still keeps UI responsive and actionable.
- API endpoints `/health`, `/api/jobs`, `/api/pricing` meet staging latency budget.
- Lighthouse run:
  - Performance >= 70
  - Accessibility >= 90
  - Best Practices >= 90
  - SEO >= 90

## Security / Resilience
- Repeated auth failures trigger rate limiting.
- Logout invalidates existing session token.
- Admin endpoints return 403 for candidate/employer tokens.
- Region tampering payload (`country=123`) rejected.
- Invalid Stripe signature rejected.
- Demo credentials are not visible in production build.
- OAuth/account-linking edge cases produce safe errors (no account takeover path).

## Visual Regression (Capture + Compare)
- Pricing page desktop + mobile.
- Login and register (including validation and OAuth states).
- Candidate dashboard, employer dashboard.
- Jobs list and job detail.
- Mobile drawer open state.
- Loading skeleton states.
- Dark mode screenshots for home, pricing, jobs.

## Exit Criteria
- All `AUTO` tests pass.
- No open `P0/P1` defects.
- `P2` defects triaged with owner and target release.
- Product + Engineering + QA sign-off completed in release checklist.
