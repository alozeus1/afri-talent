# AfriTalent E2E Tests

Playwright tests covering the Gate A security baseline and Gate B domain schema.

## Prerequisites

| Service | Default URL | Start command |
|---------|-------------|---------------|
| Backend (Express + Prisma) | `http://localhost:4000` | `cd backend && npm run dev` |
| Frontend (Next.js) | `http://localhost:3000` | `cd frontend && npm run dev` |
| Database | configured via `DATABASE_URL` | must be migrated + seeded |

**Seed the database before running tests:**

```bash
cd backend
npx prisma migrate dev
npx prisma db seed
```

Seeded credentials (used by fixtures):

| Role | Email | Password |
|------|-------|----------|
| Candidate | `candidate@example.com` | `password123` |
| Employer | `employer@example.com` | `password123` |
| Admin | `admin@example.com` | `password123` |

## Running tests

```bash
# From the frontend/ directory:

# All suites (backend must be running)
npm run test:e2e

# Single suite
npx playwright test gate-a-security
npx playwright test gate-b-schema

# Interactive UI mode
npm run test:e2e:ui

# View last HTML report
npm run test:e2e:report
```

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `API_BASE_URL` | `http://localhost:4000` | Backend base URL |
| `APP_BASE_URL` | `http://localhost:3000` | Frontend base URL |

## Test suites

### `gate-a-security.spec.ts`

Verifies the Gate A security baseline:

- Login response does **not** include a token in the body (HttpOnly cookie only)
- `/api/auth/me` works via cookie without an `Authorization` header
- After logout, the session is invalidated (Redis JWT blocklist)
- All protected routes return `401` for unauthenticated requests
- Invalid / tampered JWTs return `401`
- Jobs list `limit` is capped at 100
- CV URLs using `http://` (non-HTTPS) are rejected
- Weak passwords and duplicate emails are rejected on registration
- CORS rejects requests from unlisted origins

### `gate-b-schema.spec.ts`

Verifies the Gate B domain schema routes:

- `GET/PUT /api/profile` — candidate profile upsert + validation
- Role enforcement: employers cannot access candidate-only profile routes
- `GET/POST /api/profile/resumes` — resume listing and registration
- s3Key ownership check: cannot register a resume scoped to another user
- `POST /api/files/presign` — content-type and size validation
- `GET /api/notifications` — paginated list with optional status filter
- `GET /api/notifications/unread-count` — numeric badge count
- `PUT /api/notifications/read-all` — bulk mark-read + confirms count drops to 0
- `PUT /api/notifications/:id/read` — 404 for nonexistent, 403 for wrong owner
- `GET /api/billing/status` — FREE plan returned for seeded user
- `POST /api/billing/checkout` — validation (missing/invalid plan)
- Health (`/health`, `/live`) probes
