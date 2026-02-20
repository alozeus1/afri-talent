# AfriTalent Security & Quality Fixes — Claude Code Prompt

## Context

You are working on **AfriTalent**, a full-stack Africa-focused tech job marketplace MVP.

- **Backend:** Node.js 20, Express 5, TypeScript, Prisma ORM 5.22, PostgreSQL — runs on port 4000
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 — runs on port 3000
- **Working directory:** The root of the repo (`afri-tech/`), containing `backend/`, `frontend/`, `infra/`, and `docker-compose.yml`
- **Local testing:** Docker Compose (`docker-compose up --build`) plus `npm run dev` in each directory
- **Demo credentials available in seed:** admin@example.com / candidate@example.com / employer@example.com (Password123!)

Implement the fixes below in priority order (P0 → P3). After all changes, the app must still fully work — all existing routes, role-based dashboards, and the Docker Compose stack must function correctly.

Do not introduce breaking changes to the public API contract without adding backwards-compatible handling. Do not add features outside the scope of these fixes.

---

## Prerequisites — Install Before Starting

Run these from the `backend/` directory:

```bash
npm install ioredis nanoid cookie-parser
npm install --save-dev @types/ioredis @types/cookie-parser
```

---

## P0 — Critical Security (Fix First)

### FIX-1: Move JWT out of localStorage into HttpOnly cookie + in-memory state

**The problem:** `frontend/src/lib/auth-context.tsx` stores the JWT in `localStorage`, which is readable by any JavaScript on the page (XSS vector). The backend's own `SECURITY.md` explicitly says not to do this.

**The solution:** A two-layer approach that works locally without requiring HTTPS or a proxy:
1. On login/register, backend sets the JWT as an `HttpOnly` cookie in addition to returning it in the response body.
2. Frontend stores the token in React state (memory) only — **no `localStorage` anywhere**.
3. On page refresh (token lost from memory), the frontend calls `GET /api/auth/me` with `credentials: 'include'`. The backend's `authenticate` middleware falls back to reading the cookie if no `Authorization: Bearer` header is present.
4. On logout, backend clears the cookie.

**Backend changes:**

In `backend/src/middleware/auth.ts` — update `authenticate` to read from cookie if no Bearer token:

```typescript
import { parse as parseCookies } from "cookie";

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  let token: string | undefined;

  // 1. Try Authorization header first (used by explicit API calls with in-memory token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  // 2. Fall back to HttpOnly cookie (used on page refresh when memory token is gone)
  if (!token && req.headers.cookie) {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies["auth_token"];
  }

  if (!token) {
    res.status(401).json({ error: "Authorization token required" });
    return;
  }

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
```

Note: use the built-in `cookie` module to parse cookies (no extra install needed — Node has it) or install `cookie` package if needed. Do not use `cookie-parser` middleware globally; parse manually in this middleware to keep it targeted.

In `backend/src/routes/auth.ts` — after signing a token in both `register` and `login` handlers, set the cookie before `res.json(...)`:

```typescript
const isProduction = process.env.NODE_ENV === "production";

// Set the auth cookie (call this after signToken, before res.json)
res.cookie("auth_token", token, {
  httpOnly: true,
  secure: isProduction,          // HTTPS only in production
  sameSite: isProduction ? "strict" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  path: "/",
});
```

Add a new `POST /api/auth/logout` route in `auth.ts` that:
1. Clears the `auth_token` cookie
2. If a JWT blocklist (FIX-3) is implemented, adds the current token's `jti` to the blocklist
3. Returns `{ message: "Logged out successfully" }`

```typescript
router.post("/logout", authenticate, async (req: Request, res: Response) => {
  res.clearCookie("auth_token", { path: "/" });
  res.json({ message: "Logged out successfully" });
});
```

**Frontend changes:**

In `frontend/src/lib/auth-context.tsx`:
- Remove ALL `localStorage.getItem`, `localStorage.setItem`, `localStorage.removeItem` calls
- The `initAuth` `useEffect` should call `auth.me()` with `credentials: 'include'` — if it succeeds, populate `user` and `token` state; if it fails (401), stay logged out (no token in storage to clean up)
- `login()` and `register()` still receive the token in the response body — store it in React state only
- `logout()` should call the new `POST /api/auth/logout` endpoint (with `credentials: 'include'`) then clear state

In `frontend/src/lib/api.ts`:
- Add `credentials: 'include'` to the base `fetchAPI` function's options so cookies are sent on every request
- The `token` parameter on each function call remains — when the in-memory token is available, it's passed as `Authorization: Bearer`; when not (during the `/me` recovery call), the cookie provides the fallback

**Acceptance test:**
1. Start both dev servers
2. Login → open DevTools → Application → Local Storage → confirm no `token` key
3. Open DevTools → Application → Cookies → confirm `auth_token` cookie is present with `HttpOnly` checked
4. Hard-refresh the page → confirm you are still logged in (session restored via cookie)
5. Click logout → confirm cookie is cleared and you land on login page

---

### FIX-2: Tighten employer authorization on `GET /api/applications/:id`

**The problem:** In `backend/src/routes/applications.ts`, the `GET /:id` handler checks `isEmployer = req.user!.role === Role.EMPLOYER` but does NOT verify the employer actually owns the job that the application belongs to. Any authenticated employer can view any application by guessing/knowing its UUID.

**Fix in `backend/src/routes/applications.ts`** — replace the authorization block:

```typescript
// After fetching the application, verify employer actually owns the job
const isCandidate = req.user!.userId === application.candidateId;
const isAdmin = req.user!.role === Role.ADMIN;

let isAuthorizedEmployer = false;
if (req.user!.role === Role.EMPLOYER) {
  const employer = await prisma.employer.findUnique({
    where: { userId: req.user!.userId },
  });
  isAuthorizedEmployer = !!employer && application.job.employerId === employer.id;
}

if (!isCandidate && !isAuthorizedEmployer && !isAdmin) {
  res.status(403).json({ error: "Not authorized to view this application" });
  return;
}
```

**Acceptance test:**
```bash
# Login as employer, get token
# Login as a different employer (or use admin token), attempt to GET an application
# belonging to the first employer's job — should get 403
curl -H "Authorization: Bearer <other_employer_token>" http://localhost:4000/api/applications/<application_id>
# Expect: 403 Forbidden
```

---

### FIX-3: Add Zod validation to `PUT /api/admin/resources/:id/publish`

**The problem:** In `backend/src/routes/admin.ts`, the publish/unpublish endpoint reads `const { published } = req.body` with no schema validation.

**Fix:** Add a Zod schema at the top of `admin.ts` alongside the other schemas:

```typescript
const publishResourceSchema = z.object({
  published: z.boolean(),
});
```

Then in the route handler, replace the raw destructure with:
```typescript
const { published } = publishResourceSchema.parse(req.body);
```

Wrap in a try/catch for `ZodError` returning `400` like the other routes.

**Acceptance test:**
```bash
curl -X PUT http://localhost:4000/api/admin/resources/<id>/publish \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"published": "not-a-boolean"}'
# Expect: 400 Validation failed
```

---

## P1 — High Priority

### FIX-4: JWT blocklist with Redis for session revocation

**The problem:** There is no way to invalidate a specific JWT before its 7-day expiry. A compromised account stays compromised for up to 7 days.

**New file: `backend/src/lib/redis.ts`**

```typescript
import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableReadyCheck: false,
    });
    redis.on("error", (err) => {
      // Don't crash the app if Redis is unavailable — degrade gracefully
      console.warn("Redis connection error (token blocklist unavailable):", err.message);
    });
  }
  return redis;
}

/** Add a token's jti to the blocklist until it expires */
export async function blockToken(jti: string, ttlSeconds: number): Promise<void> {
  try {
    const client = getRedis();
    await client.set(`blocklist:${jti}`, "1", "EX", ttlSeconds);
  } catch {
    // Graceful degradation: if Redis is down, we can't block the token
    // Log this as a security warning
    console.warn(`Failed to block token jti=${jti} — Redis unavailable`);
  }
}

/** Returns true if the token's jti has been blocked */
export async function isTokenBlocked(jti: string): Promise<boolean> {
  try {
    const client = getRedis();
    const result = await client.get(`blocklist:${jti}`);
    return result !== null;
  } catch {
    // If Redis is down, allow the request (availability > security for degraded mode)
    return false;
  }
}
```

**Update `backend/src/lib/jwt.ts`:**
- Add `jti` (JWT ID) to the token payload — generate with `crypto.randomUUID()`
- Add `jti` to `JWTPayload` interface
- Export a `getTokenRemainingTtl(token)` helper that returns seconds until expiry

```typescript
export function signToken(payload: Omit<JWTPayload, "iat" | "exp" | "jti">): string {
  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN_SECONDS,
    issuer: TOKEN_CONFIG.issuer,
    audience: TOKEN_CONFIG.audience,
    jwtid: crypto.randomUUID(), // adds jti claim
  };
  return jwt.sign(payload, SECRET, options);
}
```

**Update `backend/src/middleware/auth.ts`:**
After verifying the token signature, check the blocklist:

```typescript
const payload = verifyToken(token);

// Check JWT blocklist (Redis)
const { isTokenBlocked } = await import("../lib/redis.js");
if (await isTokenBlocked(payload.jti!)) {
  res.status(401).json({ error: "Token has been revoked" });
  return;
}

req.user = payload;
```

**Update `POST /api/auth/logout`** to call `blockToken(payload.jti, remainingTtl)` before clearing the cookie.

**Add Redis to `docker-compose.yml`:**

```yaml
redis:
  image: redis:7-alpine
  container_name: afritalent-redis
  ports:
    - "6379:6379"
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 3s
    retries: 5
```

Add `REDIS_URL: redis://redis:6379` to the backend service environment and `depends_on` the redis service.

**Update `backend/.env.example`:**
Add `REDIS_URL="redis://localhost:6379"` with a comment explaining it's required for token revocation.

**Acceptance test:**
1. Login and get a working session (confirm authenticated request succeeds)
2. Call `POST /api/auth/logout`
3. Attempt to use the same token — expect `401 Token has been revoked`

---

### FIX-5: Cap pagination `limit` parameter at 100

**The problem:** All paginated endpoints accept an arbitrary `limit` query parameter with no upper bound, allowing a caller to request unlimited rows.

**Fix in** `backend/src/routes/jobs.ts`, `backend/src/routes/admin.ts`, and any other route that paginates:

Replace:
```typescript
const take = parseInt(limit as string);
```
With:
```typescript
const take = Math.min(parseInt(limit as string) || 10, 100);
```

Also guard `skip` from NaN:
```typescript
const skip = (Math.max(parseInt(page as string) || 1, 1) - 1) * take;
```

Apply this pattern consistently to ALL paginated routes: `GET /api/jobs`, `GET /api/admin/jobs`, `GET /api/admin/users`, `GET /api/admin/resources`, `GET /api/admin/reviews`, `GET /api/resources`.

**Acceptance test:**
```bash
curl "http://localhost:4000/api/jobs?limit=9999&page=1"
# Confirm the response contains at most 100 items and pagination.limit shows 100
```

---

### FIX-6: Replace all `console.error` with structured Pino logger

**The problem:** Every route's `catch` block uses `console.error(...)`, bypassing Pino's structured logging, redaction, and log aggregation.

**In every file under `backend/src/routes/`** (`auth.ts`, `jobs.ts`, `applications.ts`, `resources.ts`, `admin.ts`):

1. Import the logger at the top: `import logger from "../lib/logger.js";`
2. Replace every `console.error("Some message:", error)` with:
   ```typescript
   logger.error({ err: error, requestId: req.requestId }, "Descriptive message here");
   ```
   Use a short, consistent, searchable message string (e.g., `"Register failed"`, `"Job create failed"`, `"Application status update failed"`).

Note: In routes where `req` is not in scope (e.g., router-level middleware handlers like admin stats), use `logger.error({ err: error }, "Admin stats failed")`.

**Acceptance test:** Start the backend in dev, trigger a DB error (e.g., disconnect DB), and confirm the error appears as structured JSON in the console with `level`, `err`, `requestId`, and `msg` fields rather than a raw `console.error` line.

---

### FIX-7: Enforce HTTPS-only `cvUrl` — restrict to safe origins

**The problem:** `cvUrl` in `backend/src/routes/applications.ts` accepts any URL string, including internal network addresses (SSRF risk if the backend ever fetches it; also a data integrity problem).

**Fix:** Update the `applySchema` to enforce:
1. HTTPS only (no `http://`)
2. Optionally restrict to known file hosting domains

```typescript
const ALLOWED_CV_DOMAINS = (process.env.ALLOWED_CV_DOMAINS || "")
  .split(",")
  .map(d => d.trim())
  .filter(Boolean);

const applySchema = z.object({
  jobId: z.string().uuid(),
  cvUrl: z
    .string()
    .url()
    .refine(
      (url) => url.startsWith("https://"),
      { message: "CV URL must use HTTPS" }
    )
    .refine(
      (url) => {
        if (ALLOWED_CV_DOMAINS.length === 0) return true; // No allowlist configured — accept any HTTPS URL
        try {
          const hostname = new URL(url).hostname;
          return ALLOWED_CV_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`));
        } catch {
          return false;
        }
      },
      { message: "CV URL domain is not allowed" }
    )
    .optional(),
  coverLetter: z.string().max(5000).optional(),
});
```

Add `ALLOWED_CV_DOMAINS` to `backend/.env.example` with a comment:
```
# Comma-separated list of allowed domains for CV URLs (leave empty to allow any HTTPS URL)
# Example: ALLOWED_CV_DOMAINS=s3.amazonaws.com,storage.googleapis.com,drive.google.com
ALLOWED_CV_DOMAINS=""
```

**Acceptance test:**
```bash
# Should fail
curl -X POST http://localhost:4000/api/applications \
  -H "Authorization: Bearer <candidate_token>" \
  -H "Content-Type: application/json" \
  -d '{"jobId":"<valid-uuid>","cvUrl":"http://internal-server/secret"}'
# Expect: 400 Validation failed, CV URL must use HTTPS
```

---

## P2 — Medium Priority

### FIX-8: Soft delete for Jobs (prevent cascade loss of application history)

**The problem:** `DELETE /api/jobs/:id` hard-deletes the job. Candidates lose their application history. The `Application.jobId` FK has `ON DELETE RESTRICT` in the migration, so currently deleting a job with applications will throw a DB error — but that means employers can't delete a job that has applications at all, which is also bad UX.

**Prisma schema change in `backend/prisma/schema.prisma`:**

Add to the `Job` model:
```prisma
deletedAt DateTime?
```

Add this index:
```prisma
@@index([deletedAt])
```

Run: `npx prisma migrate dev --name add_job_soft_delete`

**Backend changes:**

1. In `GET /api/jobs` (public list), add `deletedAt: null` to the `where` clause alongside `status: JobStatus.PUBLISHED`
2. In `GET /api/jobs/:slug`, add `deletedAt: null` to the lookup
3. In `GET /api/jobs/employer/my-jobs`, add `deletedAt: null`
4. In all `admin.ts` job queries, add `deletedAt: null` (admins shouldn't see deleted jobs in normal views; add a separate `GET /api/admin/jobs/deleted` if needed later)
5. In `DELETE /api/jobs/:id` (employer route), replace `prisma.job.delete(...)` with:
   ```typescript
   await prisma.job.update({
     where: { id: req.params.id },
     data: { deletedAt: new Date() },
   });
   res.json({ message: "Job deleted successfully" });
   ```
6. In `PUT /api/jobs/:id` (employer update), add `deletedAt: null` to the `findFirst` ownership check so employers can't update soft-deleted jobs

**Acceptance test:**
1. Create a job (as employer) and apply to it (as candidate)
2. Delete the job (as employer) — should succeed with `{ message: "Job deleted successfully" }`
3. `GET /api/jobs` — confirm the deleted job no longer appears
4. `GET /api/applications/my` (as candidate) — confirm the application still shows (job FK not broken)
5. Verify the job record in DB has `deletedAt` set, not actually deleted

---

### FIX-9: Add `DRAFT` status workflow for employers

**The problem:** The `JobStatus` enum includes `DRAFT` but the `POST /api/jobs` endpoint always sets `status: JobStatus.PENDING_REVIEW`. Employers cannot save a draft and return to it.

**Backend changes in `backend/src/routes/jobs.ts`:**

Update `createJobSchema` to accept an optional `saveDraft` boolean:
```typescript
const createJobSchema = z.object({
  // ... existing fields ...
  saveDraft: z.boolean().optional().default(false),
});
```

In the `POST /api/jobs` handler:
```typescript
const job = await prisma.job.create({
  data: {
    ...data,
    slug: generateSlug(data.title),
    tags: data.tags || [],
    status: data.saveDraft ? JobStatus.DRAFT : JobStatus.PENDING_REVIEW,
    employerId: employer.id,
  },
});
```

Update `updateJobSchema` similarly — add `saveDraft: z.boolean().optional()`:

In the `PUT /api/jobs/:id` handler, determine the new status:
```typescript
let newStatus: JobStatus = JobStatus.PENDING_REVIEW;
if (data.saveDraft) {
  newStatus = JobStatus.DRAFT; // Employer explicitly saving as draft
} else if (existingJob.status === JobStatus.DRAFT && !data.saveDraft) {
  newStatus = JobStatus.PENDING_REVIEW; // Submitting a draft for review
} else {
  newStatus = JobStatus.PENDING_REVIEW; // Re-submitting for review after edit
}
```

Ensure `GET /api/jobs/employer/my-jobs` returns jobs of ALL statuses (including DRAFT) for the employer — it currently does, just confirm `deletedAt: null` is also added here from FIX-8.

**Acceptance test:**
```bash
# Create a draft job
curl -X POST http://localhost:4000/api/jobs \
  -H "Authorization: Bearer <employer_token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Job","description":"A test job description","location":"Remote","type":"Full-time","seniority":"Mid","saveDraft":true}'
# Confirm response has status: "DRAFT"

# Confirm it does NOT appear in public job listings
curl http://localhost:4000/api/jobs | grep "Test Job"
# Expect: no result

# Submit the draft for review
curl -X PUT http://localhost:4000/api/jobs/<draft_id> \
  -H "Authorization: Bearer <employer_token>" \
  -H "Content-Type: application/json" \
  -d '{"saveDraft":false}'
# Confirm response has status: "PENDING_REVIEW"
```

---

### FIX-10: Replace timestamp-based slug with nanoid

**The problem:** `Date.now().toString(36)` used in `generateSlug` is not collision-proof under concurrent writes and is predictable/guessable.

**Fix in `backend/src/routes/jobs.ts`:**

```typescript
import { nanoid } from "nanoid";

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60); // cap base length
  return `${base}-${nanoid(8)}`; // 8-char URL-safe random suffix
}
```

**Acceptance test:** Create two jobs with the same title — confirm they get different slugs.

---

### FIX-11: Add `POST /api/admin/resources` endpoint (resource creation)

**The problem:** There is no way to create a `Resource` article via the API. Content can only be added directly to the database, which is not operational.

**Add to `backend/src/routes/admin.ts`:**

```typescript
const createResourceSchema = z.object({
  title: z.string().min(3).max(255),
  slug: z.string().min(3).max(255).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  excerpt: z.string().min(10).max(500),
  content: z.string().min(10),
  category: z.string().min(2).max(100),
  coverImage: z.string().url().optional(),
});

// POST /api/admin/resources - Create a new resource
router.post("/resources", async (req: Request, res: Response) => {
  try {
    const data = createResourceSchema.parse(req.body);

    // Check slug uniqueness
    const existing = await prisma.resource.findUnique({ where: { slug: data.slug } });
    if (existing) {
      res.status(400).json({ error: "A resource with this slug already exists" });
      return;
    }

    const resource = await prisma.resource.create({
      data: {
        ...data,
        published: false, // Always starts unpublished; use /publish to go live
      },
    });

    res.status(201).json(resource);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    logger.error({ err: error }, "Create resource failed");
    res.status(500).json({ error: "Internal server error" });
  }
});
```

Also expose this in `frontend/src/lib/api.ts` in the `admin` object:
```typescript
createResource: (data: CreateResourceData, token: string) =>
  fetchAPI<Resource>("/api/admin/resources", {
    method: "POST",
    body: JSON.stringify(data),
    token,
  }),
```

Add the `CreateResourceData` interface.

**Acceptance test:**
```bash
curl -X POST http://localhost:4000/api/admin/resources \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"How to Land a Remote Job","slug":"how-to-land-remote-job","excerpt":"A guide for African engineers.","content":"Full content here...","category":"Career"}'
# Expect: 201 with resource object, published: false
```

---

## P3 — Architecture Improvements

### FIX-12: API versioning — prefix all routes with `/api/v1/`

**The problem:** Routes are at `/api/*` with no version prefix, making future breaking changes impossible to ship without coordinating all clients simultaneously.

**Backend change in `backend/src/server.ts`:**

Change all route mounts:
```typescript
// Before
app.use("/api/auth", authRoutes);
app.use("/api/jobs", jobsRoutes);
// etc.

// After
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/jobs", jobsRoutes);
app.use("/api/v1/applications", applicationsRoutes);
app.use("/api/v1/resources", resourcesRoutes);
app.use("/api/v1/admin", adminRoutes);

// Backwards-compatible aliases (temporary, remove in Phase 4)
app.use("/api/auth", authRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api/applications", applicationsRoutes);
app.use("/api/resources", resourcesRoutes);
app.use("/api/admin", adminRoutes);
```

**Frontend change in `frontend/src/lib/api.ts`:**

Update the `fetchAPI` base path from `/api/` to `/api/v1/` throughout — just change the endpoint string prefix in every `fetchAPI` call. The backwards-compatible aliases on the backend mean no immediate breakage.

**Acceptance test:**
```bash
# New versioned endpoint should work
curl http://localhost:4000/api/v1/jobs
# Old endpoint should still work (backwards compat)
curl http://localhost:4000/api/jobs
```

---

### FIX-13: PostgreSQL full-text search index on Jobs

**The problem:** Job search uses Prisma's `contains` with `mode: "insensitive"` which compiles to `ILIKE '%term%'` — a sequential full table scan that will not scale.

**Prisma schema change in `backend/prisma/schema.prisma`:**

Note: Prisma does not natively manage PostgreSQL `tsvector` GIN indexes. Use a raw migration.

Create the migration manually:
```bash
npx prisma migrate dev --name add_job_fulltext_search --create-only
```

Then edit the generated migration SQL file to add:
```sql
-- Add full-text search vector column
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "searchVector" tsvector;

-- Populate existing rows
UPDATE "Job" SET "searchVector" = to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''));

-- Create GIN index
CREATE INDEX "Job_searchVector_idx" ON "Job" USING GIN ("searchVector");

-- Create trigger to auto-update vector on insert/update
CREATE OR REPLACE FUNCTION job_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" := to_tsvector('english', coalesce(NEW.title, '') || ' ' || coalesce(NEW.description, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER job_search_vector_trigger
BEFORE INSERT OR UPDATE ON "Job"
FOR EACH ROW EXECUTE FUNCTION job_search_vector_update();
```

Run: `npx prisma migrate dev`

**Backend change in `backend/src/routes/jobs.ts`:**

Replace the `search` filter block with a raw query approach using Prisma's `$queryRaw` for the search, or use a hybrid: use full-text when search is provided, fallback to ILIKE for short queries. A pragmatic approach:

```typescript
if (search) {
  // Use PostgreSQL full-text search for better performance and relevance
  where.searchVector = {
    // Prisma doesn't support tsvector natively, so use raw filter
    // Alternative: restructure to use prisma.$queryRaw for search endpoint
  };
}
```

Since Prisma doesn't support `tsvector` in the where clause natively, refactor the search path: when a `search` param is present, use `prisma.$queryRaw` to fetch matching job IDs first, then fetch full records normally. Wrap this in a helper function:

```typescript
async function getMatchingJobIds(search: string): Promise<string[]> {
  const results = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Job"
    WHERE "searchVector" @@ plainto_tsquery('english', ${search})
    AND status = 'PUBLISHED'
    AND "deletedAt" IS NULL
    ORDER BY ts_rank("searchVector", plainto_tsquery('english', ${search})) DESC
    LIMIT 200
  `;
  return results.map(r => r.id);
}
```

Then in the list handler: if `search` is provided, use `where.id = { in: await getMatchingJobIds(search) }` and skip the `contains` filter.

**Acceptance test:**
```bash
# Confirm search works and check query plan
# Run in psql: EXPLAIN ANALYZE SELECT * FROM "Job" WHERE "searchVector" @@ plainto_tsquery('english', 'engineer');
# Confirm: "Bitmap Index Scan on Job_searchVector_idx" appears in the plan (not Seq Scan)
curl "http://localhost:4000/api/jobs?search=software+engineer"
# Confirm results are returned correctly
```

---

## Local Testing Procedure

After implementing all fixes, verify the full stack locally:

### Option A — Development servers (fastest iteration)

```bash
# Terminal 1: Start database
docker-compose up postgres redis

# Terminal 2: Start backend
cd backend
cp .env.example .env  # edit DATABASE_URL, JWT_SECRET, REDIS_URL if needed
npm run dev

# Terminal 3: Start frontend
cd frontend
npm run dev
```

### Option B — Full Docker Compose stack (production parity)

```bash
# Build and start everything
JWT_SECRET=$(openssl rand -base64 32) docker-compose up --build

# Run migrations (if not auto-run)
docker exec afritalent-backend npx prisma migrate deploy

# Seed data
docker exec afritalent-backend npm run prisma:seed
```

### Smoke test checklist (run these curl commands in order):

```bash
export API=http://localhost:4000/api/v1

# 1. Health
curl $API/../health   # Expect: {"status":"ok","db":"connected"}

# 2. Register candidate
curl -X POST $API/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test-cand@test.com","password":"Password123!","name":"Test Candidate","role":"CANDIDATE"}' \
  -c cookies.txt
# Expect: 201 with user object; no token in localStorage (check browser DevTools)

# 3. Login and confirm cookie is set
curl -X POST $API/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"candidate@example.com","password":"Password123!"}' \
  -c cookies.txt -b cookies.txt -v
# Expect: Set-Cookie header with auth_token HttpOnly

# 4. Restore session via /me (simulating page refresh — no explicit token)
export CANDIDATE_TOKEN=$(curl -s -X POST $API/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"candidate@example.com","password":"Password123!"}' | jq -r '.token')

curl $API/auth/me -H "Authorization: Bearer $CANDIDATE_TOKEN"
# Expect: 200 with user object

# 5. Employer login
export EMPLOYER_TOKEN=$(curl -s -X POST $API/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"employer@example.com","password":"Password123!"}' | jq -r '.token')

# 6. Create draft job
DRAFT_JOB=$(curl -s -X POST $API/jobs \
  -H "Authorization: Bearer $EMPLOYER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Senior Engineer","description":"A great senior engineering role at our company","location":"Remote","type":"Full-time","seniority":"Senior","saveDraft":true}')
echo $DRAFT_JOB | jq '.status'  # Expect: "DRAFT"
DRAFT_ID=$(echo $DRAFT_JOB | jq -r '.id')

# 7. Confirm draft not visible in public job list
curl $API/jobs | jq '.jobs | length'  # Should not include the draft

# 8. Submit draft for review
curl -X PUT $API/jobs/$DRAFT_ID \
  -H "Authorization: Bearer $EMPLOYER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"saveDraft":false}' | jq '.status'  # Expect: "PENDING_REVIEW"

# 9. Admin approves job
export ADMIN_TOKEN=$(curl -s -X POST $API/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Password123!"}' | jq -r '.token')

curl -X PUT $API/admin/jobs/$DRAFT_ID/review \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"APPROVED"}' | jq '.status'  # Expect: "PUBLISHED"

# 10. Confirm job now visible publicly
curl $API/jobs | jq '.jobs[0].title'  # Should include "Senior Engineer"

# 11. Candidate applies with invalid cvUrl (http://)
curl -X POST $API/applications \
  -H "Authorization: Bearer $CANDIDATE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"jobId\":\"$DRAFT_ID\",\"cvUrl\":\"http://evil.com/cv.pdf\"}"
# Expect: 400 — CV URL must use HTTPS

# 12. Candidate applies with valid cvUrl
curl -X POST $API/applications \
  -H "Authorization: Bearer $CANDIDATE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"jobId\":\"$DRAFT_ID\",\"cvUrl\":\"https://drive.google.com/my-cv.pdf\",\"coverLetter\":\"I am very interested.\"}"
# Expect: 201

# 13. Employer soft-deletes the job
curl -X DELETE $API/jobs/$DRAFT_ID \
  -H "Authorization: Bearer $EMPLOYER_TOKEN"
# Expect: 200 {"message":"Job deleted successfully"}

# 14. Confirm job gone from public list but application still exists for candidate
curl $API/applications/my -H "Authorization: Bearer $CANDIDATE_TOKEN" | jq '.[0].job.title'
# Expect: "Senior Engineer" (application still exists, soft delete preserved it)

# 15. Logout and confirm token is revoked
curl -X POST $API/auth/logout -H "Authorization: Bearer $CANDIDATE_TOKEN" -b cookies.txt -c cookies.txt
curl $API/auth/me -H "Authorization: Bearer $CANDIDATE_TOKEN"
# Expect: 401 Token has been revoked

# 16. Test pagination cap
curl "$API/jobs?limit=9999" | jq '.pagination.limit'
# Expect: 100
```

---

## Important Constraints

- Do NOT change the Prisma schema `provider` or database connection logic beyond what is described
- Do NOT remove the `/health`, `/ready`, `/live` endpoints — these are used by ALB and Docker health checks
- Do NOT change the existing `AdminReview` audit trail logic — it must keep recording all approvals/rejections
- Do NOT change the `bcrypt` cost factor or JWT signing algorithm
- The backwards-compatible `/api/*` route aliases (from FIX-12) must remain until explicitly removed in a future PR
- All TypeScript must compile without errors — run `npm run build` in `backend/` before considering the work done
- The `docker-compose up --build` stack must come up healthy end-to-end

## Definition of Done

- [ ] `npm run build` passes in `backend/` with zero TypeScript errors
- [ ] `npm run build` passes in `frontend/` with zero TypeScript errors
- [ ] All 16 smoke test curl commands pass
- [ ] `docker-compose up --build` stack comes up fully healthy (all health checks green)
- [ ] The `/api/v1/` versioned endpoints work AND the legacy `/api/` aliases still work
- [ ] No JWT is stored in `localStorage` (verify in browser DevTools)
- [ ] An HttpOnly `auth_token` cookie is set on login (verify in browser DevTools)
- [ ] A revoked token returns 401 after logout
- [ ] A job with applications can be soft-deleted without DB errors
- [ ] `SECURITY.md` updated to reflect: cookie-based token storage, Redis blocklist, soft deletes
