# Workstream A — Security & Billing Triage (verified against HEAD)

**Date:** 2026-06-09 · **Branch:** `develop` @ `8af06d0` · **Method:** every finding re-verified in code; file:line refs are current.

## Status legend
CONFIRMED = exploitable/present as described · WORSE = present and more severe than brief · FIXED = already remediated on develop · PARTIAL = partially remediated

---

## HIGH — launch blockers

### H1 — Flutterwave webhook signature optional — **CONFIRMED**
- `backend/src/routes/webhooks.ts:154-160`: `if (secretHash && signature !== secretHash)` — if `FLUTTERWAVE_SECRET_HASH` unset, signature check is skipped entirely and the handler proceeds to activate subscriptions.
- `backend/src/lib/flutterwave.ts:5`: secret defaults to `""` (falsy) — no startup enforcement.
- `backend/src/config/env.ts`: `validateRuntimeEnv()` requires only `DATABASE_URL`, `FRONTEND_URL`, `JWT_SECRET` — not the Flutterwave hash.
- Mitigation present: `charge.completed` path re-verifies the transaction server-side via `verifyFlutterwaveTransaction(data.id)` (line 189), which limits forged-activation impact — but `subscription.cancelled` (lines 267-300) takes effect with **no verification**: a forged unsigned webhook can cancel any user's subscription by email (DoS/abuse).
- **Fix:** fail-fast at startup when Flutterwave is enabled and hash unset; always 401 unsigned/mismatched; test asserting unsigned → 401.

### H2 — Admin TOTP grace window — **WORSE: admin MFA does not exist on develop**
- `middleware/admin-totp-gate.ts` does not exist. Zero TOTP/MFA/otplib/speakeasy hits in `backend/src` (only SMS OTP in `phone-verification.ts`).
- Admin surface is gated solely by JWT + `Role.ADMIN` + `AdminRole.isActive` RBAC (`backend/src/middleware/admin-rbac.ts:22-56`).
- The brief's "admin TOTP MFA working with 7-day grace" appears to describe an unmerged branch. A stolen admin credential currently grants full admin console access with no second factor.
- **Fix:** implement admin TOTP gate (or confirm/merge the branch that had it). Until then, this is the largest single auth risk.

### H3 — Subscription status not whitelisted — **FIXED in middleware; residual risk**
- `backend/src/middleware/subscription.ts:33-46`: now a whitelist — access only if `plan === FREE` or `status === ACTIVE`. CANCELLED/PAST_DUE/PENDING/INACTIVE are denied.
- The brief's second site (`routes/applications.ts:363-365`) no longer references subscription status — code moved/refactored.
- **Residual:** verify all paid gating goes through `requirePlan` or entitlements (`syncBillingEntitlementState`); add per-status tests (none found asserting CANCELLED → 403).

### H4 — Dependency advisories — **CONFIRMED**
- Backend `npm audit`: **1 critical** (`vitest`, direct, dev), **1 high** (`fast-xml-builder`, transitive), 7 moderate (`qs`, `fast-xml-parser`, `express-rate-limit` direct, etc.). All have fixes available.
- Frontend: **2 high** — `next` (direct, production) and `fast-uri`; 9 moderate (`hono`, `uuid`, `ws`, `qs`, …).
- **Fix:** upgrade `next` (prod-facing, highest priority), vitest, then `npm audit fix` the transitives; make HIGH+ a hard CI gate.

---

## MEDIUM

### M1 — Webhook idempotency in-memory fallback — **CONFIRMED**
- `webhooks.ts:20-73`: Redis used if present, but any Redis error **silently** falls back to in-memory `Set` (lines 55-57), which is empty after restart → duplicate processing/double-activation possible.
- No `REDIS_REQUIRED` enforcement exists anywhere in `backend/src` (brief's "verify enforcement" — it's absent). `lib/redis.ts` logs a warning and continues if `REDIS_URL` unset; JWT blocklist is also fail-open.
- **Fix:** require Redis in production (fail-fast), plus DB-backed final fallback (unique constraint on dedup key in `BillingEventAudit`).

### M2 — File-upload scope from request body — **MOSTLY FIXED**
- `routes/files.ts:58-77`: client still sends `scope`, but it's validated against role (`scopeRoleMap`) and the S3 key is server-derived and always prefixed with the caller's `userId`. KMS SSE on. 5-min expiry, content-type and 10MB caps enforced.
- **Residual:** confirm the S3 bucket policy denies writes outside the user prefix (infra-level, not verifiable from app code); presign doesn't pin checksum, so uploaded bytes aren't validated server-side.

### M3 — Rate-limit user/IP fallback — **CONFIRMED (worse than described: user keying never engages)**
- The user-keyed limiters are mounted **before** `authenticate`, so `req.user` is always undefined at limiter time → keying is effectively always per-IP:
  - `app.ts:405-410`: `orchestratorLimiter` at app mount, before route-level `authenticate` (`routes/orchestrator.ts:118-120`).
  - `routes/skills/resume-builder.ts:62-66`: `generateLimiter` listed before `authenticate` in the middleware chain.
- Impact: shared-NAT users (common in target markets) share one budget (availability); IP-rotating attackers get fresh budgets (cost) — partially mitigated by post-auth `checkDailyQuota`.
- **New finding (M3b):** `security.ts:36-43` + `bot-protection.ts:19` trust the client-spoofable header `x-afritalent-internal-fetch: server-public-api` to bypass the general rate limiter and bot protection for `GET /api/jobs*` and `/api/public/stats`. Anyone can set this header. Replace with a shared secret header or IP allowlist from the frontend server.
- **Fix:** move limiters after `authenticate` (keep a separate stricter anonymous limiter), fix the bypass header.

### M4 — Password-reset tokens — **FIXED (verified)**
- `routes/password-reset.ts`: tokens stored SHA-256 hashed (14-15), prior tokens invalidated on reissue (44-45), single-use via `usedAt` (111-113), expiry enforced (116). `passwordResetLimiter` 3/hr.
- **Minor:** bcrypt cost 10 here vs 12 at registration (line 121) — harmonize; no purge job for expired token rows (hygiene); confirm existing sessions/JWTs are revoked on successful reset.

### M5 — Price catalog validation — **PARTIAL (brief is stale on the details)**
- The committed JSON files named in the brief don't exist. Catalogs come from env vars `STRIPE_PRICE_CATALOG_JSON` / `FLUTTERWAVE_PLAN_CATALOG_JSON`, parsed in `lib/billing/provider-catalog.ts:5-22`.
- Malformed/missing JSON **silently** returns `{}` → checkout resolves no price id and fails at runtime, not deployment. No Zod validation, no startup check, no region-completeness check.
- No secrets in committed catalog code (only a default display-price table in `default-price-catalog.ts`).
- **Fix:** Zod-validate both env catalogs at startup; in production fail-fast when billing is enabled and the catalog is empty/incomplete for the three regions.

---

## LOW (spot-checked)
- **L1 CSP:** `security.ts:9-19` — `styleSrc 'unsafe-inline'` present in all envs; scriptSrc is `'self'` (good). Harden as planned.
- **L2 Pino redaction:** `lib/logger.ts:10-22` — covers authorization/cookie/password/token/secret but **not** phone numbers or email fields. Brief's concern stands.

## Brief-drift corrections (update the operating brief)
- `lib/apply/dispatch.ts`, `ASSISTED_REDIRECT`, and `middleware/admin-totp-gate.ts` don't exist on `develop`. Apply-related code lives in `routes/quick-apply.ts`, `routes/autopilot.ts`, `routes/ats.ts`, `routes/ats-webhooks.ts` — Workstream B re-audit needed before that work starts.
- `applications.ts` ownership checks: employer-update path returns 404 for non-owned (372-374), `GET /:id` returns 403 (455-461) — inconsistent; standardize (the brief's bug #5, confirmed in inverted form).

## Recommended PR sequence
1. **PR A1 — H1:** Flutterwave signature mandatory + startup fail-fast + tests. (smallest, highest fraud impact)
2. **PR A2 — M1:** Redis required in prod + DB-backed idempotency fallback + tests.
3. **PR A3 — M3/M3b:** limiter ordering + internal-fetch header secret + tests.
4. **PR A4 — H4:** dependency upgrades (`next` first), CI hard gate on HIGH+.
5. **PR A5 — M5:** Zod-validated catalogs + startup checks.
6. **PR A6 — H2:** admin TOTP gate (largest; needs decision: build fresh or locate/merge prior branch).
7. **PR A7 — sweeps:** IDOR consistency (403/404 standardization) + PII-in-response audit + L1/L2 hardening.

## Open questions for Godwill
- H2: was admin TOTP built on a branch that never merged (check `origin/claude/*` branches / old PRs), or does it need building from scratch?
- Is Flutterwave actually enabled in staging today (is `FLUTTERWAVE_SECRET_HASH` set in the live env)? Determines whether H1 is currently exploitable live.
- Confirm Redis exists in staging/prod infra (brief §G says Redis module is commented out in Terraform — if so, M1's "require Redis" needs infra work first).
