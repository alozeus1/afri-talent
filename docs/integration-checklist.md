# Integration Checklist — Phase A

> Integrator: team-lead (the only agent that touches server.ts)
> Status: WAITING ON DONE REPORTS from all 7 agents

---

## Pre-Merge Requirements

Each track must provide a Done Report before its code is merged. Done Report format:
- Summary (2 sentences)
- Files changed
- How to test
- Risks / gaps
- Env vars added
- Migration safety (schema track only)
- Token risk rating

---

## Merge Order (strict — each builds on the previous)

```
1. Gate A  — security-lead        (auth middleware, routes — no schema dependency)
2. Gate B  — backend-schema       (schema + migrations — foundation for all routes)
3. Track C — infra-lead           (Terraform + routes/files.ts — no schema dependency)
4. Track D — ai-provider          (lib/ai/ — no schema dependency)
5. Track E — billing-lead         (lib/stripe.ts, routes/billing.ts, middleware/subscription.ts)
6. Track F — notifications-lead   (lib/email.ts, routes/notifications.ts)
7. Track G — frontend-test        (e2e tests — merged last, tests what's above)
```

**Why this order:**
- Gate A first: hardens auth before we add new endpoints
- Gate B second: Prisma types must be generated before billing/notifications can compile cleanly
- C + D can follow in any order (independent libraries)
- E + F depend on schema types from Gate B
- G tests everything — goes in last

---

## Integrator Steps (server.ts wiring — done ONCE after all tracks merge)

### 1. Stripe webhook — MUST be registered BEFORE express.json()

```typescript
// At the TOP of route registrations, before body-parser:
import webhookRoutes from "./routes/webhooks.js";
app.use("/api/webhooks", express.raw({ type: "application/json" }), webhookRoutes);
```

### 2. All other new routes — registered AFTER express.json()

```typescript
import profileRoutes from "./routes/profile.js";
import filesRoutes from "./routes/files.js";
import billingRoutes from "./routes/billing.js";
import notificationsRoutes from "./routes/notifications.js";

app.use("/api/profile", profileRoutes);
app.use("/api/files", filesRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/notifications", notificationsRoutes);
```

### 3. Verify no agent touched server.ts
```bash
git diff HEAD -- backend/src/server.ts
```
If any agent wrote to server.ts, revert those changes and apply manually via this checklist.

---

## Migration Safety Gates

Before running `prisma migrate dev`:

- [ ] Read the generated SQL in `backend/prisma/migrations/<timestamp>_add_platform_domain_models/migration.sql`
- [ ] Confirm: zero `DROP TABLE`, `DROP COLUMN`, `DROP INDEX` statements
- [ ] Confirm: zero `ALTER COLUMN ... SET NOT NULL` without a default (would fail on existing rows)
- [ ] Confirm: all new NOT NULL columns have a `DEFAULT` value
- [ ] Confirm: `prisma migrate dev` target is dev database only (`afritalent-dev`)
- [ ] Run against dev: `DATABASE_URL=<dev-url> npx prisma migrate dev`
- [ ] Run seed: `DATABASE_URL=<dev-url> npm run prisma:seed`
- [ ] Gate B smoke test: profile CRUD + resume metadata endpoints return expected shapes

---

## Post-Merge Gates (must all pass before Track G runs)

### Gate A — Security
```bash
# From frontend/
API_BASE_URL=http://localhost:4000 npx playwright test e2e/gate-a-security.spec.ts
```
Pass criteria:
- [ ] Login response has `Set-Cookie: auth_token=...; HttpOnly`
- [ ] No `token` key in localStorage after login
- [ ] Session survives hard reload
- [ ] POST /auth/logout → old token returns 401
- [ ] GET /api/jobs?limit=9999 → pagination.limit === 100
- [ ] POST /applications with http:// cvUrl → 400

### Gate B — Schema
```bash
API_BASE_URL=http://localhost:4000 npx playwright test e2e/gate-b-schema.spec.ts
```
Pass criteria:
- [ ] PUT /api/profile → 200 with correct shape
- [ ] GET /api/profile → 200 with all matchability fields
- [ ] POST /api/profile/resumes → 201 with s3Key + isActive
- [ ] POST /api/files/presign → 200 (with S3 configured) or 503 (without) — both acceptable
- [ ] GET /api/jobs returns `visaSponsorship`, `jobSource`, `eligibleCountries` fields

### Build gates (run before any merge)
```bash
cd backend && npm run build   # must be 0 TypeScript errors
cd frontend && npm run build  # must be 0 TypeScript errors
docker-compose up --build     # all services must reach healthy state
```

---

## ENV_MATRIX.md Status

- [x] Core backend vars (pre-existing)
- [x] Security vars: `REDIS_URL`, `ALLOWED_CV_DOMAINS`
- [x] S3 vars: `AWS_REGION`, `S3_UPLOADS_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- [x] SES vars: `SES_FROM_EMAIL`, `SES_REGION`
- [x] AI vars: `ANTHROPIC_API_KEY`, `AI_PROVIDER`, `AI_FAST_MODEL`, `AI_QUALITY_MODEL`
- [x] Stripe vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`
- [x] E2E vars: `BASE_URL`, `API_BASE_URL`

---

## Rollback Plan

If any migration causes issues on dev:

```bash
# Check migration status
cd backend && npx prisma migrate status

# Roll back last migration (dev only — destructive, dev DB only)
cd backend && npx prisma migrate reset --skip-seed  # WARNING: wipes dev DB

# Or: revert to previous schema state
git checkout HEAD~1 -- backend/prisma/schema.prisma
cd backend && npx prisma migrate dev --name rollback_phase_a
```

---

## Known Constraints

| Constraint | Reason |
|---|---|
| Stripe webhook MUST use `express.raw()` before `express.json()` | Stripe signature verification requires raw body bytes |
| `prisma generate` must run after schema changes before billing/notifications compile | TypeScript types from `@prisma/client` |
| `S3_UPLOADS_BUCKET` unset = graceful 503 (not a crash) | Designed for local dev without AWS credentials |
| Redis unavailable = graceful degradation (tokens not blocklisted) | Auth still works; revocation degrades silently |
| `SES_FROM_EMAIL` unset in dev = emails logged not sent | Dev-safe by design |

---

## Done Report Tracker

| Agent | Done Report Received | Server.ts Clean | Build Passes | Ready to Merge |
|---|---|---|---|---|
| security-lead | ⏳ | — | — | — |
| backend-schema | ⏳ | — | — | — |
| infra-lead | ⏳ | — | — | — |
| ai-provider | ⏳ | — | — | — |
| billing-lead | ⏳ | — | — | — |
| notifications-lead | ⏳ | — | — | — |
| frontend-test | ⏳ | N/A | — | — |

_Updated by team-lead as reports come in._
