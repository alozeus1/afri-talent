# Tech Stack

**Analysis Date:** 2026-04-09

## Languages & Runtimes

**Primary Language:** TypeScript 5.x
- Backend: `^5.3.3` (compiled to ES2022, `NodeNext` module resolution)
- Frontend: `^5` (Next.js app)
- Mobile: `^5.6.3` (Expo app)

**Runtime:**
- Node.js 20 (specified in backend `@types/node: ^20`, docker image targets Node 20)
- Target: `ES2022`, output module format `NodeNext`

**Secondary:**
- HCL (Terraform) — infra provisioning in `infra/terraform/`

## Frameworks

**Backend:**
- Express 5 (`^5.2.1`) — HTTP server, ESM module (`"type": "module"`)
- Entry: `backend/src/server.ts` → `backend/src/app.ts`
- Build output: `backend/dist/server.js`

**Frontend:**
- Next.js 16.2.3 — React SSR/SSG framework
- React 19.2.3 + React DOM 19.2.3
- Output mode: `standalone` (Docker-optimized)
- Config: `frontend/next.config.ts`

**Mobile:**
- Expo `~52.0.0`
- React Native 0.76.0
- React 18.3.1
- Entry: `expo/AppEntry`

## Database & ORM

**Database:** PostgreSQL 16 (Docker: `postgres:16-alpine`)
- Local default: `postgresql://postgres:postgres@localhost:5432/afritalent`
- Production: AWS RDS PostgreSQL (managed, configured via Terraform in `infra/terraform/modules/rds/`)

**ORM:** Prisma 5.22.0
- Schema: `backend/prisma/schema.prisma`
- Client: `@prisma/client` 5.22.0
- Binary targets: `["native", "debian-openssl-3.0.x"]`
- Migrations: `prisma migrate dev` (dev), `prisma migrate deploy` (prod)
- Seed: `backend/prisma/seed.ts` (via `ts-node/esm` loader)

**Caching / Token Revocation:** Redis (optional)
- Client: `ioredis ^5.9.3`
- Config: `REDIS_URL` env var
- Usage: `backend/src/lib/redis.ts`, `backend/src/lib/cache.ts`

## Package Manager

- **Backend:** npm (lockfile: `package-lock.json`)
- **Frontend:** npm (lockfile: `package-lock.json`)
- **Mobile:** npm (lockfile: `package-lock.json`)
- No workspace monorepo tooling detected; each workspace is managed independently

## Build Tools

**Backend:**
- `tsc` — TypeScript compiler (compile to `backend/dist/`)
- `tsx ^4.21.0` — dev runner (`npx tsx` for scripts and dev server)
- `ts-node ^10.9.2` — used for Prisma seed script

**Frontend:**
- `next build` — Next.js production build
- PostCSS via `@tailwindcss/postcss ^4` (`frontend/postcss.config.mjs`)
- ESLint `^9` + `eslint-config-next 16.2.3`

**Infrastructure:**
- Terraform `>= 1.5.0` with AWS provider `~> 5.0`
- Docker + Docker Compose (`docker-compose.yml` at project root)
- GitHub Actions CI/CD: `.github/workflows/` (ci.yml, deploy-apprunner.yml, security.yml, terraform.yml)

## Key Libraries (Backend)

**HTTP / Security:**
- `helmet ^8.1.0` — HTTP security headers
- `cors ^2.8.6` — CORS middleware
- `express-rate-limit ^8.3.2` — rate limiting (per-route limiters in `backend/src/middleware/security.ts`)

**Auth:**
- `jsonwebtoken ^9.0.3` — JWT creation and verification (`backend/src/lib/jwt.ts`)
- `bcrypt ^6.0.0` — password hashing
- OAuth: Google + Apple (env-configured, no dedicated SDK — custom implementation)

**AI / ML:**
- `@anthropic-ai/sdk ^0.78.0` — Claude API client
- Multi-agent orchestrator: `backend/src/lib/ai/orchestrator/` (6 agents: ResumeParser, JobParser, MatchScorer, ResumeTailor, CoverLetter, TruthConsistencyGuard)
- Semantic RAG: `backend/src/lib/rag/` — hash-based (default) or OpenAI-compatible embedding endpoint
- Models configurable via `AI_FAST_MODEL` / `AI_QUALITY_MODEL` env vars

**Payments:**
- `stripe ^20.3.1` — Stripe checkout + webhooks (`backend/src/lib/stripe.ts`)
- `flutterwave` via REST API (`backend/src/lib/flutterwave.ts`) — Nigeria-first billing

**File Parsing:**
- `pdf-parse ^1.1.1` — PDF resume extraction
- `mammoth ^1.12.0` — DOCX resume extraction
- `multer ^2.1.1` — multipart file upload

**Job Aggregation:**
- `cheerio ^1.2.0` — HTML scraping
- `xml2js ^0.6.2` — XML feed parsing
- Aggregator sources: `backend/src/lib/jobs/aggregator/sources/` (adzuna, apify, arbeitnow, greenhouse, himalayas, jobberman, jobsincyprus, lever, remoteok, weworkremotely, workable)

**Email / Push:**
- `@aws-sdk/client-ses ^3.1027.0` — transactional email via AWS SES (`backend/src/lib/email.ts`)
- `web-push ^3.6.7` — Web Push notifications (VAPID, `backend/src/lib/push.ts`)

**AWS SDKs:**
- `@aws-sdk/client-s3 ^3.1027.0` — S3 file storage
- `@aws-sdk/s3-request-presigner ^3.1027.0` — presigned upload URLs

**Logging / Observability:**
- `pino ^10.3.0` + `pino-http ^11.0.0` — structured JSON logging (`backend/src/lib/logger.ts`)
- `@sentry/node ^10.43.0` + `@sentry/profiling-node ^10.43.0` — backend error tracking + profiling (`backend/src/lib/sentry.ts`)
- Instrumentation bootstrap: `backend/src/instrument.ts`

**Validation:**
- `zod ^4.3.6` — schema validation; import pattern: `import { z } from "zod/v4"`

**API Docs:**
- `swagger-jsdoc ^6.2.8` + `swagger-ui-express ^5.0.1` — OpenAPI docs (disabled in prod unless `ENABLE_API_DOCS=true`)

**ID Generation:**
- `nanoid ^5.1.6`

## Key Libraries (Frontend)

**Core:**
- `next 16.2.3` — app framework
- `react 19.2.3` — UI library
- `react-dom 19.2.3`

**Styling:**
- `tailwindcss ^4` — utility CSS (`@tailwindcss/postcss ^4`)

**Error Tracking:**
- `@sentry/nextjs ^10.43.0` — browser + server/edge Sentry SDK
- Config files: `frontend/sentry.client.config.ts`, `frontend/sentry.server.config.ts`, `frontend/sentry.edge.config.ts`
- Integrated via `withSentryConfig()` wrapper in `frontend/next.config.ts`

**Testing:**
- Jest `^30.3.0` + `jest-environment-jsdom ^30.3.0` — unit tests (sharded in CI)
- `@testing-library/react ^16.3.2` + `@testing-library/jest-dom ^6.9.1` + `@testing-library/user-event ^14.6.1`
- `ts-jest ^29.4.6`
- Playwright `^1.58.2` — e2e tests (`frontend/playwright.config.ts`)
- Lighthouse CI: `@lhci/cli 0.14.x` (via `lighthouserc.json`)

## Mobile

- **Framework:** Expo `~52.0.0` (managed workflow)
- **Runtime:** React Native 0.76.0 on React 18.3.1
- **TypeScript:** `^5.6.3`
- **Status:** Minimal — single API URL env var (`EXPO_PUBLIC_API_URL`)
- **Platforms:** iOS, Android, Web (via `expo start --web`)

## Infrastructure

**Cloud Provider:** AWS (`us-east-1`, account `108188564905`)

**Compute:**
- AWS App Runner — backend and frontend services (primary deployment target)
- Docker containers built from `backend/Dockerfile` and `frontend/Dockerfile`
- ECR repositories for backend and frontend images

**Database:**
- AWS RDS PostgreSQL (managed, in private subnet via Terraform module `infra/terraform/modules/rds/`)

**Storage:**
- AWS S3 — user file uploads (resume documents, media)
- Presigned URLs for direct client uploads

**Secrets:**
- AWS Secrets Manager — all production secrets injected as environment variables into App Runner

**Networking:**
- VPC with private subnets (via `infra/terraform/modules/network/`)
- NAT Gateway (optional, configurable)
- ACM certificates + Route53 (optional custom domains)

**CI/CD:**
- GitHub Actions — `.github/workflows/`
  - `ci.yml` — lint, typecheck, test
  - `deploy-apprunner.yml` — build + push to ECR + trigger App Runner deploy
  - `terraform.yml` — infra validate + plan
  - `security.yml` — security scanning
- GitHub OIDC → `GitHubActionsDeployRole` IAM role (no static credentials)

**IaC:**
- Terraform `>= 1.5.0` in `infra/terraform/`
- State: S3 bucket `afritalent-dev-terraform-state` + DynamoDB lock table `afritalent-dev-terraform-locks`

**Local Development:**
- Docker Compose (`docker-compose.yml`) — postgres + backend + frontend + migrate containers
- `tsx` hot-reload dev server for backend

---

*Stack analysis: 2026-04-09*
