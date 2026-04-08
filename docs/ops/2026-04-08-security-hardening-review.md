# AfriTalent Security Hardening Review

Date: 2026-04-08

## Scope

- Guest-session auth noise cleanup on the frontend/backend boundary
- Backend middleware hardening
- Dependency vulnerability review for `backend/` and `frontend/`
- Terraform validation and baseline infrastructure control review

## Scans Run

- `cd backend && npm audit --json`
- `cd frontend && npm audit --json`
- `cd backend && npm test -- --run src/__tests__/auth-api.test.ts src/__tests__/security-middleware.test.ts`
- `cd backend && npm run build`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- `cd frontend && npm run test:unit:ci`
- `cd infra/terraform && terraform init -backend=false -input=false`
- `cd infra/terraform && terraform validate`
- `cd infra/terraform && terraform fmt -check -recursive`

## Fixes Implemented

### 1. Guest auth probe cleanup

- `GET /api/auth/me` now returns a clean anonymous session payload instead of a `401` for visitors without a session.
- Frontend auth bootstrap now consumes that payload without treating anonymous visitors as an error case.

Result:
- anonymous jobs-page visits stop generating expected-but-noisy auth failures
- badge polling still remains protected behind authenticated UI paths

### 2. Rate limiting hardening

- Added explicit IPv6-safe key generation to the general, auth, registration, and password-reset rate limiters.
- This reduces exposure to client-key bypass behavior around IPv4-mapped IPv6 addresses.

### 3. Request sanitization hardening

- Sanitization now deletes unsafe object keys:
  - `__proto__`
  - `prototype`
  - `constructor`
- Nested objects and arrays are sanitized consistently.

Result:
- reduced prototype-pollution risk on request bodies and query objects

### 4. Stronger verification-code generation

- Trust OTP generation now uses `crypto.randomInt()` instead of `Math.random()`.

### 5. Dependency refresh

Updated or pinned:

- `frontend`
  - `next` -> `16.2.3`
  - `eslint-config-next` -> `16.2.3`
  - overrides for `flatted` and `handlebars`
- `backend`
  - `express-rate-limit` -> `8.3.2`
  - AWS SDK packages refreshed
  - overrides for `@xmldom/xmldom`, `fast-xml-parser`, `path-to-regexp`, and `undici`

## Tests Added

- `backend/src/__tests__/security-middleware.test.ts`

Coverage added:

- strips control characters from nested request input
- removes prototype-pollution keys before downstream code consumes them

## Remaining Dependency Risk

### Backend

`npm audit` still reports unresolved moderate transitive findings tied mostly to the AWS SDK advisory chain and `fast-xml-parser`.

Notes:

- the installed SDK versions are already newer than the package versions cited in the advisory fix hint
- the advisory range still flags the current dependency graph
- this appears to require an upstream ecosystem resolution rather than a repo-local code fix

Also remaining:

- low-severity `qs` advisory in transitive tooling
- moderate `brace-expansion` advisory in transitive tooling

### Frontend

`npm audit` is reduced to two remaining transitive issues:

- `brace-expansion`
- `picomatch`

These are currently coming from tooling/dev dependencies rather than the production runtime bundle.

## Infrastructure Controls Confirmed

Observed in Terraform:

- RDS is private (`publicly_accessible = false`)
- RDS storage encryption is enabled
- RDS deletion protection is enabled in staging and prod tfvars
- RDS final snapshots are preserved
- S3 uploads bucket blocks public access
- S3 uploads bucket uses KMS encryption
- CloudWatch log groups use KMS encryption and retention settings
- Synthetic canaries and CloudWatch alerting are configured

## SOC 2 Readiness Gaps Still Open

This repo is more secure after this pass, but it is not enough to truthfully claim SOC 2 compliance yet.

Still needed outside or beyond code:

- enforced SSO + MFA posture for AWS, GitHub, Stripe, Flutterwave, and admin tooling
- formal access reviews and least-privilege evidence
- security awareness, onboarding, and offboarding controls
- documented vulnerability-management cadence and remediation SLAs
- centralized audit-log review procedure with retained evidence
- backup restore testing and disaster-recovery evidence
- vendor management and subprocessor review records
- incident-response runbooks with exercised tabletop evidence
- change-management approvals and deployment evidence trails
- production secret rotation policy and rotation evidence
- independent penetration testing and remediation tracking
- policy set: access control, change management, incident response, backup/DR, vendor management, asset management

## Recommended Next Steps

1. Deploy the guest-session cleanup and middleware hardening to staging.
2. Upgrade the local/CI Node runtime to the latest Node 20 LTS patch level before another dependency pass.
3. Re-run audits after the next AWS SDK and tooling transitive releases land.
4. Add WAF / edge filtering review for public production endpoints before go-live.
5. Build a SOC 2 control matrix and evidence tracker tied to AWS, GitHub Actions, App Runner, RDS, and support tooling.
