# AfriTalent Security Audit Report

**Date:** 2026-05-06
**Auditor:** Security Engineer (Agentic AI)
**Branch:** `agentic-engineering-team-bootstrap`
**Scope:** Full-stack application, infrastructure, CI/CD, secrets management

---

## Executive Summary

This audit scanned the AfriTalent repository for secrets, dependency vulnerabilities, authentication weaknesses, file-upload risks, and infrastructure misconfigurations. **Four critical findings require immediate action**, including **live API key exposure** (BACKLOG-5 confirmed), a **hardcoded JWT fallback secret**, and **missing OAuth state validation**. Several high-severity dependency vulnerabilities and the **complete absence of CSRF protection** are pre-production blockers.

**Positive controls observed:**
- `.env` files are correctly `.gitignore`d; gitleaks CI is active.
- S3 buckets block public access and use KMS encryption with versioning.
- RDS is not publicly accessible and uses encrypted storage.
- Security groups enforce least-privilege ingress (ALB → ECS → RDS).
- GitHub Actions uses OIDC federation (no long-lived AWS credentials).
- Comprehensive rate-limiting coverage (auth, registration, OTP, AI skills, orchestrator).
- Bot protection (honeypot + timing + user-agent analysis) on auth endpoints.
- Request sanitization mitigates prototype pollution and control-character injection.

---

## Critical Findings (Immediate Action Required)

### CRIT-1: Live API Keys Exposed in `backend/.env` (BACKLOG-5 CONFIRMED)

| Attribute | Value |
|-----------|-------|
| **File** | `backend/.env` |
| **Risk** | Financial loss, data exfiltration, unauthorized AI model access, account takeover via Africa's Talking SMS |
| **Fix ETA** | **Immediate (rotate keys within 1 hour)** |

**Details:**
The local `.env` file contains **live, non-example API keys**:

```
OPENAI_API_KEY="[REDACTED_OPENAI_KEY]"
ANTHROPIC_API_KEY="[REDACTED_ANTHROPIC_KEY]"
AT_API_KEY="[REDACTED_AFRICAS_TALKING_KEY]"
```

- The OpenAI key is a **project-scoped production key** (`sk-proj-`).
- The Anthropic key is a **live API key** (`sk-ant-api03-`).
- The Africa's Talking key is a **live sandbox API key** (`atsk_...`).

**Impact:** Anyone with read access to the working directory can extract these keys and incur unlimited API costs, exfiltrate embedding data, or send SMS messages.

**Remediation:**
1. **Rotate all three keys immediately** in their respective provider dashboards.
2. Replace `backend/.env` values with empty strings or clearly fake placeholders (e.g., `sk-proj-REPLACE_ME`).
3. Run `git log --all --source --full-history -S '<old_key>'` to confirm these specific key values have never been committed. (Confirmed clean during this audit.)
4. Add `.env` to `.gitleaks.toml` **only** as an allowlist path if needed for local dev scanning, but ensure the actual file is never committed.
5. Consider using a secrets manager (1Password, Bitwarden) or `direnv` with local-only files outside the repo.

---

### CRIT-2: Hardcoded JWT Fallback Secret in Source Code

| Attribute | Value |
|-----------|-------|
| **File** | `backend/src/lib/jwt.ts:10` |
| **Risk** | Token forgery, complete authentication bypass if `JWT_SECRET` env var is missing |
| **Fix ETA** | **Immediate** |

**Details:**
```typescript
const FALLBACK_SECRET = "dev-only-secret-change-in-production";
const SECRET = JWT_SECRET || FALLBACK_SECRET;
```

While the code throws if `JWT_SECRET` is missing in production, the fallback still exists in the compiled artifact. If the env var is accidentally unset during a deployment, container restart, or local staging misconfiguration, an attacker can forge valid JWTs using this publicly known string.

**Remediation:**
- Remove `FALLBACK_SECRET` entirely.
- Change to:
  ```typescript
  const SECRET = JWT_SECRET;
  if (!SECRET) {
    throw new Error("JWT_SECRET must be set");
  }
  ```
- Ensure `validateRuntimeEnv()` in `backend/src/config/env.ts` is called **before** any JWT operations at server startup.

---

### CRIT-3: Missing OAuth State Parameter Validation (Google OAuth)

| Attribute | Value |
|-----------|-------|
| **File** | `backend/src/routes/oauth.ts:89-130` |
| **Risk** | OAuth CSRF / account linking attacks |
| **Fix ETA** | **Immediate** |

**Details:**
The Google OAuth callback endpoint (`POST /api/auth/oauth/google/callback`) accepts `code` and `redirectUri` but **never validates a `state` parameter**. This allows an attacker to initiate an OAuth flow with their own account, then trick a victim into completing the callback, potentially linking the victim's AfriTalent account to the attacker's Google identity.

**Remediation:**
1. Generate a cryptographically random `state` token before redirecting to Google.
2. Store it server-side (session, Redis, or signed cookie) with a short TTL (5 minutes).
3. In the callback, reject the request if the returned `state` does not match the stored value.

---

### CRIT-4: Apple ID Token Not Cryptographically Verified

| Attribute | Value |
|-----------|-------|
| **File** | `backend/src/routes/oauth.ts:143-184` |
| **Risk** | Complete authentication bypass for Apple OAuth users |
| **Fix ETA** | **Immediate** |

**Details:**
The Apple callback manually base64-decodes the ID token payload:
```typescript
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT");
  const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
  return JSON.parse(payload);
}
```

**There is NO signature verification against Apple's public keys.** An attacker can craft a forged ID token with any `sub` and `email`, submit it to the callback, and authenticate as any user.

**Remediation:**
- Use a library such as `jsonwebtoken` or `jose` to verify the Apple ID token signature against Apple's JWKS endpoint (`https://appleid.apple.com/auth/keys`).
- Verify the `iss`, `aud`, and `exp` claims.

---

## High Findings (Pre-Production Blockers)

### HIGH-1: Complete Absence of CSRF Protection

| Attribute | Value |
|-----------|-------|
| **Files** | `backend/src/app.ts`, `backend/src/routes/auth.ts`, `backend/src/routes/oauth.ts` |
| **Risk** | Cross-Site Request Forgery on all state-changing endpoints |
| **Fix ETA** | Before production launch |

**Details:**
- No CSRF middleware (e.g., `csurf`, `double-csrf`) is installed.
- The auth cookie is set with `sameSite: "none"` in production (required for cross-domain App Runner services) but **without any compensating CSRF token mechanism**.
- Any authenticated user visiting a malicious site can have state-changing requests forged on their behalf (account updates, job applications, billing actions).

**Remediation:**
1. Implement Double Submit Cookie pattern or Synchronizer Token pattern.
2. Recommended: use `csrf-csrf` or `double-csrf` packages.
3. For the cross-domain cookie scenario, a Double Submit Cookie is the most practical:
   - Set a secondary cookie (`csrf_token`) with `sameSite=none; secure; httpOnly=false`.
   - Require the frontend to read this cookie and send its value in an `X-CSRF-Token` header on every mutating request.
   - The backend validates that the header value matches the cookie value.

---

### HIGH-2: Dependency Vulnerabilities — Backend (7 vulnerabilities)

| Attribute | Value |
|-----------|-------|
| **File** | `backend/package.json` / `package-lock.json` |
| **Risk** | DoS, XSS, XML injection |
| **Fix ETA** | Before production launch |

**Details:**

| Package | Severity | CVE / Advisory | Impact |
|---------|----------|----------------|--------|
| `express-rate-limit` 8.0.1–8.5.0 | Moderate | GHSA-v2v4-37r5-5v8g (via `ip-address`) | XSS in IPv6 HTML-emitting methods |
| `ip-address` ≤10.1.0 | Moderate | GHSA-v2v4-37r5-5v8g | XSS in Address6 HTML-emitting methods |
| `fast-xml-parser` ≤5.6.0 | Moderate | GHSA-jp2q-39xq-3w4g, GHSA-gh4j-gqv2-49f6 | Entity expansion bypass, XML comment/CDATA injection |
| `postcss` <8.5.10 | Moderate | GHSA-qx2v-qp2m-jg93 | XSS via unescaped `</style>` in CSS stringify output |
| `brace-expansion` 4.0.0–5.0.4 | Moderate | GHSA-f886-m6hf-6m8v | DoS via zero-step sequence (hang + memory exhaustion) |
| `qs` 6.7.0–6.14.1 | Low | GHSA-w7fw-mjwx-w883 | arrayLimit bypass causing DoS |

**Remediation:**
- Run `cd backend && npm audit fix`.
- If `express-rate-limit` update is blocked by API changes, upgrade `ip-address` independently or pin `express-rate-limit` to ≥8.5.1.
- Verify `fast-xml-parser` is updated to ≥5.7.0.

---

### HIGH-3: Dependency Vulnerabilities — Frontend (7 vulnerabilities)

| Attribute | Value |
|-----------|-------|
| **File** | `frontend/package.json` / `package-lock.json` |
| **Risk** | DoS, XSS, HTML injection |
| **Fix ETA** | Before production launch |

**Details:**

| Package | Severity | CVE / Advisory | Impact |
|---------|----------|----------------|--------|
| `next` 9.3.4-canary.0 – 16.3.0-canary.5 | Moderate | GHSA-qx2v-qp2m-jg93 (via `postcss`) | XSS via unescaped `</style>` |
| `@sentry/nextjs` ≥6.3.6 | Moderate | (depends on vulnerable `next`) | Indirect XSS risk |
| `hono` ≤4.12.15 | Moderate | GHSA-9vqf-7f2p-gf9v, GHSA-69xw-7hcm-h432 | bodyLimit bypass, unvalidated JSX tag names allowing HTML injection |
| `brace-expansion` | Moderate | GHSA-f886-m6hf-6m8v | DoS (multiple versions affected) |
| `ip-address` via `express-rate-limit` | Moderate | GHSA-v2v4-37r5-5v8g | XSS |

**Remediation:**
- Run `cd frontend && npm audit fix`.
- `next` update may be a semver-major change; test thoroughly before upgrading.
- Remove `hono` if it is an unused transitive dependency, or upgrade to ≥4.12.16.

---

### HIGH-4: S3 IAM Policy Prefix Mismatch

| Attribute | Value |
|-----------|-------|
| **File** | `infra/terraform/modules/s3/main.tf:100-136` |
| **Risk** | Verification document uploads fail OR policy has been manually widened (drift) |
| **Fix ETA** | Before production launch |

**Details:**
The IAM policy attached to the ECS task role only grants `s3:PutObject/GetObject/DeleteObject` on:
```
${aws_s3_bucket.uploads.arn}/resumes/*
```

However, `backend/src/routes/files.ts:72-73` generates keys for:
```
trust/candidates/${userId}
trust/employers/${userId}
```

These prefixes are **not** covered by the Terraform-managed IAM policy.

**Remediation:**
- Update the IAM policy in `infra/terraform/modules/s3/main.tf` to include:
  ```json
  "Resource": [
    "${aws_s3_bucket.uploads.arn}/resumes/*",
    "${aws_s3_bucket.uploads.arn}/trust/*"
  ]
  ```
- Update the `ListBucket` condition to include `"trust/*"`.
- If the policy has already been manually widened in AWS, reconcile the drift with `terraform plan`.

---

## Medium Findings (Fix Within 30 Days)

### MED-1: CORS `null` Origin Allowed in Production

| Attribute | Value |
|-----------|-------|
| **File** | `backend/src/app.ts:135-150` |
| **Risk** | Malicious iframe / sandboxed origin attacks |

**Details:**
```typescript
if (!origin) {
  // Non-browser callers such as App Runner health checks won't send Origin.
  return true;
}
```

Browsers sending `Origin: null` (e.g., from `file://` origins, sandboxed iframes, or redirect chains) are allowed. In a production API, `null` origins should be explicitly rejected unless required for a known legitimate use case.

**Remediation:**
- Reject `null` origins in production:
  ```typescript
  if (!origin) {
    return !isProduction; // allow missing origin only in dev
  }
  ```

---

### MED-2: `ALLOWED_ORIGIN_REGEX` Allows Unvalidated Regex Injection

| Attribute | Value |
|-----------|-------|
| **File** | `backend/src/app.ts:131-133` |
| **Risk** | Accidental CORS bypass via malformed regex |

**Details:**
```typescript
const allowedOriginRegex = process.env.ALLOWED_ORIGIN_REGEX
  ? new RegExp(process.env.ALLOWED_ORIGIN_REGEX)
  : null;
```

An operator could accidentally set `ALLOWED_ORIGIN_REGEX=.*`, allowing all origins. There is no validation that the regex is restrictive.

**Remediation:**
- Validate the regex against a deny-list of overly permissive patterns (e.g., `.*`, `.+`).
- Log a warning at startup if the regex matches more than a reasonable number of test origins.

---

### MED-3: Redis Token Blocklist is Fail-Open

| Attribute | Value |
|-----------|-------|
| **File** | `backend/src/lib/redis.ts:53-60` |
| **Risk** | Revoked tokens remain valid during Redis outages |

**Details:**
If Redis is unreachable, `isTokenBlocked()` returns `false`, so revoked tokens are still accepted. This is an availability-vs-security trade-off, but it means a Redis outage extends the lifetime of all previously revoked tokens.

**Remediation:**
- Accept the trade-off but add **monitoring and alerting** on Redis connectivity.
- Consider a short-lived in-memory LRU cache of recent blocklist entries as a fallback.

---

### MED-4: No Malware Scanning on File Uploads

| Attribute | Value |
|-----------|-------|
| **File** | `backend/src/routes/files.ts` |
| **Risk** | Malicious PDF/DOCX files stored in S3; potential downstream exploitation |

**Details:**
The upload flow validates `Content-Type` and `Content-Length` but does not scan files for malware, embedded scripts, or macros. If these files are later served to recruiters or admins, they could trigger exploitation.

**Remediation:**
- Integrate AWS Lambda + ClamAV or a service like VirusTotal / MetaDefender for async scanning.
- Tag unscanned objects with a `scanStatus=pending` metadata flag; block downloads until `scanStatus=clean`.

---

### MED-5: `decodeToken` Exported Without Verification

| Attribute | Value |
|-----------|-------|
| **File** | `backend/src/lib/jwt.ts:60-63` |
| **Risk** | Accidental use in authorization logic leading to bypass |

**Details:**
```typescript
export function decodeToken(token: string): JWTPayload | null {
  const decoded = jwt.decode(token);
  return decoded as JWTPayload | null;
}
```

This function decodes a JWT without verifying its signature. While it is documented as "for debugging," it is exported and could be mistakenly used in a future feature.

**Remediation:**
- Remove `decodeToken` from the public API, or rename it to `unsafeDecodeTokenForDebuggingOnly` to make misuse obvious.

---

### MED-6: bcrypt Cost Factor is 10

| Attribute | Value |
|-----------|-------|
| **File** | `backend/src/routes/auth.ts:147`, `backend/src/routes/password-reset.ts:121` |
| **Risk** | Password hashes more crackable than modern best practice |

**Details:**
Passwords are hashed with `bcrypt.hash(password, 10)`. OWASP currently recommends a minimum work factor of 10, but 12 is preferred for 2025+ hardware.

**Remediation:**
- Increase to 12: `bcrypt.hash(password, 12)`.
- Existing hashes will be re-hashed on next password change; no migration needed.

---

## Low Findings (Nice to Have)

### LOW-1: Helmet `crossOriginEmbedderPolicy` Disabled

| Attribute | Value |
|-----------|-------|
| **File** | `backend/src/middleware/security.ts:20` |
| **Risk** | Very low for a JSON API |

**Details:**
`crossOriginEmbedderPolicy: false` is set for API compatibility. For a JSON API that does not serve HTML or embed cross-origin resources, this is acceptable. If the API ever serves user-generated HTML content, re-enable it.

---

### LOW-2: Swagger Docs Exposed in Non-Production

| Attribute | Value |
|-----------|-------|
| **File** | `backend/src/app.ts:93,368-401` |
| **Risk** | Information disclosure (endpoint schemas, parameter shapes) |

**Details:**
```typescript
const docsEnabled = process.env.ENABLE_API_DOCS === "true" || !isProduction;
```

Staging environments expose the full OpenAPI spec and Swagger UI. This aids attacker reconnaissance.

**Remediation:**
- Require explicit opt-in even in staging:
  ```typescript
  const docsEnabled = process.env.ENABLE_API_DOCS === "true";
  ```

---

### LOW-3: Health Check Exposes Service Metadata

| Attribute | Value |
|-----------|-------|
| **File** | `backend/src/app.ts:182-233` |
| **Risk** | Minor information disclosure |

**Details:**
`/health` returns `environment`, `release`, `commitSha`, and dependency statuses. This helps attackers map the attack surface.

**Remediation:**
- Return a minimal `{ "status": "ok" }` on public health endpoints.
- Move detailed metadata to an authenticated `/api/admin/health` endpoint.

---

### LOW-4: Flutterwave KYC Status

| Attribute | Value |
|-----------|-------|
| **File** | N/A (operational concern) |
| **Risk** | Billing failures for Nigerian users |

**Details:**
The local `.env` does not contain Flutterwave keys, so the "TEST MODE" concern applies to the **staging/production environment** rather than this repo. Confirm that:
1. Flutterwave dashboard KYC is completed before go-live.
2. `FLUTTERWAVE_SECRET_KEY` in staging uses Flutterwave test keys, not live keys, unless explicit approval has been given.

---

## Infrastructure Security Review

### Terraform / AWS

| Component | Finding | Status |
|-----------|---------|--------|
| **RDS** | `publicly_accessible = false`; encrypted; in private subnets | ✅ Secure |
| **S3 uploads bucket** | Public access blocked; KMS SSE; versioning enabled; lifecycle rules | ✅ Secure |
| **Security Groups** | ALB: 0.0.0.0/0 on 80/443 (required); ECS: only from ALB; RDS: only from ECS on 5432 | ✅ Secure |
| **GitHub Actions OIDC** | `StringLike` condition on `token.actions.githubusercontent.com:sub` with repo + ref | ✅ Secure |
| **GitHub Actions workflow** | No hardcoded secrets; uses `${{ secrets.* }}` and `${{ vars.* }}` | ✅ Secure |
| **S3 IAM policy** | Prefix mismatch (`resumes/*` only, app uses `trust/*`) | ❌ See HIGH-4 |

### CI/CD

| Component | Finding | Status |
|-----------|---------|--------|
| **Gitleaks scan** | Runs on push/PR to `main` and `develop` | ✅ Secure |
| **Dependency review** | Runs on PRs | ✅ Secure |
| **Deployment gates** | Staging only from `develop`; prod only from `main` + environment approval | ✅ Secure |

---

## Secrets Scanning Results

| Tool | Result |
|------|--------|
| **Gitleaks (git history)** | No leaks found across 249 commits |
| **Gitleaks (no-git, full tree)** | No leaks found |
| **Manual grep** | Live keys found in `backend/.env` (disk only, not tracked) |
| **`.gitignore`** | `.env` and `.env.*` are properly ignored |

**Conclusion:** The secrets are **not in git history**, which is good, but they are **present on the local filesystem** and must be rotated immediately.

---

## Recommended Remediation Priority

| Priority | Finding | Owner |
|----------|---------|-------|
| **P0** | Rotate OpenAI, Anthropic, and AT API keys | DevOps / Security |
| **P0** | Remove hardcoded `FALLBACK_SECRET` from `jwt.ts` | Backend Engineer |
| **P0** | Add OAuth `state` validation for Google | Backend Engineer |
| **P0** | Verify Apple ID token signature against Apple JWKS | Backend Engineer |
| **P1** | Implement CSRF protection (Double Submit Cookie) | Backend + Frontend Engineer |
| **P1** | Run `npm audit fix` in backend and frontend | Backend + Frontend Engineer |
| **P1** | Fix S3 IAM policy prefix mismatch in Terraform | DevOps Engineer |
| **P2** | Reject `null` CORS origin in production | Backend Engineer |
| **P2** | Validate `ALLOWED_ORIGIN_REGEX` restrictiveness | Backend Engineer |
| **P2** | Remove or rename `decodeToken` | Backend Engineer |
| **P2** | Increase bcrypt cost factor to 12 | Backend Engineer |
| **P2** | Add malware scanning pipeline for S3 uploads | Backend / DevOps Engineer |
| **P3** | Disable Swagger docs by default in staging | Backend Engineer |
| **P3** | Minimize health check metadata exposure | Backend Engineer |

---

## Appendix: Files Reviewed

- `backend/src/middleware/security.ts`
- `backend/src/middleware/auth.ts`
- `backend/src/middleware/bot-protection.ts`
- `backend/src/routes/oauth.ts`
- `backend/src/routes/auth.ts`
- `backend/src/routes/files.ts`
- `backend/src/routes/password-reset.ts`
- `backend/src/routes/webhooks.ts`
- `backend/src/lib/jwt.ts`
- `backend/src/lib/redis.ts`
- `backend/src/lib/stripe.ts`
- `backend/src/lib/flutterwave.ts`
- `backend/src/app.ts`
- `backend/src/server.ts`
- `backend/src/config/env.ts`
- `backend/prisma/schema.prisma` (partial)
- `backend/.env`
- `backend/.env.example`
- `frontend/.env.local`
- `frontend/.env.example`
- `infra/terraform/modules/s3/main.tf`
- `infra/terraform/modules/rds/main.tf`
- `infra/terraform/modules/security/main.tf`
- `infra/terraform/modules/github-oidc/main.tf`
- `.github/workflows/security.yml`
- `.github/workflows/deploy-apprunner.yml`
- `.gitleaks.toml`
- `.gitignore`

---

*Report generated by Security Engineer Agent on 2026-05-06.*
