# Code Conventions

**Analysis Date:** 2026-04-09

## TypeScript Usage

Both backend and frontend use strict TypeScript throughout.

**Backend (`backend/tsconfig.json`):**
- `"strict": true` — all strict checks enabled
- `"module": "NodeNext"` / `"moduleResolution": "NodeNext"` — ES module resolution
- `"target": "ES2022"`, `"lib": ["ES2022"]`
- All imports must use `.js` extension in source (e.g., `import prisma from "../lib/prisma.js"`) even for `.ts` files, because of NodeNext module resolution

**Frontend (`frontend/tsconfig.json`):**
- `"strict": true`
- `"module": "esnext"` / `"moduleResolution": "bundler"`
- Path alias `@/*` maps to `frontend/src/*`

**Zod:**
- Import as `import { z } from "zod"` (not `"zod/v4"` — project has moved to direct usage)
- Validation schemas are defined at module-top level, named with `Schema` suffix: `registerSchema`, `loginSchema`, `createJobSchema`
- Validation errors are returned as `400` with `{ error: "Validation failed", details: error.issues }`

**Prisma types:**
- Use `Prisma.JsonNull` for nullable Json fields (not plain `null`)
- Import enums directly from `@prisma/client`: `import { Role, JobStatus, SubscriptionPlan } from "@prisma/client"`

## Naming Conventions

**Files:**
- Backend: `kebab-case.ts` — `auth.ts`, `bot-protection.ts`, `account-standing.ts`
- Frontend pages: `page.tsx` per Next.js App Router convention, inside descriptive directory names (`candidate/analytics/page.tsx`)
- Frontend components: `kebab-case.tsx` — `trust-badge.tsx`, `job-card.tsx`, `push-opt-in.tsx`
- Test files: co-located in `__tests__/` subdirectory using same `kebab-case.test.tsx` naming

**Functions:**
- Regular functions: `camelCase` — `generateSlug()`, `serializeJob()`, `setAuthCookie()`
- React components: `PascalCase` — `TrustBadge`, `CandidateDashboard`, `AuthProvider`
- React hooks: `useX` pattern — `useAuth()`, `useRouter()`, `useLocale()`, `useT()`
- Middleware factories: verb-prefixed — `requirePlan()`, `requireRole()`, `authorize()`, `requireVerifiedEmail()`

**Variables:**
- Descriptive names preferred: `candidateApplications` not `data`, `myApplications` not `apps`
- Constants: `SCREAMING_SNAKE_CASE` — `COOKIE_NAME`, `PLAN_RANK`, `AI_DISABLED`, `ORCHESTRATOR_BUDGET_MAX`
- Private/unused args: prefix with `_` — `_req`, `_res`, `_error` (enforced by ESLint)

**Types/Interfaces:**
- `PascalCase` for interfaces and type aliases: `CandidateProfile`, `AuthContextType`, `FetchOptions`
- `Props` suffix for React prop types: `TrustBadgeProps`
- Response types: `CandidateTrustDashboard`, `BillingStatus`, `AuthSessionResponse`

## Import Style

**Backend import order (NodeNext ESM):**
1. Node built-ins: `import { createHash, randomUUID } from "crypto"`
2. Third-party packages: `import { Router, Request, Response } from "express"`, `import { z } from "zod"`
3. Internal lib: `import prisma from "../lib/prisma.js"`, `import logger from "../lib/logger.js"`
4. Internal middleware: `import { authenticate, authorize } from "../middleware/auth.js"`
5. Internal services: `import { assessJobPostingRisk } from "../lib/trust/risk.js"`
- All internal imports must include `.js` extension

**Frontend import order:**
1. React core: `import { useEffect, useState } from "react"`
2. Next.js: `import { useRouter } from "next/navigation"`, `import Link from "next/link"`
3. Internal lib via alias: `import { useAuth } from "@/lib/auth-context"`, `import { applications } from "@/lib/api"`
4. Internal components via alias: `import { Card, CardContent } from "@/components/ui/card"`, `import { TrustBadge } from "@/components/trust/trust-badge"`
- Use `@/` alias for all cross-directory imports; relative paths only within same component directory

**Type-only imports:** use `import type { ... }` for pure type imports: `import type { NextFunction, Request, Response } from "express"`

## Error Handling Patterns

**Backend route handlers:**
- Wrap entire handler body in `try/catch`
- Catch block logs with `console.error` or `logger` then returns `500`:
  ```typescript
  } catch (error) {
    console.error("Subscription check error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
  ```
- Zod parse errors use `.parse()` (throws on failure) caught by outer try/catch, OR `.safeParse()` for conditional logic
- Early returns use `res.status(N).json({...}); return;` pattern — always `return` after responding
- Unused catch variable: `} catch {` (no binding) when error detail is irrelevant

**Frontend API calls:**
- `fetchAPI` wrapper in `frontend/src/lib/api.ts` throws on non-OK responses: `throw new Error(error.error || "Request failed")`
- Components catch in `useEffect`: `.catch(err => console.error(...))` or set error state
- Auth context: `catch { setUser(null); }` — silent fail on session restore

**Middleware:**
- Return `void` explicitly: `export async function authenticate(...): Promise<void>`
- Always call `next()` to continue or respond and return; never both

## API Response Format

**Success responses:**
- `200` with resource object directly: `res.json({ user: {...}, message: "..." })`
- `201` for resource creation: `res.status(201).json({ message: "...", user: {...} })`
- No wrapper envelope for most responses — data at top level

**Error responses:**
- Always `{ error: string }` at minimum
- Validation failures: `{ error: "Validation failed", details: error.issues }`
- Conflict with code: `{ error: "...", code: "PROVIDER_MISMATCH", providers: [...] }`
- Premium gate: `{ error: "This feature requires a higher subscription plan", currentPlan, requiredPlan }`
- Email verification gate: `{ error: "...", code: "EMAIL_VERIFICATION_REQUIRED", email }`

**Status codes:**
- `400` — validation failure, bad request
- `401` — missing or invalid auth token
- `403` — authenticated but lacking permissions/plan/role
- `404` — resource not found
- `409` — conflict (duplicate email, provider mismatch)
- `429` — rate limited
- `500` — internal server error
- `503` — kill switch (AI_DISABLED)

## Authentication Check Pattern

**Middleware chain (ordered):**
```typescript
router.post("/route", authenticate, authorize(Role.CANDIDATE), requirePlan(SubscriptionPlan.BASIC), handler);
```

**`authenticate`** (`backend/src/middleware/auth.ts`):
- Extracts JWT from HttpOnly cookie first, then `Authorization: Bearer` header
- Sets `req.user: JWTPayload` and `req.rawToken: string`
- Returns `401` if missing/invalid/revoked

**`authorize(...roles)`** (`backend/src/middleware/auth.ts`):
- Checks `req.user.role` against allowed roles
- Returns `403` for insufficient role

**`requireVerifiedEmail()`** (`backend/src/middleware/auth.ts`):
- Checks `user.emailVerified` from DB
- Returns `403` with code `EMAIL_VERIFICATION_REQUIRED`

**`requirePlan(minimumPlan)`** (`backend/src/middleware/subscription.ts`):
- Looks up `prisma.subscription` for `req.user.userId`
- Compares plan rank using `PLAN_RANK` record
- `FREE` plan is always considered active

**`requireAccountStanding()`** (`backend/src/middleware/account-standing.ts`):
- Additional standing check, chainable after authenticate

**Optional auth:** `optionalAuth` middleware — sets `req.user` if valid token present, never blocks

## Database Query Patterns

**Prisma singleton** (`backend/src/lib/prisma.ts`):
```typescript
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
export default prisma;
```
- Always import as `import prisma from "../lib/prisma.js"`

**Select vs Include:**
- Use `select` for projection (only fetch needed fields): `prisma.user.findUnique({ where: {...}, select: { emailVerified: true, email: true } })`
- Use `include` for related models: `include: { oauthAccounts: { select: { provider: true } } }`
- Prefer `select` in nested relations to minimize payload

**Common patterns:**
```typescript
// Upsert pattern (trust profiles)
await prisma.candidateTrustProfile.upsert({ where: { userId }, update: {...}, create: {...} });

// Count with filter
const count = await prisma.job.count({ where: { status: JobStatus.ACTIVE } });

// Aggregation relation count
prisma.job.findMany({ include: { _count: { select: { applications: true } } } })
```

**Fire-and-forget persistence:** use `void createAiRun(...)` — never `await` in the request handler path

## Frontend Component Patterns

**"use client" directive:**
- Add `"use client"` at top of any component using hooks, state, or browser APIs
- Server components (no directive) are the default in App Router — use for static/data-fetch-only pages

**Component structure:**
```typescript
// 1. "use client" (if needed)
"use client";
// 2. React/Next imports
import { useEffect, useState } from "react";
// 3. Internal lib imports
import { useAuth } from "@/lib/auth-context";
// 4. Component imports
import { Card } from "@/components/ui/card";

// 5. Type/interface definitions
interface MyComponentProps { ... }

// 6. Helper functions and constants (outside component)
const STATUS_VARIANTS = { ... };
function computeSomething(...) { ... }

// 7. Default export component
export default function MyPage() { ... }

// 8. Named exports for sub-components
export function SubComponent(...) { ... }
```

**Page components:** exported as `default` from `page.tsx`
**Shared components:** named exports from their file (e.g., `export function TrustBadge(...)`)

**Props interface:** always define inline `interface XxxProps` before the component, not inline in function signature

## State Management

No global state management library (no Redux, Zustand, etc.). State is managed via:
- React `useState` + `useEffect` in page-level components
- React Context for cross-cutting state: `AuthContext` in `frontend/src/lib/auth-context.tsx`
- `useAuth()` hook for consuming auth state throughout the app

Session state: HttpOnly cookie (no localStorage, no token in JS) — `useAuth` calls `/api/auth/me` on mount to restore session.

## CSS / Styling Approach

- **Tailwind CSS v4** throughout the frontend
- Utility classes used directly in JSX: `className="flex items-center gap-2 px-4"`
- `frontend/src/components/ui/` contains shared primitive components (Card, Badge, Button, Skeleton) built on top of Tailwind
- `Badge` component accepts `variant` prop (`"default" | "success" | "warning" | "danger" | "info"`) for semantic color
- No CSS modules; no styled-components; no inline `style` objects except for dynamic values
- 2-space indentation in TSX files

## Logging

**Backend:** Pino logger (`backend/src/lib/logger.ts`)
- Import: `import logger from "../lib/logger.js"`
- Structured JSON in production, pretty-print in development
- Sensitive fields auto-redacted: `authorization`, `cookie`, `password`, `token`, `secret`
- Log level: `info` in production, `debug` in development (configurable via `LOG_LEVEL` env var)

**Ops events:** `recordOpsEvent(...)` from `backend/src/lib/ops/events.ts` for business-level metrics (auth outcomes, etc.)

**Frontend:** `console.error` in catch blocks; no structured logging library client-side

## Comments

- Route files use `//` block comments to section handler logic: `// POST /api/auth/register - with strict rate limiting`
- Inline comments explain non-obvious decisions: `// Fail-open: if Redis unavailable, token still accepted`
- JSDoc not used; TSDoc not used — TypeScript types serve as documentation
- Inline regression guards with comment: `// Regression guard: if someone tightens this back...`
- Security-sensitive code is always commented: `// HttpOnly cookie takes precedence (browser clients)`

---

*Convention analysis: 2026-04-09*
