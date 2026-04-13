# Testing Setup

**Analysis Date:** 2026-04-09

## Backend Testing

**Framework:** Vitest
- Config: `backend/vitest.config.ts`
- Environment: `node`
- Globals mode: `true` (describe, it, expect available without import, but explicit imports are the convention)
- Test pattern: `src/**/*.test.ts` (includes co-located and `__tests__/` tests)
- Timeout: 10,000ms per test (accommodates supertest HTTP round-trips)
- Pre-test: `prisma generate` runs before `vitest run` (via `npm test` script)

**Pre-set environment variables (vitest.config.ts):**
```
MOCK_AI=1      → orchestrator returns deterministic stubs (no Claude API calls)
NODE_ENV=test  → health/ready endpoints skip DB connectivity checks
               → rate limiters use in-memory store
```

**HTTP testing:** `supertest` — imports the Express `app` directly and makes requests in-process

**Assertion library:** Vitest built-in (`expect`)

**Mocking:** `vi` from vitest
- `vi.mock(...)` for module mocking (hoisted before imports)
- `vi.fn()` for spy functions
- `vi.clearAllMocks()` in `beforeEach` to reset between tests

## Frontend Testing

### Unit Tests (Jest + Testing Library)

**Framework:** Jest with `next/jest` adapter
- Config: `frontend/jest.config.ts`
- Environment: `jest-environment-jsdom`
- Setup file: `frontend/jest.setup.ts` (imports `@testing-library/jest-dom`, global mocks for `fetch`, `next/navigation`, `IntersectionObserver`)
- Coverage: `v8` provider
- Path alias: `^@/(.*)$` → `<rootDir>/src/$1`
- Pattern: `**/__tests__/**/*.[jt]s?(x)` and `**/?(*.)+(spec|test).[jt]s?(x)`, excluding `e2e/`
- Memory: `NODE_OPTIONS='--max-old-space-size=4096'` (set in npm scripts)

**Assertion library:** Jest built-in + `@testing-library/jest-dom` matchers (`toBeInTheDocument`, etc.)

**Component rendering:** `@testing-library/react` — `render`, `screen`, `waitFor`

**Mocking:** `jest.mock(...)` with factory functions for modules like `next/navigation`, `@/lib/auth-context`, `@/lib/api`

### E2E Tests (Playwright)

**Framework:** Playwright
- Config: `frontend/playwright.config.ts`
- Test directory: `frontend/e2e/`
- Timeout: 30,000ms per test
- Retries: 2 on CI, 0 locally
- Workers: 4 on CI, default locally
- Reporters: HTML (never auto-open) + list

**Projects (test suites):**
| Project | Pattern | Device |
|---|---|---|
| `api` | `gate-*`, `phase1-foundation-smoke`, `phase2-*api*`, `phase2-*security*` | Desktop Chrome |
| `desktop-web` | `ui-*.spec.ts` | Desktop Chrome |
| `mobile-web` | `ui-*.spec.ts` | iPhone 13 |

**Fixtures:** `frontend/e2e/fixtures/auth.ts`
- `TEST_CANDIDATE`, `TEST_EMPLOYER`, `TEST_ADMIN` — seeded credentials from `backend/prisma/seed.ts`
- `loginAs(request, creds)` — login helper with retry on 429 (up to 5 attempts, 3s backoff)
- `registerUser(request, opts)` — fresh user registration helper
- `API` constant from `process.env.API_BASE_URL ?? "http://localhost:4000"`

**Requires live stack:** both backend (`:4000`) and frontend (`:3000`) must be running

## How to Run Tests

**Backend:**
```bash
cd backend && npm test              # prisma generate + vitest run (single pass)
cd backend && npm run test:watch    # vitest watch mode
cd backend && npm run typecheck     # tsc --noEmit (type check only)
cd backend && npm run lint          # eslint src prisma --ext .ts
```

**Frontend unit tests:**
```bash
cd frontend && npm run test:unit              # jest --runInBand (sequential, 4GB heap)
cd frontend && npm run test:unit:watch        # jest --watch
cd frontend && npm run test:unit:ci           # jest --shard=1/2 + shard=2/2 (CI sharding)
```

**Frontend E2E tests (requires running stack):**
```bash
# Start backend first:
cd backend && npm run dev

# Start frontend:
cd frontend && npm run dev

# Then run Playwright:
cd frontend && npm run test:e2e              # all suites
cd frontend && npx playwright test gate-a-security   # single suite
cd frontend && npm run test:ui               # Playwright UI mode
cd frontend && npm run test:e2e:report       # open HTML report
```

**Performance:**
```bash
cd frontend && npm run test:perf:lighthouse  # Lighthouse CI audit
```

## Existing Test Files

**Backend unit tests (`backend/src/__tests__/`):**
- `auth-api.test.ts` — POST /api/auth/register and login flows
- `jobs-api.test.ts` — job CRUD, search, trust integration
- `orchestrator-api.test.ts` — POST /api/orchestrator/run auth enforcement
- `orchestrator-validators.test.ts` — Zod schema validation for orchestrator
- `security-middleware.test.ts` — `sanitizeRequest` control chars and prototype pollution
- `bot-protection.test.ts` — bot shield middleware
- `oauth-email-api.test.ts` — OAuth and email auth flows
- `employer-onboarding.test.ts` — employer registration flow
- `job-discovery.test.ts` — job discovery service
- `ats-service.test.ts` — ATS integration service
- `candidate-retention.test.ts` — retention logic
- `trust-risk.test.ts` — trust risk assessment
- `semantic-foundation.test.ts` — semantic layer foundation
- `semantic-indexer.test.ts` — semantic indexer
- `phase4-feature-flags.test.ts` — feature flag logic
- `phase12-quality-integration.test.ts` — quality/integration checks
- `health.test.ts` — health endpoint

**Backend billing tests (`backend/src/__tests__/billing/`):**
- `entitlements.test.ts`
- `regions.test.ts`
- `operations.test.ts`

**Backend co-located tests:**
- `backend/src/lib/platform/health.test.ts`
- `backend/src/lib/jobs/aggregator/catalog.test.ts`
- `backend/src/lib/jobs/aggregator/sources/__tests__/apify.test.ts`
- `backend/src/lib/jobs/aggregator/sources/__tests__/board-adapters.test.ts`
- `backend/src/lib/talent/match.test.ts`

**Frontend unit tests (Jest, co-located in `__tests__/`):**
- `src/app/candidate/__tests__/analytics-page.test.tsx`
- `src/app/admin/__tests__/partners-page.test.tsx`
- `src/app/trust/__tests__/page.test.tsx`
- `src/components/employer/__tests__/activation-checklist.test.tsx`
- `src/components/employer/__tests__/job-posting-preview.test.tsx`
- `src/components/layout/__tests__/network-status-banner.test.tsx`
- `src/components/layout/__tests__/footer.test.tsx`
- `src/components/layout/__tests__/header.test.tsx`
- `src/components/trust/__tests__/trust-badge.test.tsx`
- `src/components/trust/__tests__/trust-explainer-modal.test.tsx`
- `src/components/trust/__tests__/trust-status-banner.test.tsx`
- `src/components/jobs/__tests__/job-card.test.tsx`
- `src/components/jobs/__tests__/job-jsonld.test.tsx`
- `src/components/jobs/__tests__/jobs-browse-experience.test.tsx`
- `src/components/pricing/__tests__/feature-gate.test.tsx`
- `src/components/pricing/__tests__/plan-card.test.tsx`
- `src/components/pricing/__tests__/comparison-table.test.tsx`
- `src/components/pricing/__tests__/region-selector.test.tsx`
- `src/components/notifications/__tests__/candidate-preference-center.test.tsx`
- `src/lib/__tests__/salary.test.ts`

**Frontend E2E tests (`frontend/e2e/`):**
- `gate-a-security.spec.ts` — HttpOnly cookie, session, logout, 401 enforcement
- `gate-b-schema.spec.ts` — API schema/contract validation
- `gate-c-entitlements.spec.ts` — subscription plan enforcement
- `gate-d-abuse.spec.ts` — abuse/rate-limit protection
- `gate-e-trust.spec.ts` — trust profile flows
- `phase1-foundation-smoke.spec.ts` — smoke test (health, auth, basic routes)
- `phase2-quality-api.spec.ts` — API quality regression
- `ui-phase2-regression.spec.ts` — UI regression (desktop + mobile)

## Test Patterns and Conventions

**Backend (Vitest) — standard structure:**
```typescript
import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock declarations MUST come before imports (hoisted by vitest)
vi.mock("../lib/prisma.js", () => ({
  default: {
    user: { findUnique: vi.fn(), create: vi.fn() },
  }
}));

import request from "supertest";
import app from "../app.js";
import { signToken } from "../lib/jwt.js";
import { Role } from "@prisma/client";

// Token helper (defined at module level)
function makeCandidateToken(id = "user123"): string {
  return signToken({ userId: id, email: "candidate@test.com", role: Role.CANDIDATE });
}

describe("Feature area", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/route", () => {
    it("returns 401 with no auth token", async () => {
      const res = await request(app).post("/api/route").send({});
      expect(res.status).toBe(401);
    });

    it("returns 201 for valid request", async () => {
      const res = await request(app)
        .post("/api/route")
        .set("Authorization", `Bearer ${makeCandidateToken()}`)
        .send({ field: "value" });
      expect(res.status).toBe(201);
    });
  });
});
```

**Frontend Jest — component tests:**
```typescript
import { render, screen, waitFor } from "@testing-library/react";
import { ComponentName } from "../component-name";

// Mock all external dependencies
jest.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "1", role: "CANDIDATE" }, isLoading: false }),
}));

jest.mock("@/lib/api", () => ({
  someService: { method: jest.fn() },
}));

describe("ComponentName", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders expected content", () => {
    render(<ComponentName />);
    expect(screen.getByText("expected text")).toBeInTheDocument();
  });

  it("handles async data loading", async () => {
    (someService.method as jest.Mock).mockResolvedValue({ data: [] });
    render(<ComponentName />);
    await waitFor(() => {
      expect(screen.getByText("loaded content")).toBeInTheDocument();
    });
  });
});
```

**Playwright E2E — API tests:**
```typescript
import { test, expect } from "@playwright/test";
import { API, TEST_CANDIDATE, loginAs } from "./fixtures/auth";

test("description of behavior", async ({ request }) => {
  await loginAs(request, TEST_CANDIDATE);

  const res = await request.get(`${API}/api/protected-route`);
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.field).toBeDefined();
});
```

## Mocking Strategy

**Backend mocking rules:**
- Mock `../lib/prisma.js` entirely for unit tests — avoids DB dependency
- Mock `../lib/ai/persistence.js` for any route touching AI run tracking
- Mock trust and risk services (`../lib/trust/service.js`, `../lib/trust/risk.js`) with realistic return shapes
- Mock middleware factories that require DB lookups: `../middleware/account-standing.js` with pass-through
- `MOCK_AI=1` env var disables Claude API calls at the orchestrator level — no need to mock Anthropic SDK directly

**Frontend mocking rules:**
- `jest.setup.ts` globally mocks `fetch`, `next/navigation`, and `IntersectionObserver`
- Each test file mocks `@/lib/auth-context`, `@/lib/api` and analytics per-test
- Component stubs via simple functional mock: `jest.mock("@/components/jobs/job-card", () => ({ JobCard: ({ job }) => <div>{job.title}</div> }))`
- E2E tests use real seeded data (no mocks) — requires live backend and DB

## Coverage Setup

No enforced coverage thresholds. Coverage provider is `v8` (frontend Jest config).

To generate coverage locally:
```bash
# Frontend
cd frontend && npx jest --coverage

# Backend
cd backend && npx vitest run --coverage
```

No coverage gates in CI currently.

## CI Test Integration

All tests run in `.github/workflows/ci.yml` on push/PR to `main` and `develop`.

**CI jobs (parallel where possible):**

| Job | Command |
|---|---|
| `backend-lint` | `npm run lint` |
| `backend-typecheck` | `npm run typecheck` (after `prisma generate`) |
| `backend-test` | `npm test` with real PostgreSQL 15 service container |
| `backend-build` | `npm run build` |
| `frontend-lint` | `npm run lint` |
| `frontend-typecheck` | `npx tsc --noEmit` |
| `frontend-unit-test` | `npm run test:unit:ci` (sharded 1/2 and 2/2) |
| `frontend-build` | `npm run build` |
| `e2e` | Playwright against live backend + frontend |

**E2E CI setup:**
1. Starts PostgreSQL 15 service container
2. Runs `prisma migrate deploy` + `prisma db seed`
3. Starts backend (`npm run dev &`) with `MOCK_AI=1`, `E2E=1`
4. Builds frontend and starts with `npm run start &`
5. Polls health endpoints before running tests
6. Uploads `playwright-report/` as artifact (7-day retention)

**Backend test environment in CI:**
```
MOCK_AI=1
DATABASE_URL=postgresql://afritalent:afritalent_test@localhost:5432/afritalent_test
```

**Playwright report artifact:** `playwright-report` (uploaded on success and failure via `if: always()`)

---

*Testing analysis: 2026-04-09*
