# Environment Variables Matrix — AfriTalent
> Last updated: Phase A expansion. All new vars from security hardening, AI, billing, storage, email.

---

## Backend — Core

| Variable | Required | Local | Staging | Production | Description |
|---|---|---|---|---|---|
| `NODE_ENV` | Yes | `development` | `staging` | `production` | Runtime environment |
| `PORT` | Yes | `4000` | `4000` | `4000` | Server port |
| `DATABASE_URL` | Yes | `postgresql://postgres:postgres@localhost:5432/afritalent` | Managed PG URL | Managed PG URL `?sslmode=require` | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Any 32+ char string | Random 64 chars | Random 64 chars | JWT signing key — generate with `openssl rand -base64 64` |
| `JWT_EXPIRES_IN` | No | `7d` | `7d` | `7d` | Token expiry |
| `FRONTEND_URL` | Yes | `http://localhost:3000` | `https://staging.afritalent.com` | `https://afritalent.com` | CORS allowed origin |
| `LOG_LEVEL` | No | `debug` | `info` | `info` | Pino log level |

---

## Backend — Security (Phase A — Gate A)

| Variable | Required | Local | Staging | Production | Description |
|---|---|---|---|---|---|
| `REDIS_URL` | Yes (P1) | `redis://localhost:6379` | Redis URL | Redis URL | JWT blocklist + quota cache. Falls back gracefully if unavailable. |
| `ALLOWED_CV_DOMAINS` | No | `""` (allow all HTTPS) | `s3.amazonaws.com,storage.googleapis.com` | `s3.amazonaws.com,storage.googleapis.com,drive.google.com` | Comma-separated allowlist for CV upload domains. Empty = any HTTPS accepted. |

---

## Backend — AWS S3 File Storage (Phase A — Track C)

| Variable | Required | Local | Staging | Production | Description |
|---|---|---|---|---|---|
| `AWS_REGION` | Yes (if S3 used) | `us-east-1` | `us-east-1` | `us-east-1` | AWS region for S3 + SES |
| `AWS_ACCESS_KEY_ID` | Local only | your key | — (IAM role) | — (IAM role) | Only needed in local dev. ECS uses IAM task role in staging/prod. |
| `AWS_SECRET_ACCESS_KEY` | Local only | your secret | — (IAM role) | — (IAM role) | Only needed in local dev. |
| `S3_UPLOADS_BUCKET` | Yes (if S3 used) | `""` | `afritalent-dev-uploads` | `afritalent-prod-uploads` | S3 bucket name for resume/file uploads. Returns 503 if unset. |

---

## Backend — AWS SES Email (Phase A — Track F)

| Variable | Required | Local | Staging | Production | Description |
|---|---|---|---|---|---|
| `SES_FROM_EMAIL` | Yes (if email used) | `""` (dev logs only) | `no-reply@afritalent.com` | `no-reply@afritalent.com` | Sender address. When unset in dev, emails are logged not sent. |
| `SES_REGION` | No | `us-east-1` | `us-east-1` | `us-east-1` | SES region. Defaults to `AWS_REGION` if unset. |

---

## Backend — AI Provider (Phase A — Track D)

| Variable | Required | Local | Staging | Production | Description |
|---|---|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (AI features) | your key | secret | secret | Claude API key. AI routes return 503 if unset. |
| `AI_PROVIDER` | No | `claude` | `claude` | `claude` | Active provider. Only `claude` supported in MVP. |
| `AI_FAST_MODEL` | No | `claude-haiku-4-5-20251001` | `claude-haiku-4-5-20251001` | `claude-haiku-4-5-20251001` | Model for bulk/parsing (resume parse, job extract). |
| `AI_QUALITY_MODEL` | No | `claude-sonnet-4-6` | `claude-sonnet-4-6` | `claude-sonnet-4-6` | Model for quality drafting (resume tailor, cover letter). |

---

## Backend — Stripe Billing (Phase A — Track E)

| Variable | Required | Local | Staging | Production | Description |
|---|---|---|---|---|---|
| `STRIPE_SECRET_KEY` | Yes (billing) | `sk_test_...` | `sk_test_...` | `sk_live_...` | Stripe API key. Billing routes throw if unset. |
| `STRIPE_WEBHOOK_SECRET` | Yes (webhooks) | `whsec_...` | `whsec_...` | `whsec_...` | Stripe webhook signing secret. Get from `stripe listen` output locally. |
| `STRIPE_PRICE_BASIC_MONTHLY` | Yes (billing) | `price_test_...` | `price_test_...` | `price_live_...` | Stripe Price ID for BASIC plan monthly. Create in Stripe dashboard. |
| `STRIPE_PRICE_PROFESSIONAL_MONTHLY` | Yes (billing) | `price_test_...` | `price_test_...` | `price_live_...` | Stripe Price ID for PROFESSIONAL plan monthly. |

---

## Frontend

| Variable | Required | Local | Staging | Production | Description |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | `http://localhost:4000` | `https://api-staging.afritalent.com` | `https://api.afritalent.com` | Backend API base URL |
| `NEXT_PUBLIC_APP_NAME` | No | `AfriTalent` | `AfriTalent (Staging)` | `AfriTalent` | App display name |

---

## E2E Testing Only (not deployed)

| Variable | Default | Description |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | Frontend URL for Playwright browser tests |
| `API_BASE_URL` | `http://localhost:4000` | Backend URL for Playwright API assertions |

---

## Terraform / Infrastructure

| Variable | Where set | Description |
|---|---|---|
| `domain_name` | `variables.tf` default | Primary domain (e.g. `afritalent.com`) |
| `frontend_url` | `variables.tf` default | Frontend URL for CORS config on S3 bucket |
| `aws_region` | `variables.tf` | AWS region for all resources |

---

## Secret Generation Reference

```bash
# JWT_SECRET (64 chars)
openssl rand -base64 64

# DATABASE_URL (local dev)
postgresql://postgres:postgres@localhost:5432/afritalent

# STRIPE local webhook secret (requires Stripe CLI)
stripe listen --forward-to localhost:4000/api/webhooks/stripe
# Outputs: whsec_xxxx — copy to STRIPE_WEBHOOK_SECRET

# Verify Redis connection
redis-cli -u redis://localhost:6379 ping
# Expected: PONG
```

---

## Secrets Management by Environment

| Environment | Method |
|---|---|
| Local dev | `.env` file (gitignored) |
| Staging | Platform secrets (Railway/Render/ECS task env) |
| Production | AWS Secrets Manager (already wired in Terraform `secrets` module) |

---

## Validation Checklist (run before each deploy)

- [ ] All `Required: Yes` variables are set
- [ ] No secrets committed to git (`git diff --staged | grep -i secret`)
- [ ] `DATABASE_URL` includes `?sslmode=require` in staging/prod
- [ ] `REDIS_URL` reachable (`redis-cli ping`)
- [ ] `STRIPE_WEBHOOK_SECRET` matches active endpoint in Stripe dashboard
- [ ] `SES_FROM_EMAIL` domain is verified in AWS SES (not sandbox)
- [ ] `ANTHROPIC_API_KEY` has sufficient credits
- [ ] `S3_UPLOADS_BUCKET` exists and ECS task role has `s3:PutObject` permission
- [ ] `JWT_SECRET` is unique per environment (never share across staging/prod)
- [ ] `FRONTEND_URL` matches exact CORS origin (no trailing slash)
