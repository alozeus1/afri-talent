# AfriTalent Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all workflow dead-ends blocking the employer→candidate round-trip and auth flows so AfriTalent can accept real users without hitting silent failures, 404s, or missing CTAs.

**Architecture:** Targeted surgical fixes across four areas — employer job-post feedback, employer-candidate messaging entry points, email-verify return flow, and frontend resilience for external-service degradation. No new routes needed; all backend APIs are already wired. Changes are additive UI/type fixes with one small backend field addition.

**Tech Stack:** Next.js 14 App Router (TypeScript), Express 5 + Prisma backend, Tailwind CSS, Vitest (backend tests), Playwright (e2e)

---

## Pre-flight checklist

Before starting any task run these and confirm they are green:

```bash
cd /Users/ocheme/Desktop/Client-Projects/afri-tech/backend && npx tsc --noEmit
cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend && npx tsc --noEmit
cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend && npm run lint
```

---

## File Map

| File | What changes |
|------|-------------|
| `backend/src/routes/jobs.ts` | Add `pendingReason` field to 201 response when job goes to review |
| `frontend/src/lib/api.ts` | Add `locked`, `upgradeRequired` to `Application` type; add `pendingReason` to job create response type |
| `frontend/src/app/employer/jobs/new/page.tsx` | Show "job published" vs "job in review" success state after submit |
| `frontend/src/app/employer/jobs/[id]/applications/page.tsx` | Add "Message candidate" button per application card |
| `frontend/src/app/candidate/applications/page.tsx` | Add "Messages" link per application card |
| `frontend/src/app/verify-email/page.tsx` | Read `verifyReturnTo` from sessionStorage after success |
| `frontend/src/components/jobs/job-apply-panel.tsx` | On `EMAIL_VERIFICATION_REQUIRED` error: store returnTo and show verify prompt |
| `frontend/src/app/notifications/page.tsx` | Verify saved-search notification link is `/candidate/saved-searches` |
| `frontend/src/app/candidate/salary/page.tsx` | Wrap Phase4-gated call in graceful catch |
| `frontend/src/app/employer/integrations/page.tsx` | Wrap any Phase4-gated call in graceful catch |
| `frontend/src/app/blog/page.tsx` | Replace empty state with early-access messaging |
| `frontend/src/app/candidate/trust/page.tsx` | Show actionable error when S3 upload returns `S3_NOT_CONFIGURED` |
| `frontend/src/app/employer/trust/page.tsx` | Same S3 error handling |
| `STAGING_RUNBOOK.md` | Add trust queue review SLA section |

---

## Task 1 — Employer sees job status after posting (A1)

**Problem:** After submitting a job, the employer is silently redirected to `/employer` with no indication of whether the job was published instantly or is pending review.

**Files:**
- Modify: `backend/src/routes/jobs.ts` (~line 473, inside the success `res.status(201).json(...)`)
- Modify: `frontend/src/lib/api.ts` (Job type / `jobs.create` return type)
- Modify: `frontend/src/app/employer/jobs/new/page.tsx` (submit handler and post-submit state)

---

- [ ] **Step 1.1 — Read the current 201 response in jobs.ts**

  Open `backend/src/routes/jobs.ts` and find the `res.status(201).json({ job, ... })` call inside the `POST /` handler. Confirm what fields it currently returns. It should look similar to:

  ```typescript
  res.status(201).json({
    job,
    trustCase: requiresModeration ? trustCase : undefined,
    // ... other fields
  });
  ```

- [ ] **Step 1.2 — Add `pendingReason` to the 201 response**

  In `backend/src/routes/jobs.ts`, find the final `res.status(201).json(...)` block inside the POST handler. Add `pendingReason` based on `requiresModeration`:

  ```typescript
  res.status(201).json({
    job,
    trustCase: requiresModeration ? trustCase : undefined,
    pendingReason: requiresModeration
      ? "Your job is under review. Verified employers publish instantly — complete trust verification to skip the queue."
      : null,
  });
  ```

- [ ] **Step 1.3 — Typecheck backend**

  ```bash
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech/backend && npx tsc --noEmit
  ```

  Expected: zero errors.

- [ ] **Step 1.4 — Update `jobs.create` return type in api.ts**

  Open `frontend/src/lib/api.ts`. Find the `jobs.create(...)` call (search for `fetchAPI<Job>("/api/jobs"`). Change the generic to include `pendingReason`:

  ```typescript
  // Before:
  fetchAPI<Job>("/api/jobs", { ... })

  // After:
  fetchAPI<Job & { pendingReason: string | null }>("/api/jobs", { ... })
  ```

- [ ] **Step 1.5 — Add post-submit success state to the employer new job page**

  Open `frontend/src/app/employer/jobs/new/page.tsx`.

  Add a state variable after the existing state declarations:

  ```typescript
  const [submitted, setSubmitted] = useState<{ jobId: string; pending: boolean; pendingReason: string | null } | null>(null);
  ```

  Update `handleSubmit` — replace `router.push(localizePath("/employer", locale))` with:

  ```typescript
  const result = await jobs.create({
    title: formData.title,
    description: formData.description,
    location: formData.location,
    type: formData.type,
    seniority: formData.seniority,
    salaryMin: formData.salaryMin ? parseInt(formData.salaryMin, 10) : undefined,
    salaryMax: formData.salaryMax ? parseInt(formData.salaryMax, 10) : undefined,
    currency: formData.currency || undefined,
    tags: formData.tags ? formData.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
    applicationUrl: formData.applicationUrl || undefined,
  });
  setSubmitted({
    jobId: result.id,
    pending: !!result.pendingReason,
    pendingReason: result.pendingReason ?? null,
  });
  ```

  Add the success screen before the main `return` (early-return pattern):

  ```typescript
  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className={`w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center ${submitted.pending ? "bg-amber-100" : "bg-emerald-100"}`}>
          {submitted.pending ? (
            <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          {submitted.pending ? "Job submitted for review" : "Job published!"}
        </h1>
        <p className="text-gray-600 mb-8">
          {submitted.pending
            ? submitted.pendingReason
            : "Your job is live and visible to candidates now."}
        </p>
        <div className="flex justify-center gap-4">
          <Link href={localizePath("/employer", locale)}>
            <Button>Go to dashboard</Button>
          </Link>
          {submitted.pending && (
            <Link href={localizePath("/employer/trust", locale)}>
              <Button variant="outline">Complete verification</Button>
            </Link>
          )}
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 1.6 — Typecheck frontend**

  ```bash
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend && npx tsc --noEmit
  ```

  Expected: zero new errors.

- [ ] **Step 1.7 — Commit**

  ```bash
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech
  git add backend/src/routes/jobs.ts frontend/src/lib/api.ts frontend/src/app/employer/jobs/new/page.tsx
  git commit -m "fix(employer): show job published vs pending-review status after posting"
  ```

---

## Task 2 — Fix Application type (locked / upgradeRequired) (B1)

**Problem:** `Application` type in `api.ts` does not include `locked` and `upgradeRequired` which the backend already returns when the employer lacks a subscription. The employer applications page casts these with a TypeScript hack.

**Files:**
- Modify: `frontend/src/lib/api.ts` (Application interface)
- Modify: `frontend/src/app/employer/jobs/[id]/applications/page.tsx` (remove cast)

---

- [ ] **Step 2.1 — Add fields to Application type in api.ts**

  In `frontend/src/lib/api.ts`, find the `Application` interface/type (search for `type Application` or `interface Application`). Add the two optional fields:

  ```typescript
  export interface Application {
    id: string;
    jobId: string;
    candidateId: string;
    status: string;
    coverLetter?: string | null;
    cvUrl?: string | null;
    createdAt: string;
    updatedAt: string;
    candidate?: { id: string; name: string; email: string };
    job?: { id: string; title: string; slug: string };
    locked?: boolean;
    upgradeRequired?: boolean;
  }
  ```

  (Match the exact existing shape — just add `locked` and `upgradeRequired` to whatever fields already exist.)

- [ ] **Step 2.2 — Remove the cast hack in employer applications page**

  Open `frontend/src/app/employer/jobs/[id]/applications/page.tsx`. Find:

  ```typescript
  setCandidateAccessLocked(response.some((application) => Boolean((application as Application & { locked?: boolean }).locked)));
  ```

  Replace with:

  ```typescript
  setCandidateAccessLocked(response.some((application) => Boolean(application.locked)));
  ```

- [ ] **Step 2.3 — Typecheck**

  ```bash
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend && npx tsc --noEmit
  ```

  Expected: zero errors.

- [ ] **Step 2.4 — Commit**

  ```bash
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech
  git add frontend/src/lib/api.ts frontend/src/app/employer/jobs/\[id\]/applications/page.tsx
  git commit -m "fix(types): add locked and upgradeRequired to Application type"
  ```

---

## Task 3 — Messaging entry point: employer applications page (A2-employer)

**Problem:** Employers can see candidate applications but have no way to send a message. The messaging backend (`POST /api/messages/threads`) is complete.

**Files:**
- Modify: `frontend/src/app/employer/jobs/[id]/applications/page.tsx`

**API contract:** `POST /api/messages/threads` body: `{ participantId: string, jobId: string, message: string }`. Returns `{ id: string, ... }`. On conflict (thread exists): `409` with `{ threadId: string }`.

---

- [ ] **Step 3.1 — Add messaging state and handler**

  Open `frontend/src/app/employer/jobs/[id]/applications/page.tsx`.

  Add imports at the top (after existing imports):

  ```typescript
  import { messages } from "@/lib/api";
  ```

  Add state after the existing state declarations:

  ```typescript
  const [messagingId, setMessagingId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [messageError, setMessageError] = useState<string | null>(null);
  ```

  Add the handler function (before the `return`):

  ```typescript
  const startThread = async (candidateUserId: string) => {
    if (!user || !messageInput.trim()) return;
    setMessagingId(candidateUserId);
    setMessageError(null);
    try {
      const result = await messages.createThread({
        participantId: candidateUserId,
        jobId: params.id as string,
        message: messageInput.trim(),
      });
      router.push(localizePath(`/messages/${result.id}`, locale));
    } catch (err) {
      if (err instanceof Error && err.message.includes("already exists")) {
        const match = err.message.match(/threadId[": ]+([a-z0-9-]+)/i);
        if (match) {
          router.push(localizePath(`/messages/${match[1]}`, locale));
          return;
        }
      }
      setMessageError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setMessagingId(null);
    }
  };
  ```

- [ ] **Step 3.2 — Verify messages.createThread exists in api.ts**

  In `frontend/src/lib/api.ts`, search for `messages`. Find the `messages` object. If `createThread` does not exist, add it alongside the existing thread methods:

  ```typescript
  createThread: (data: { participantId: string; jobId?: string; applicationId?: string; message: string }) =>
    fetchAPI<{ id: string; participants: Array<{ id: string; name: string }>; createdAt: string }>(
      "/api/messages/threads",
      { method: "POST", body: JSON.stringify(data) }
    ),
  ```

- [ ] **Step 3.3 — Add "Message candidate" UI to each application card**

  In the application card JSX, find the `<div className="flex gap-2 mt-4">` block that contains the status buttons. Add the message panel below the status buttons:

  ```tsx
  {!candidateAccessLocked && application.candidate?.id && (
    <div className="mt-4 pt-4 border-t border-gray-100">
      {messageError && (
        <p className="text-xs text-red-500 mb-2">{messageError}</p>
      )}
      <div className="flex gap-2 items-start">
        <textarea
          className="flex-1 text-sm rounded-lg border border-gray-300 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
          rows={2}
          placeholder="Send a message to this candidate..."
          value={messagingId === application.candidate.id ? messageInput : ""}
          onChange={(e) => {
            setMessagingId(application.candidate!.id);
            setMessageInput(e.target.value);
          }}
        />
        <Button
          size="sm"
          disabled={messagingId === application.candidate.id && (!messageInput.trim())}
          onClick={() => startThread(application.candidate!.id)}
        >
          {messagingId === application.candidate.id && messageInput ? "Send" : "Message"}
        </Button>
      </div>
    </div>
  )}
  ```

- [ ] **Step 3.4 — Typecheck**

  ```bash
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend && npx tsc --noEmit
  ```

  Expected: zero errors.

- [ ] **Step 3.5 — Commit**

  ```bash
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech
  git add frontend/src/lib/api.ts frontend/src/app/employer/jobs/\[id\]/applications/page.tsx
  git commit -m "feat(messaging): add message-candidate panel to employer applications page"
  ```

---

## Task 4 — Messaging entry point: candidate applications page (A2-candidate)

**Problem:** Candidates have no way to see or start a conversation with an employer from their application tracker.

**Files:**
- Modify: `frontend/src/app/candidate/applications/page.tsx`

---

- [ ] **Step 4.1 — Fetch message threads alongside applications**

  Open `frontend/src/app/candidate/applications/page.tsx`.

  Add `messages` to the import from `@/lib/api`:

  ```typescript
  import {
    applications,
    candidateAnalytics,
    messages,
    Application,
    ApplicationFunnel,
    MessageThread,
  } from "@/lib/api";
  ```

  Add state:

  ```typescript
  const [threads, setThreads] = useState<MessageThread[]>([]);
  ```

  Update the `Promise.all` in `useEffect` to also fetch threads:

  ```typescript
  Promise.all([
    applications.my(),
    candidateAnalytics.applicationFunnel(),
    messages.threads().then((r) => r.threads).catch(() => [] as MessageThread[]),
  ])
    .then(([apps, funnelData, threadData]) => {
      setMyApplications(apps);
      setFunnel(funnelData);
      setThreads(threadData);
    })
    .catch((err) => setError(err instanceof Error ? err.message : "Failed to load data"))
    .finally(() => setLoading(false));
  ```

- [ ] **Step 4.2 — Add thread link to each application card**

  In the JSX, find the `sortedApplications.map((application) => ...)` block (the variable is `application` in that file based on the existing `setMyApplications` usage). After the existing status badge for each card, add:

  ```tsx
  {(() => {
    const thread = threads.find((t) => t.job?.id === application.jobId);
    return thread ? (
      <Link
        href={localizePath(`/messages/${thread.id}`, locale)}
        className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 mt-2"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3-3-3z" />
        </svg>
        View messages with employer
      </Link>
    ) : null;
  })()}
  ```

  If the loop variable differs (e.g. it's `app` not `application`), swap it — the key point is `application.jobId` must match a thread's `job.id`.

- [ ] **Step 4.3 — Typecheck**

  ```bash
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend && npx tsc --noEmit
  ```

  Expected: zero errors.

- [ ] **Step 4.4 — Commit**

  ```bash
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech
  git add frontend/src/app/candidate/applications/page.tsx
  git commit -m "feat(messaging): show employer thread link on candidate application cards"
  ```

---

## Task 5 — Post-email-verification returnTo flow (A3)

**Problem:** After verifying email, the candidate is redirected to `/candidate` dashboard. If they were in the middle of applying to a job, they lose their place.

**Part A:** In `job-apply-panel.tsx`, when apply fails with `EMAIL_VERIFICATION_REQUIRED`, store the current page URL and show a prompt.
**Part B:** In `verify-email/page.tsx`, after success, redirect to stored URL if present.

**Files:**
- Modify: `frontend/src/components/jobs/job-apply-panel.tsx`
- Modify: `frontend/src/app/verify-email/page.tsx`

---

- [ ] **Step 5.1 — Detect EMAIL_VERIFICATION_REQUIRED in apply panel**

  Open `frontend/src/components/jobs/job-apply-panel.tsx`.

  Add state:

  ```typescript
  const [emailVerifyNeeded, setEmailVerifyNeeded] = useState(false);
  ```

  In `handleApply`, inside the main `try/catch` for on-platform apply, update the catch block:

  ```typescript
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to apply";
    if (message.includes("EMAIL_VERIFICATION_REQUIRED") || message.toLowerCase().includes("verify your email")) {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("verifyReturnTo", window.location.href);
      }
      setEmailVerifyNeeded(true);
    } else {
      setApplyError(message);
    }
  }
  ```

  Do the same check in the external apply catch block (the first try/catch around the `await applications.apply({ jobId: job.id })`).

- [ ] **Step 5.2 — Show email verify prompt in the apply panel UI**

  In the JSX, inside the `<>` block that renders for non-employer/non-admin users (where `applyError` is shown), add the email verify banner above the apply button:

  ```tsx
  {emailVerifyNeeded && (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold mb-1">Verify your email to apply</p>
      <p className="mb-3">We sent a verification link to your email. Open it, then come back here to apply.</p>
      <Link href="/candidate" className="text-emerald-700 underline font-medium">
        Go to dashboard to resend
      </Link>
    </div>
  )}
  ```

- [ ] **Step 5.3 — Add returnTo state and read sessionStorage in verify-email page**

  Open `frontend/src/app/verify-email/page.tsx`.

  In `VerifyEmailInner`, add a state variable alongside the existing `status` and `message` state:

  ```typescript
  const [returnToUrl, setReturnToUrl] = useState<string | null>(null);
  ```

  Update the success handler inside the `verify` async function. Find:

  ```typescript
  setStatus("success");
  setMessage(data.message || "Email verified successfully!");
  ```

  Replace with:

  ```typescript
  setStatus("success");
  setMessage(data.message || "Email verified successfully!");
  if (typeof window !== "undefined") {
    const returnTo = sessionStorage.getItem("verifyReturnTo");
    if (returnTo) {
      sessionStorage.removeItem("verifyReturnTo");
      setReturnToUrl(returnTo);
      setTimeout(() => { window.location.href = returnTo; }, 1800);
    }
  }
  ```

- [ ] **Step 5.4 — Update success screen to show returnTo message**

  In the `{status === "success"}` JSX block, replace the hardcoded `<Link href="/candidate">`:

  ```tsx
  {status === "success" && (
    <>
      <div className="w-16 h-16 mx-auto mb-4 bg-emerald-100 rounded-full flex items-center justify-center">
        <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Email Verified!</h2>
      <p className="text-gray-600 dark:text-gray-300 mb-6">{message}</p>
      {returnToUrl ? (
        <p className="text-sm text-gray-500">Returning you to your job application...</p>
      ) : (
        <Link href="/candidate">
          <Button className="w-full">Go to Dashboard</Button>
        </Link>
      )}
    </>
  )}
  ```

- [ ] **Step 5.5 — Typecheck**

  ```bash
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend && npx tsc --noEmit
  ```

  Expected: zero errors.

- [ ] **Step 5.6 — Commit**

  ```bash
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech
  git add frontend/src/components/jobs/job-apply-panel.tsx frontend/src/app/verify-email/page.tsx
  git commit -m "fix(auth): return candidate to job after email verification"
  ```

---

## Task 6 — Verify saved-search notification links (B2)

**Problem:** Ticket 005 reports job-alert links may route to a missing page. Need to confirm the notification href is `/candidate/saved-searches` (exists) not `/candidate/job-alerts` (does not exist).

**Files:**
- Read: `frontend/src/app/notifications/page.tsx`
- Read: `backend/src/lib/candidate-retention.ts` (already confirmed href is correct there)
- Conditionally modify: `frontend/src/app/notifications/page.tsx` if wrong link found

---

- [ ] **Step 6.1 — Read notifications page for job-alert links**

  Open `frontend/src/app/notifications/page.tsx` and search for any string containing `job-alert`, `jobAlert`, `saved-searches`, `preferences`. Look for how the notification metadata drives the link shown to users.

  Expected finding: either the link is correct (`/candidate/saved-searches`) or it contains a wrong path.

- [ ] **Step 6.2 — Fix if wrong (conditional)**

  If you find a link pointing to `/candidate/job-alerts`:

  ```typescript
  // Replace any occurrence of:
  href="/candidate/job-alerts"
  // With:
  href="/candidate/saved-searches"
  ```

  If the link is driven by `notification.metadata`, check what key it uses and verify it resolves to `/candidate/saved-searches`. Update the resolver if needed.

  If already correct: this task is done with no file changes.

- [ ] **Step 6.3 — Typecheck and lint**

  ```bash
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend && npx tsc --noEmit && npm run lint
  ```

  Expected: zero errors.

- [ ] **Step 6.4 — Commit (only if changes were made)**

  ```bash
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech
  git add frontend/src/app/notifications/page.tsx
  git commit -m "fix(notifications): correct saved-search alert link to /candidate/saved-searches"
  ```

---

## Task 7 — Phase4 503 graceful handling (B4)

**Problem:** Backend routes gated by Phase4 feature flags return `503 { error: "Feature not enabled", code: "FEATURE_DISABLED" }`. If the frontend catches these with only `console.error`, users see a broken/stuck state.

**Files to audit:**
- `frontend/src/app/candidate/salary/page.tsx`
- `frontend/src/app/employer/integrations/page.tsx`
- Any file returned by: `grep -r "salaryNegotiation\|employerAi\|social\." frontend/src/app --include="*.tsx" -l`

---

- [ ] **Step 7.1 — Run the grep to find all Phase4 callers**

  ```bash
  grep -r "salaryNegotiation\|employerAi\|social\.\|employer\.ai\|bots\." \
    /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend/src/app \
    --include="*.tsx" -l
  ```

  Note the list of files returned.

- [ ] **Step 7.2 — Audit each file**

  For each file returned, search for `catch` blocks near the Phase4 API calls. The pattern to look for:

  ```typescript
  // BAD — only logs, no user-facing state update:
  .catch(console.error)
  .catch((err) => console.error(err))

  // GOOD — sets error state:
  .catch((err) => setError(err instanceof Error ? err.message : "This feature is not available right now."))
  ```

  For each `catch(console.error)` found near a Phase4 API call:

  a. Ensure there is an `error` state variable: `const [error, setError] = useState<string | null>(null)`.

  b. Change the catch: `.catch((err) => setError(err instanceof Error ? err.message : "This feature is not available right now."))`.

  c. Ensure the error state is rendered in JSX:

  ```tsx
  {error && (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      {error}
    </div>
  )}
  ```

- [ ] **Step 7.3 — Typecheck**

  ```bash
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend && npx tsc --noEmit
  ```

  Expected: zero errors.

- [ ] **Step 7.4 — Commit**

  ```bash
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech
  # Stage only the files you actually changed
  git add <changed files>
  git commit -m "fix(resilience): graceful empty states for Phase4-gated APIs returning 503"
  ```

---

## Task 8 — Blog page early-access state (B6)

**Problem:** `/blog` fetches resources with category `Weekly Hiring Trends`. No content is seeded. The page renders completely empty — looks broken.

**Files:**
- Modify: `frontend/src/app/blog/page.tsx`

---

- [ ] **Step 8.1 — Read the current empty-state rendering in blog/page.tsx**

  Open `frontend/src/app/blog/page.tsx`. Find where an empty results array is handled — look for `posts.length === 0` or similar.

- [ ] **Step 8.2 — Replace empty state with early-access messaging**

  Find the empty-state block. Replace whatever is there with:

  ```tsx
  {posts.length === 0 && !loading && (
    <div className="col-span-full py-20 text-center">
      <div className="mx-auto max-w-md">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-emerald-50 flex items-center justify-center">
          <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 12h6M7 8h2" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-3">Insights coming soon</h2>
        <p className="text-gray-600 mb-6">
          We&apos;re curating weekly hiring trends, remote work guides, and salary insights for African professionals. Check back soon.
        </p>
        <Link href="/resources">
          <Button variant="outline">Browse resources</Button>
        </Link>
      </div>
    </div>
  )}
  ```

  Make sure `Link` and `Button` are imported — add them to the import list if missing:

  ```typescript
  import Link from "next/link";
  import { Button } from "@/components/ui/button";
  ```

- [ ] **Step 8.3 — Typecheck and lint**

  ```bash
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend && npx tsc --noEmit && npm run lint
  ```

  Expected: zero errors.

- [ ] **Step 8.4 — Commit**

  ```bash
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech
  git add frontend/src/app/blog/page.tsx
  git commit -m "fix(blog): replace empty state with early-access message and resources link"
  ```

---

## Task 9 — OAuth button: verify graceful degradation (C1)

**Problem:** The OAuth buttons load providers dynamically from `GET /api/auth/oauth/providers`. If Google is unconfigured, `enabled: false` is returned. Need to confirm the component hides or disables unconfigured providers — not shows a broken button.

**Files:**
- Read: `frontend/src/components/auth/oauth-buttons.tsx`
- Conditionally modify: same file

---

- [ ] **Step 9.1 — Read OAuthButtons component**

  Open `frontend/src/components/auth/oauth-buttons.tsx`. Find where `providers` is rendered. Look for whether each provider is rendered only when `provider.enabled === true`, or if all providers are shown regardless.

- [ ] **Step 9.2 — Fix if disabled providers are shown**

  If the render does not filter on `enabled`, add the filter:

  ```tsx
  // Find something like:
  {providers.map((p) => (
    <button key={p.provider} ...>

  // Replace with:
  {providers.filter((p) => p.enabled).map((p) => (
    <button key={p.provider} ...>
  ```

  If it already filters: no change needed.

- [ ] **Step 9.3 — Verify the API response includes `enabled: false` for unconfigured providers**

  Read `backend/src/routes/oauth.ts` near line 382 (`router.get("/providers", ...)`). Confirm the response sets `enabled: false` when the provider's env vars are not set:

  ```typescript
  // Should look something like:
  {
    provider: "google",
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    enabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  }
  ```

  If `enabled` is always `true` regardless of env: fix it:

  ```typescript
  enabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  ```

- [ ] **Step 9.4 — Typecheck**

  ```bash
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech/backend && npx tsc --noEmit
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend && npx tsc --noEmit
  ```

  Expected: zero errors.

- [ ] **Step 9.5 — Commit (only if changes made)**

  ```bash
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech
  git add backend/src/routes/oauth.ts frontend/src/components/auth/oauth-buttons.tsx
  git commit -m "fix(auth): hide OAuth buttons when provider credentials are not configured"
  ```

---

## Task 10 — Trust verification: S3 and phone OTP error surfaces (C2 + C3)

**Problem:** Document uploads via `/api/files/presign` return `503 S3_NOT_CONFIGURED` when S3 is absent. Phone OTP returns an error when SMS is absent. Both error messages must reach the user as readable inline text — not silent failures or 500s.

**Files:**
- Read + conditionally modify: `frontend/src/app/candidate/trust/page.tsx`
- Read + conditionally modify: `frontend/src/app/employer/trust/page.tsx`
- Read: `backend/src/routes/trust.ts` (phone OTP handler — verify it returns a clean error not 500)

---

- [ ] **Step 10.1 — Read backend phone OTP handler**

  Open `backend/src/routes/trust.ts`. Find `router.post` for phone OTP (search for `request-otp`). Confirm the handler catches `SMS_NOT_CONFIGURED` or equivalent and returns a `503` with a message. If it throws unhandled: add the guard:

  ```typescript
  const smsConfigured = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  if (!smsConfigured) {
    res.status(503).json({
      error: "Phone verification is not available in this environment. Contact support.",
      code: "SMS_NOT_CONFIGURED",
    });
    return;
  }
  ```

- [ ] **Step 10.2 — Read candidate trust page upload flow**

  Open `frontend/src/app/candidate/trust/page.tsx`. Find where `POST /api/files/presign` or trust artifact submission is called. Look at the catch block.

  If the catch is `.catch(console.error)` or does not set a visible error state:

  ```typescript
  // Add / update the catch:
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    setUploadError(
      msg.includes("S3_NOT_CONFIGURED")
        ? "Document upload is not available in this environment. Contact your administrator."
        : msg || "Upload failed. Please try again."
    );
  })
  ```

  Ensure `uploadError` state is rendered inline near the upload button:

  ```tsx
  {uploadError && (
    <p className="text-sm text-red-600 mt-2">{uploadError}</p>
  )}
  ```

- [ ] **Step 10.3 — Same check for employer trust page**

  Open `frontend/src/app/employer/trust/page.tsx`. Apply the same pattern as Step 10.2 for any document upload or presign call.

- [ ] **Step 10.4 — Read phone OTP catch in candidate trust page**

  Find the handler that calls `trust.candidatePhone.requestOtp(...)`. Confirm the catch sets a readable error state rather than only logging. If not:

  ```typescript
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    setOtpError(
      msg.includes("SMS_NOT_CONFIGURED")
        ? "Phone verification is not available in this environment."
        : msg || "Failed to send code. Please try again."
    );
  })
  ```

- [ ] **Step 10.5 — Typecheck**

  ```bash
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech/backend && npx tsc --noEmit
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend && npx tsc --noEmit
  ```

  Expected: zero errors.

- [ ] **Step 10.6 — Commit**

  ```bash
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech
  git add backend/src/routes/trust.ts \
    frontend/src/app/candidate/trust/page.tsx \
    frontend/src/app/employer/trust/page.tsx
  git commit -m "fix(trust): surface S3 and SMS not-configured errors as readable inline messages"
  ```

---

## Task 11 — Trust admin ops runbook (C4)

**Problem:** Verification submissions land in the admin trust queue. Without a documented SLA, submissions stay `PENDING` forever.

**Files:**
- Modify: `STAGING_RUNBOOK.md`
- Create: `docs/ops/trust-review-runbook.md`

---

- [ ] **Step 11.1 — Create trust review runbook**

  Create `docs/ops/trust-review-runbook.md`:

  ```markdown
  # Trust Review Runbook

  ## Who reviews
  The admin user (bootstrapped via `BOOTSTRAP_ADMIN_EMAIL`) is responsible for
  reviewing the trust queue at launch. Access the queue at `/admin/trust`.

  ## SLA
  - Employer verification submissions: review within 24 hours of receipt.
  - Candidate verification submissions: review within 48 hours.
  - Abuse reports: review within 4 hours.

  ## How to access
  1. Log in with the admin account.
  2. Navigate to `/admin/trust`.
  3. The queue shows pending verification artifacts and risk cases.
  4. Click "Review" on any artifact to see the submission details and approve/reject.

  ## Approval criteria
  - Employer: Company name matches submitted document. LinkedIn URL (if provided) resolves.
  - Candidate: Government-issued ID is legible. Name matches profile.
  - Reject if: document is unreadable, name mismatch, or submission appears fraudulent.

  ## After review
  Approved artifacts increment the entity's trust score and may unlock the
  VERIFIED badge. Rejected artifacts send a notification to the user.
  ```

- [ ] **Step 11.2 — Add trust queue section to STAGING_RUNBOOK.md**

  Open `STAGING_RUNBOOK.md`. At the end of the file, add:

  ```markdown
  ## Trust Queue Coverage

  **URL:** `/admin/trust`
  **Runbook:** `docs/ops/trust-review-runbook.md`

  At launch, the bootstrap admin account must monitor the trust queue daily.
  Verification submissions that sit `PENDING` more than 48 hours degrade
  the user experience — verified users get higher-quality job matches and
  skip job moderation queues.
  ```

- [ ] **Step 11.3 — Commit**

  ```bash
  cd /Users/ocheme/Desktop/Client-Projects/afri-tech
  git add STAGING_RUNBOOK.md docs/ops/trust-review-runbook.md
  git commit -m "docs: add trust queue review runbook and SLA"
  ```

---

## Final validation

After all tasks are complete, run the full check suite:

```bash
cd /Users/ocheme/Desktop/Client-Projects/afri-tech/backend && npx tsc --noEmit && npm test
cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend && npx tsc --noEmit && npm run lint && npm run build
```

Expected: zero TypeScript errors, zero lint errors, build succeeds.

Then do a manual walkthrough of the three critical journeys:

1. **Employer posts job** → sees "published" or "pending review" message with next-action link
2. **Employer views applications** → can click "Message" → lands on `/messages/[id]`
3. **Candidate applies while unverified** → sees email verify prompt → verifies → redirects back to job page
