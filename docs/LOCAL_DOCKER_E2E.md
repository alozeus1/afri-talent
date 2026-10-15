# Local Docker end-to-end stack (free launch)

Runs postgres (pgvector), backend and frontend on Docker Desktop (arm64 or amd64)
with **no Anthropic, SES, S3 or Stripe keys**:

- `FREE_MODE=true` (backend) + `NEXT_PUBLIC_FREE_MODE=true` (frontend build arg):
  every user is fully entitled, pricing/billing show "free for everyone", no paywalls.
- `MOCK_AI=1`: deterministic AI stubs (resume builder, job matches, cover letter,
  career advisor) with no API key.
- Email verification links are written to the backend log instead of being sent.

Compose project name: `afritalent-local`.

## Start (fresh clone)

```bash
cp .env.example .env          # optional; every value has a local default
# recommended: real local secrets instead of the defaults
sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
sed -i '' "s|^CSRF_SECRET=.*|CSRF_SECRET=$(openssl rand -hex 32)|" .env

docker compose up --build -d
docker compose ps             # backend/frontend/postgres (healthy), seed exited 0
```

Startup order: `postgres` -> `backend` (entrypoint runs `prisma migrate deploy`)
-> `seed` (one-shot; seeds demo data **only if the users table is empty**) ->
`frontend`. The first build takes several minutes; the seed fetches `tsx` from npm
on first run, so it needs internet.

Open http://localhost:3000 (API: http://localhost:4000/health).

### Ports already taken?

Defaults are `3000` (frontend), `4000` (backend), `127.0.0.1:55432` (postgres,
debug only). Override in `.env` and rebuild (the browser-facing API URL is baked
into the frontend image):

```bash
FRONTEND_HOST_PORT=3100
BACKEND_HOST_PORT=4100
DB_HOST_PORT=55433
```

```bash
docker compose up --build -d
```

Then use http://localhost:3100 / http://localhost:4100 everywhere below.

## Test logins (seeded, password `Password123!`)

| Role       | Email                        | Notes                                      |
|------------|------------------------------|--------------------------------------------|
| Candidate  | `candidate@example.com`      | email verified                             |
| Candidate  | `candidate-pro@example.com`  | email verified                             |
| Employer   | `employer@example.com`       | verified company, can post jobs right away |
| Admin      | `admin@example.com`          | admin role (sign-in not exercised by the journeys) |

## Click-through checklist

1. http://localhost:3000/en/pricing -> "AfriTalent is free for everyone — candidates
   and employers". `/en/billing` redirects there.
2. Register a candidate (`/en/register`), then verify the email:
   ```bash
   docker compose logs backend | grep 'DEV email verification' | tail -1
   ```
   Open the `verifyUrl`. Fill in `/en/candidate/profile` (headline, bio, skills,
   years) and save; Quick Apply needs at least 30% profile completeness.
3. Register an employer (`/en/register?role=employer`) with a **company-domain**
   email (e.g. `hr@yourco-test.com`, not gmail/outlook) plus company name and
   location. In `/en/employer/onboarding` set the company website to the same domain
   (`https://yourco-test.com`) and "Save and continue". Then `/en/employer/jobs/new`
   -> Basics -> Role details -> Publish review -> **Post job**. No payment step.
   Or skip all this with `employer@example.com`.
4. As the candidate: `/en/jobs`, search the title, open it, **Apply Now**, tick the
   review box, **Submit application**. It shows under `/en/candidate/applications`.
5. As the employer: dashboard -> **Jobs** tab -> **View applications** shows the
   candidate, profile summary and cover letter.
6. AI (MOCK_AI): `/en/candidate/resume-builder` ("Start from profile" -> Next ->
   Generate Resume -> Save Resume), then `/en/candidate/job-matches` ranks roles,
   `/en/candidate/cover-letter` generates a letter for a picked job,
   `/en/candidate/career-advisor` returns an overview and 90-day plan.

## Automated journeys (Playwright)

`frontend/e2e/local-docker/free-launch-journeys.spec.ts` drives all of the above in
a real browser (14 checks: health, free pricing, employer register + domain
verification + post, candidate register + email verify + profile, search + apply,
employer sees applicant, resume builder, job matches, cover letter, career
advisor, billing redirect, seeded logins). It reads the verification link from
`docker compose logs`, so it is local-only, not CI.

```bash
cd frontend
APP_BASE_URL=http://localhost:3000 API_BASE_URL=http://localhost:4000 \
  npx playwright test -c playwright.local-docker.config.ts
```

Each run creates new uniquely named accounts (reserved `e2e-` email prefix) and a
job. The suite's global teardown (`e2e/local-docker/global-teardown.ts`) then runs
`backend/scripts/purge-e2e-data.ts --apply`, which removes those jobs from listings
and anonymizes + soft-deletes the accounts. Set `E2E_KEEP_DATA=1` to keep them, and
`DB_HOST_PORT` / `E2E_DATABASE_URL` if the database is not on 127.0.0.1:55432.
To clean up by hand (dry run without `--apply`):

```bash
cd backend
# LOCAL_DATABASE_URL: the compose database (x-backend-database-url in docker-compose.yml) with host 127.0.0.1:$DB_HOST_PORT
DATABASE_URL="$LOCAL_DATABASE_URL" npx tsx scripts/purge-e2e-data.ts --apply
```

## Reset / re-seed

```bash
# DESTRUCTIVE: re-run the demo seed (deletes users, jobs, applications first)
docker compose run --rm -e SEED_FORCE=1 seed
```

## Known limits

- **File uploads (CV upload, avatars) return 503**: no S3 bucket locally. Applying
  without an uploaded CV works; the AI resume builder works.
- **Employer posting needs trust verification**: company-domain email + matching
  website. A domain already used by another employer account is held for review,
  so use a different domain per test employer.
- Job aggregator scheduler off (`DISABLE_SCHEDULER=1`). Run one crawl on demand
  with `POST /api/aggregator/sync` as admin, or from the host:
  `cd backend && DATABASE_URL="$LOCAL_DATABASE_URL" MOCK_AI=1 npx tsx -e 'import("./src/lib/prisma.ts").then(async ({prisma}) => { const {runIngestion} = await import("./src/lib/jobs/aggregator/engine/pipeline.ts"); const r = await runIngestion({prisma, trigger: "manual", ignoreMinInterval: true}); console.log(r.totals); await prisma.$disconnect(); })'`.
  `npx tsx scripts/aggregator-dry-run.ts` shows per-feed counts without writing.
  Set `DISABLE_SCHEDULER=0` in `.env` to crawl on the normal schedule.
- Auto-apply and phase-4 bots are disabled (`AUTO_APPLY_ENABLED=0`,
  `PHASE4_BOTS_ENABLED=0`).

## Stop

```bash
docker compose down        # keeps the database volume
docker compose down -v     # also deletes this stack's database volume
```
