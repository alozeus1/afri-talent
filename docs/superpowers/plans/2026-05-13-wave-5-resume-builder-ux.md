# Wave 5 PR #3 — Resume Builder UX + Live Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `frontend/src/app/candidate/resume-builder/page.tsx` from a single-screen form into a 5-step guided flow with a persistent live preview, a client-side template selector, and a rubric-score panel that consumes the new `/api/skills/resume-builder/ats-rubric/score` endpoint.

**Architecture:** Page-level orchestrator stays in `page.tsx`. New presentational components live under `frontend/src/components/resume-builder/`. State is plain React `useState` (no new stores). Templates render the same `ResumePreviewData` view-model via three pure components. Rubric API errors are mapped to friendly errors via a 5-case switch inside the new `skills.scoreAtsRubric` helper.

**Tech Stack:** Next.js 16 (app router) + React 19 + Tailwind v4 + existing `@/components/ui/{card,button,badge}` + existing `@/lib/{api,friendly-error,auth-context}` + Playwright for E2E (qa-tester owns coverage in PR #4).

**Spec:** `/Users/ocheme/Desktop/Client-Projects/afri-tech/docs/superpowers/specs/2026-05-13-wave-5-resume-builder-ux-design.md`

**Branch:** `release/launch-wave-5-resume-builder-ats` (already fast-forwarded to `9e48a31`).

---

## File map

**Create:**
- `frontend/src/components/resume-builder/types.ts` — shared types (`ResumePreviewData`, `TemplateId`)
- `frontend/src/components/resume-builder/step-indicator.tsx`
- `frontend/src/components/resume-builder/basics-step.tsx`
- `frontend/src/components/resume-builder/experience-step.tsx`
- `frontend/src/components/resume-builder/education-step.tsx`
- `frontend/src/components/resume-builder/summary-step.tsx`
- `frontend/src/components/resume-builder/template-step.tsx`
- `frontend/src/components/resume-builder/live-preview.tsx`
- `frontend/src/components/resume-builder/rubric-score-panel.tsx`
- `frontend/src/components/resume-builder/template-renderers/classic.tsx`
- `frontend/src/components/resume-builder/template-renderers/modern.tsx`
- `frontend/src/components/resume-builder/template-renderers/minimal.tsx`

**Modify:**
- `frontend/src/lib/api.ts` — add `ResumeContent`, `RubricCriterion`, `AtsRubricResponse` types + `skills.scoreAtsRubric` helper with 5-case error switch
- `frontend/src/app/candidate/resume-builder/page.tsx` — replace the input/preview render branches with step-driven render; preserve auth/plan/profile-prefill logic

**Untouched (verified):**
- `frontend/src/app/candidate/resume-builder/page.tsx` lines 88 (`formHasDraft`), 100 (`fromProfile`), 129 (`applyProfileToForm`) — reused as-is
- `frontend/src/lib/friendly-error.ts` — `toFriendlyError` reused as-is, no shape change
- `frontend/src/components/ui/{card,button,badge,premium-gate,ats-score-display,loading-state}.tsx` — all reused as-is
- `frontend/src/app/[locale]/candidate/resume-builder/page.tsx` — re-export, untouched
- All inbound link sites under `candidate/page.tsx`, `candidate/job-matches/page.tsx`, `candidate/resume-templates/page.tsx`

---

## Task 1: Add API types + `scoreAtsRubric` helper with error switch

**Files:**
- Modify: `frontend/src/lib/api.ts` (append to existing `skills` object)

- [ ] **Step 1: Find the insertion point**

The existing `skills` export starts at line 3462. The `scanResumeAts` helper sits around line 3568. We add types near the top of the file (with other exported interfaces) and the new helper inside the `skills` object after `scanResumeAts`.

Grep to locate:

```bash
grep -n "scanResumeAts" /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend/src/lib/api.ts
grep -n "export const skills" /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend/src/lib/api.ts
grep -n "export interface GeneratedResume" /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend/src/lib/api.ts
```

- [ ] **Step 2: Add type exports**

Insert just above the `export const skills = {` block (use the line number from Step 1):

```ts
// ── Resume builder rubric types ──────────────────────────────────────────────
// Mirror of backend/src/lib/resume/rubric-schema.ts (verified verbatim against
// commit 630696a). Adding `seniority_signals` / `ats_compatibility_format` to
// the backend rubric requires zero frontend changes — the UI iterates `criteria`.
export type ResumeContent = Record<string, unknown>;

export interface RubricCriterion {
  key: string;
  label: string;
  score: number;     // 0..100 integer
  weight: number;    // 0..100 integer, sums to 100 across criteria
  notes: string[];
  present?: string[];
  missing?: string[];
}

export interface AtsRubricResponse {
  resumeVersionId: string | null;
  atsScore: number;
  matchScore: number | null;
  criteria: RubricCriterion[];
  suggestions: string[];
  optimizedContent: ResumeContent | null;
  source: "ai" | "template";
}
```

- [ ] **Step 3: Add `skills.scoreAtsRubric` helper**

Inside the `skills` object, just after `scanResumeAts: (data: { ... }) => fetchAPI<...>("/api/skills/resume-builder/scan-ats", ...),` — insert:

```ts
  scoreAtsRubric: async (data: {
    resumeContent: ResumeContent;
    targetJobId?: string;
    targetJobDescription?: string;
  }): Promise<AtsRubricResponse> => {
    // Omit undefined keys to keep the JSON tight and match the backend's
    // `null | undefined | missing` equivalence (verified in route handler).
    const body: Record<string, unknown> = { resumeContent: data.resumeContent };
    if (data.targetJobId) body.targetJobId = data.targetJobId;
    if (data.targetJobDescription) body.targetJobDescription = data.targetJobDescription;

    const res = await fetch(`${API_URL}/api/skills/resume-builder/ats-rubric/score`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      return res.json() as Promise<AtsRubricResponse>;
    }

    // Error mapping. Source of truth: backend/src/routes/skills/resume-builder.ts
    // at commit 3a07488 (PR #92). Five distinct codes plus unknown fallback.
    let payload: { code?: string; error?: string; limit_bytes?: number; received_bytes?: number; details?: unknown } = {};
    try {
      payload = await res.json();
    } catch {
      // Body wasn't JSON; fall through with empty payload.
    }

    const limitBytes = typeof payload.limit_bytes === "number" ? payload.limit_bytes : 256 * 1024;

    switch (payload.code) {
      case "RESUME_TOO_LARGE":
      case "RESUME_FIELD_TOO_LARGE":
        throw {
          title: "Resume is too large to score",
          description: `Try removing image data or trimming long fields. The limit is ${Math.round(limitBytes / 1024)} KB per field.`,
          tone: "warning" as const,
        };
      case "RESUME_NOT_SERIALIZABLE":
        throw {
          title: "Couldn't process your resume",
          description: "Your resume contains a self-reference. Try regenerating it and re-running the score.",
          tone: "error" as const,
        };
      case "VALIDATION_FAILED":
        // Surface zod issues to console for dev visibility; user gets a generic message.
        if (payload.details) {
          // eslint-disable-next-line no-console
          console.warn("[scoreAtsRubric] validation failed:", payload.details);
        }
        throw {
          title: "Couldn't score this resume",
          description: "Some fields don't look right. Try again or contact support if this keeps happening.",
          tone: "error" as const,
        };
      case "ATS_RUBRIC_INTERNAL_ERROR":
        throw {
          title: "Scoring is temporarily unavailable",
          description: "Please try again in a moment.",
          tone: "error" as const,
        };
      default:
        throw {
          title: "Scoring is temporarily unavailable",
          description: payload.error || `Request failed with status ${res.status}.`,
          tone: "error" as const,
        };
    }
  },
```

If `API_URL` and `getAuthHeader` aren't directly accessible in scope, use the existing pattern (likely `fetchAPI` wrapping). Confirm by reading the existing `scanResumeAts` and matching its plumbing exactly — if it uses `fetchAPI`, refactor the helper to use `fetchAPI` and intercept the error after `fetchAPI` throws (the existing `fetchAPI` likely throws on non-2xx with the body attached).

- [ ] **Step 4: Verify types resolve and existing build still passes**

```bash
cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend
npx tsc --noEmit
```

Expected: PASS (0 errors). If `fetch`, `API_URL`, or `getAuthHeader` are not in scope, refactor per the note in Step 3 and re-run.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(wave5): scoreAtsRubric helper + rubric types

Mirrors the backend rubric-schema.ts contract from PR #92 (verified
against commits 630696a + 3a07488). 5-case error switch maps
RESUME_TOO_LARGE / RESUME_FIELD_TOO_LARGE / RESUME_NOT_SERIALIZABLE /
VALIDATION_FAILED / ATS_RUBRIC_INTERNAL_ERROR to FriendlyError shapes
inside the helper so every call site gets typed errors for free."
```

---

## Task 2: Create shared types module

**Files:**
- Create: `frontend/src/components/resume-builder/types.ts`

- [ ] **Step 1: Create the file**

```ts
// frontend/src/components/resume-builder/types.ts
import type { GeneratedResume } from "@/lib/api";

export type TemplateId = "classic" | "modern" | "minimal";

export const TEMPLATE_IDS: readonly TemplateId[] = ["classic", "modern", "minimal"] as const;

export interface TemplateMeta {
  id: TemplateId;
  label: string;
  description: string;
}

export const TEMPLATES: readonly TemplateMeta[] = [
  { id: "classic", label: "Classic", description: "Serif, single-column, ATS-safe." },
  { id: "modern", label: "Modern", description: "Sans-serif with a two-column header." },
  { id: "minimal", label: "Minimal", description: "Tight monoline, single-column, no color." },
] as const;

export interface ResumePreviewData {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  targetRole: string;
  yearsExperience: string;
  summary: string;
  skills: string[];
  certifications: string[];
  workHistory: Array<{ company: string; title: string; period: string; description: string }>;
  educationHistory: Array<{ institution: string; degree: string; period: string }>;
  // Set after `generateResume` has been called; templates render this rawText
  // verbatim in a <pre> block when present (overrides per-field layout) so the
  // user sees the AI's output, not their inputs.
  generatedRawText?: string;
  generatedSource?: GeneratedResume["source"];
}

export interface RubricSwatchTone {
  bg: string;
  text: string;
  bar: string;
}

export function rubricSwatch(score: number): RubricSwatchTone {
  if (score >= 80) return { bg: "bg-emerald-50", text: "text-emerald-900", bar: "bg-emerald-500" };
  if (score >= 60) return { bg: "bg-amber-50", text: "text-amber-900", bar: "bg-amber-500" };
  return { bg: "bg-red-50", text: "text-red-900", bar: "bg-red-500" };
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume-builder/types.ts
git commit -m "feat(wave5): resume-builder shared types + template metadata"
```

---

## Task 3: Step indicator component

**Files:**
- Create: `frontend/src/components/resume-builder/step-indicator.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { ReactNode } from "react";

interface StepIndicatorProps {
  step: number; // 1..5
  total: number;
  labels: readonly string[];
}

export function StepIndicator({ step, total, labels }: StepIndicatorProps): ReactNode {
  return (
    <ol
      role="list"
      aria-label="Resume builder progress"
      className="flex flex-wrap items-center gap-2 sm:gap-3"
    >
      {labels.slice(0, total).map((label, idx) => {
        const n = idx + 1;
        const isActive = n === step;
        const isDone = n < step;
        const stateClass = isActive
          ? "bg-blue-600 text-white border-blue-600"
          : isDone
            ? "bg-emerald-50 text-emerald-900 border-emerald-300"
            : "bg-white text-gray-500 border-gray-200";
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              data-testid={`resume-step-${n}`}
              data-active={isActive ? "true" : undefined}
              aria-current={isActive ? "step" : undefined}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${stateClass}`}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-semibold">
                {isDone ? "✓" : n}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </span>
            {n < total && <span aria-hidden className="h-px w-4 bg-gray-200" />}
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume-builder/step-indicator.tsx
git commit -m "feat(wave5): step indicator for resume builder"
```

---

## Task 4: Basics step (Step 1)

**Files:**
- Create: `frontend/src/components/resume-builder/basics-step.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface BasicsValue {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  targetRole: string;
  yearsExperience: string;
}

interface BasicsStepProps {
  value: BasicsValue;
  onChange: (patch: Partial<BasicsValue>) => void;
  /** True when this step is the active step — used to manage focus on entry. */
  isActive: boolean;
}

export function BasicsStep({ value, onChange, isActive }: BasicsStepProps): ReactNode {
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isActive) firstFieldRef.current?.focus();
  }, [isActive]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Full Name *">
        <input
          ref={firstFieldRef}
          type="text"
          value={value.fullName}
          onChange={(e) => onChange({ fullName: e.target.value })}
          className={inputClass}
          placeholder="Jane Doe"
        />
      </Field>
      <Field label="Email *">
        <input
          type="email"
          value={value.email}
          onChange={(e) => onChange({ email: e.target.value })}
          className={inputClass}
          placeholder="jane@example.com"
        />
      </Field>
      <Field label="Phone">
        <input
          type="text"
          value={value.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          className={inputClass}
          placeholder="+234 800 000 0000"
        />
      </Field>
      <Field label="Location">
        <input
          type="text"
          value={value.location}
          onChange={(e) => onChange({ location: e.target.value })}
          className={inputClass}
          placeholder="Lagos, Nigeria"
        />
      </Field>
      <Field label="Target Role *">
        <input
          type="text"
          value={value.targetRole}
          onChange={(e) => onChange({ targetRole: e.target.value })}
          className={inputClass}
          placeholder="Senior Software Engineer"
        />
      </Field>
      <Field label="Years of Experience *">
        <input
          type="number"
          min={0}
          max={50}
          value={value.yearsExperience}
          onChange={(e) => onChange({ yearsExperience: e.target.value })}
          className={inputClass}
        />
      </Field>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

/**
 * Returns true when the step's required fields are filled and minimally valid.
 * Used by the page-level orchestrator to enable the "Next" button.
 */
export function basicsStepValid(value: BasicsValue): boolean {
  return (
    value.fullName.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) &&
    value.targetRole.trim().length > 0 &&
    Number.isFinite(Number(value.yearsExperience)) &&
    Number(value.yearsExperience) >= 0
  );
}
```

- [ ] **Step 2: Verify compile**

```bash
cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume-builder/basics-step.tsx
git commit -m "feat(wave5): basics step component (step 1)"
```

---

## Task 5: Experience step (Step 2)

**Files:**
- Create: `frontend/src/components/resume-builder/experience-step.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface WorkEntry {
  company: string;
  title: string;
  period: string;
  description: string;
}

interface ExperienceStepProps {
  value: WorkEntry[];
  onChange: (next: WorkEntry[]) => void;
  isActive: boolean;
}

const emptyWork: WorkEntry = { company: "", title: "", period: "", description: "" };

export function ExperienceStep({ value, onChange, isActive }: ExperienceStepProps): ReactNode {
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isActive) firstFieldRef.current?.focus();
  }, [isActive]);

  function update(index: number, field: keyof WorkEntry, fieldValue: string) {
    const next = [...value];
    next[index] = { ...next[index], [field]: fieldValue };
    onChange(next);
  }

  function addRole() {
    onChange([...value, { ...emptyWork }]);
  }

  function removeRole(index: number) {
    if (value.length <= 1) {
      onChange([{ ...emptyWork }]);
      return;
    }
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-gray-700">Work History</label>
        <button
          type="button"
          onClick={addRole}
          className="text-sm text-blue-600 hover:underline"
        >
          + Add Role
        </button>
      </div>
      {value.map((entry, i) => (
        <div key={i} className="border border-gray-200 rounded-md p-4 space-y-3 mb-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              ref={i === 0 ? firstFieldRef : undefined}
              type="text"
              placeholder="Company"
              value={entry.company}
              onChange={(e) => update(i, "company", e.target.value)}
              className={inputClass}
            />
            <input
              type="text"
              placeholder="Job Title"
              value={entry.title}
              onChange={(e) => update(i, "title", e.target.value)}
              className={inputClass}
            />
            <input
              type="text"
              placeholder="2022 - Present"
              value={entry.period}
              onChange={(e) => update(i, "period", e.target.value)}
              className={inputClass}
            />
          </div>
          <textarea
            placeholder="Responsibilities and truthful achievements. Add metrics where available."
            value={entry.description}
            onChange={(e) => update(i, "description", e.target.value)}
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {value.length > 1 && (
            <button
              type="button"
              onClick={() => removeRole(i)}
              className="text-xs text-gray-500 hover:text-red-600"
            >
              Remove this role
            </button>
          )}
        </div>
      ))}
      <p className="text-xs text-gray-500">
        Work history is optional. You can add roles later by editing your saved resume.
      </p>
    </div>
  );
}

const inputClass =
  "rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
```

- [ ] **Step 2: Verify compile**

```bash
cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume-builder/experience-step.tsx
git commit -m "feat(wave5): experience step component (step 2)"
```

---

## Task 6: Education step (Step 3)

**Files:**
- Create: `frontend/src/components/resume-builder/education-step.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface EduEntry {
  institution: string;
  degree: string;
  period: string;
}

interface EducationStepValue {
  educationHistory: EduEntry[];
  skills: string;            // comma-separated
  certifications: string;    // comma-separated
}

interface EducationStepProps {
  value: EducationStepValue;
  onChange: (patch: Partial<EducationStepValue>) => void;
  isActive: boolean;
}

const emptyEdu: EduEntry = { institution: "", degree: "", period: "" };

export function EducationStep({ value, onChange, isActive }: EducationStepProps): ReactNode {
  const skillsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isActive) skillsRef.current?.focus();
  }, [isActive]);

  function updateEdu(index: number, field: keyof EduEntry, fieldValue: string) {
    const next = [...value.educationHistory];
    next[index] = { ...next[index], [field]: fieldValue };
    onChange({ educationHistory: next });
  }

  function addEducation() {
    onChange({ educationHistory: [...value.educationHistory, { ...emptyEdu }] });
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Skills * <span className="text-gray-400">(comma-separated)</span>
        </label>
        <input
          ref={skillsRef}
          type="text"
          value={value.skills}
          onChange={(e) => onChange({ skills: e.target.value })}
          className={inputClass}
          placeholder="React, TypeScript, Node.js, PostgreSQL"
          data-testid="resume-skills-input"
        />
        <p className="mt-1 text-xs text-gray-500">
          List skills you can demonstrate. The AI will not invent ones you didn&apos;t mention.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Certifications <span className="text-gray-400">(comma-separated)</span>
        </label>
        <input
          type="text"
          value={value.certifications}
          onChange={(e) => onChange({ certifications: e.target.value })}
          className={inputClass}
          placeholder="AWS Certified Developer, Google Cloud Professional"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">Education</label>
          <button
            type="button"
            onClick={addEducation}
            className="text-sm text-blue-600 hover:underline"
          >
            + Add Education
          </button>
        </div>
        {value.educationHistory.map((entry, i) => (
          <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-3">
            <input
              type="text"
              placeholder="Institution"
              value={entry.institution}
              onChange={(e) => updateEdu(i, "institution", e.target.value)}
              className={inputClass}
            />
            <input
              type="text"
              placeholder="Degree / Course"
              value={entry.degree}
              onChange={(e) => updateEdu(i, "degree", e.target.value)}
              className={inputClass}
            />
            <input
              type="text"
              placeholder="2018 - 2022"
              value={entry.period}
              onChange={(e) => updateEdu(i, "period", e.target.value)}
              className={inputClass}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

/** True when at least one comma-separated skill is non-empty. */
export function educationStepValid(value: EducationStepValue): boolean {
  return value.skills
    .split(",")
    .map((s) => s.trim())
    .some((s) => s.length > 0);
}
```

- [ ] **Step 2: Verify compile**

```bash
cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume-builder/education-step.tsx
git commit -m "feat(wave5): education step component (step 3)"
```

---

## Task 7: Summary step (Step 4)

**Files:**
- Create: `frontend/src/components/resume-builder/summary-step.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface SummaryStepProps {
  value: string;
  onChange: (next: string) => void;
  isActive: boolean;
}

export function SummaryStep({ value, onChange, isActive }: SummaryStepProps): ReactNode {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isActive) textareaRef.current?.focus();
  }, [isActive]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <p className="font-semibold">Resume safety checklist</p>
        <p className="mt-1">
          Keep every claim verifiable. AfriTalent can improve wording and structure, but it should
          not invent tools, employers, certifications, or results.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Professional Summary
        </label>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Optional — AfriTalent can draft this from your real experience if left blank."
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify compile**

```bash
cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume-builder/summary-step.tsx
git commit -m "feat(wave5): summary step component (step 4)"
```

---

## Task 8: Template renderers (classic / modern / minimal)

**Files:**
- Create: `frontend/src/components/resume-builder/template-renderers/classic.tsx`
- Create: `frontend/src/components/resume-builder/template-renderers/modern.tsx`
- Create: `frontend/src/components/resume-builder/template-renderers/minimal.tsx`

- [ ] **Step 1: Create classic.tsx**

```tsx
"use client";

import type { ReactNode } from "react";
import type { ResumePreviewData } from "@/components/resume-builder/types";

export function ClassicTemplate({ data }: { data: ResumePreviewData }): ReactNode {
  if (data.generatedRawText) {
    return (
      <pre className="whitespace-pre-wrap font-serif text-[13px] leading-relaxed text-gray-900">
        {data.generatedRawText}
      </pre>
    );
  }
  return (
    <div className="font-serif text-gray-900">
      <header className="border-b border-gray-300 pb-3">
        <h1 className="text-2xl font-semibold">{data.fullName || "Your Name"}</h1>
        <p className="mt-1 text-sm text-gray-700">{data.targetRole || "Target role"}</p>
        <p className="mt-1 text-xs text-gray-500">
          {[data.email, data.phone, data.location].filter(Boolean).join(" • ")}
        </p>
      </header>
      {data.summary && (
        <Section title="Summary">
          <p className="text-sm leading-relaxed">{data.summary}</p>
        </Section>
      )}
      {data.skills.length > 0 && (
        <Section title="Skills">
          <p className="text-sm">{data.skills.join(" • ")}</p>
        </Section>
      )}
      {data.workHistory.filter((w) => w.company || w.title).length > 0 && (
        <Section title="Experience">
          {data.workHistory
            .filter((w) => w.company || w.title)
            .map((w, i) => (
              <div key={i} className="mb-3">
                <p className="text-sm font-semibold">
                  {w.title}
                  {w.company && <span className="font-normal text-gray-700">, {w.company}</span>}
                </p>
                {w.period && <p className="text-xs text-gray-500">{w.period}</p>}
                {w.description && <p className="mt-1 text-sm leading-relaxed">{w.description}</p>}
              </div>
            ))}
        </Section>
      )}
      {data.educationHistory.filter((e) => e.institution || e.degree).length > 0 && (
        <Section title="Education">
          {data.educationHistory
            .filter((e) => e.institution || e.degree)
            .map((e, i) => (
              <div key={i} className="mb-1.5 text-sm">
                <span className="font-medium">{e.degree}</span>
                {e.institution && <span className="text-gray-700">, {e.institution}</span>}
                {e.period && <span className="text-gray-500"> — {e.period}</span>}
              </div>
            ))}
        </Section>
      )}
      {data.certifications.length > 0 && (
        <Section title="Certifications">
          <p className="text-sm">{data.certifications.join(" • ")}</p>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-600">{title}</h2>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}
```

- [ ] **Step 2: Create modern.tsx**

```tsx
"use client";

import type { ReactNode } from "react";
import type { ResumePreviewData } from "@/components/resume-builder/types";

export function ModernTemplate({ data }: { data: ResumePreviewData }): ReactNode {
  if (data.generatedRawText) {
    return (
      <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-gray-900">
        {data.generatedRawText}
      </pre>
    );
  }
  return (
    <div className="font-sans text-gray-900">
      <header className="grid grid-cols-1 gap-2 border-b-2 border-blue-600 pb-3 sm:grid-cols-[2fr_1fr]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{data.fullName || "Your Name"}</h1>
          <p className="mt-0.5 text-sm font-medium text-blue-700">
            {data.targetRole || "Target role"}
          </p>
        </div>
        <div className="space-y-0.5 text-xs text-gray-600 sm:text-right">
          {data.email && <p>{data.email}</p>}
          {data.phone && <p>{data.phone}</p>}
          {data.location && <p>{data.location}</p>}
        </div>
      </header>
      {data.summary && <Block title="Summary">{data.summary}</Block>}
      {data.skills.length > 0 && (
        <Block title="Skills">
          <div className="flex flex-wrap gap-1.5">
            {data.skills.map((s) => (
              <span key={s} className="rounded bg-gray-100 px-2 py-0.5 text-xs">
                {s}
              </span>
            ))}
          </div>
        </Block>
      )}
      {data.workHistory.filter((w) => w.company || w.title).length > 0 && (
        <Block title="Experience">
          {data.workHistory
            .filter((w) => w.company || w.title)
            .map((w, i) => (
              <div key={i} className="mb-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold">{w.title || "Role"}</p>
                  {w.period && <span className="text-xs text-gray-500">{w.period}</span>}
                </div>
                {w.company && <p className="text-sm text-blue-700">{w.company}</p>}
                {w.description && <p className="mt-1 text-sm leading-relaxed">{w.description}</p>}
              </div>
            ))}
        </Block>
      )}
      {data.educationHistory.filter((e) => e.institution || e.degree).length > 0 && (
        <Block title="Education">
          {data.educationHistory
            .filter((e) => e.institution || e.degree)
            .map((e, i) => (
              <div key={i} className="mb-1.5 text-sm">
                <span className="font-semibold">{e.degree}</span>
                {e.institution && <span className="text-gray-700">, {e.institution}</span>}
                {e.period && <span className="text-gray-500"> — {e.period}</span>}
              </div>
            ))}
        </Block>
      )}
      {data.certifications.length > 0 && (
        <Block title="Certifications">
          {data.certifications.join(" • ")}
        </Block>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-blue-700">{title}</h2>
      <div className="mt-1.5 text-sm">{children}</div>
    </section>
  );
}
```

- [ ] **Step 3: Create minimal.tsx**

```tsx
"use client";

import type { ReactNode } from "react";
import type { ResumePreviewData } from "@/components/resume-builder/types";

export function MinimalTemplate({ data }: { data: ResumePreviewData }): ReactNode {
  if (data.generatedRawText) {
    return (
      <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-gray-900">
        {data.generatedRawText}
      </pre>
    );
  }
  return (
    <div className="font-mono text-[13px] text-gray-900">
      <h1 className="text-xl font-semibold">{data.fullName || "Your Name"}</h1>
      <p className="mt-0.5 text-gray-700">{data.targetRole || "Target role"}</p>
      <p className="mt-0.5 text-xs text-gray-500">
        {[data.email, data.phone, data.location].filter(Boolean).join(" / ")}
      </p>
      <hr className="my-3 border-gray-200" />
      {data.summary && (
        <Row label="summary"><p className="leading-relaxed">{data.summary}</p></Row>
      )}
      {data.skills.length > 0 && (
        <Row label="skills">{data.skills.join(", ")}</Row>
      )}
      {data.workHistory.filter((w) => w.company || w.title).map((w, i) => (
        <Row key={i} label={i === 0 ? "experience" : ""}>
          <p>
            <strong>{w.title}</strong>
            {w.company && ` — ${w.company}`}
            {w.period && <span className="text-gray-500"> ({w.period})</span>}
          </p>
          {w.description && <p className="mt-0.5 text-gray-700">{w.description}</p>}
        </Row>
      ))}
      {data.educationHistory.filter((e) => e.institution || e.degree).map((e, i) => (
        <Row key={i} label={i === 0 ? "education" : ""}>
          <p>
            <strong>{e.degree}</strong>
            {e.institution && ` — ${e.institution}`}
            {e.period && <span className="text-gray-500"> ({e.period})</span>}
          </p>
        </Row>
      ))}
      {data.certifications.length > 0 && (
        <Row label="certifications">{data.certifications.join(", ")}</Row>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-2 grid grid-cols-[80px_1fr] gap-3">
      <span className="text-[10px] uppercase tracking-wider text-gray-400">{label}</span>
      <div>{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: Verify all three compile**

```bash
cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/resume-builder/template-renderers/
git commit -m "feat(wave5): three resume preview templates (classic/modern/minimal)"
```

---

## Task 9: Template step (Step 5) + selector

**Files:**
- Create: `frontend/src/components/resume-builder/template-step.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { TEMPLATES, type TemplateId } from "@/components/resume-builder/types";

interface TemplateStepProps {
  selected: TemplateId;
  onSelect: (id: TemplateId) => void;
  onGenerate: () => void;
  generating: boolean;
  canGenerate: boolean;
  isActive: boolean;
}

export function TemplateStep({
  selected,
  onSelect,
  onGenerate,
  generating,
  canGenerate,
  isActive,
}: TemplateStepProps): ReactNode {
  const firstCardRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isActive) firstCardRef.current?.focus();
  }, [isActive]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-gray-700">Choose a template</p>
        <p className="mt-0.5 text-xs text-gray-500">
          Templates only change the visual layout. The same content appears in each.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {TEMPLATES.map((tpl, i) => {
          const isSelected = tpl.id === selected;
          return (
            <button
              key={tpl.id}
              ref={i === 0 ? firstCardRef : undefined}
              type="button"
              onClick={() => onSelect(tpl.id)}
              data-testid={`resume-template-${tpl.id}`}
              data-selected={isSelected ? "true" : undefined}
              aria-pressed={isSelected}
              className={`rounded-lg border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isSelected
                  ? "border-blue-600 bg-blue-50 ring-2 ring-blue-200"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <p className="text-sm font-semibold text-gray-900">{tpl.label}</p>
              <p className="mt-1 text-xs text-gray-500">{tpl.description}</p>
            </button>
          );
        })}
      </div>
      <Button
        onClick={onGenerate}
        disabled={generating || !canGenerate}
        className="w-full"
        data-testid="resume-generate-trigger"
      >
        {generating ? "Generating with Claude..." : "Generate Resume"}
      </Button>
      {!canGenerate && (
        <p className="text-xs text-amber-700">
          Add at least your name, email, target role, and one skill in the earlier steps to enable generation.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify compile**

```bash
cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume-builder/template-step.tsx
git commit -m "feat(wave5): template selector + generate trigger (step 5)"
```

---

## Task 10: Live preview component

**Files:**
- Create: `frontend/src/components/resume-builder/live-preview.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { ClassicTemplate } from "@/components/resume-builder/template-renderers/classic";
import { ModernTemplate } from "@/components/resume-builder/template-renderers/modern";
import { MinimalTemplate } from "@/components/resume-builder/template-renderers/minimal";
import type { ResumePreviewData, TemplateId } from "@/components/resume-builder/types";

interface LivePreviewProps {
  data: ResumePreviewData;
  template: TemplateId;
}

export function LivePreview({ data, template }: LivePreviewProps): ReactNode {
  const [collapsedOnMobile, setCollapsedOnMobile] = useState(true);

  const body = (
    <div data-testid="resume-preview-pane" aria-live="polite" className="rounded-md bg-white p-6 shadow-sm">
      {renderTemplate(data, template)}
    </div>
  );

  return (
    <>
      {/* Desktop: always-visible right column. */}
      <div className="hidden lg:block">{body}</div>

      {/* Mobile: collapsible drawer triggered by a button. */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setCollapsedOnMobile((v) => !v)}
          aria-expanded={!collapsedOnMobile}
          data-testid="resume-preview-toggle"
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700"
        >
          {collapsedOnMobile ? "Show preview" : "Hide preview"}
        </button>
        {!collapsedOnMobile && <div className="mt-3">{body}</div>}
      </div>
    </>
  );
}

function renderTemplate(data: ResumePreviewData, template: TemplateId): ReactNode {
  switch (template) {
    case "modern":
      return <ModernTemplate data={data} />;
    case "minimal":
      return <MinimalTemplate data={data} />;
    case "classic":
    default:
      return <ClassicTemplate data={data} />;
  }
}
```

- [ ] **Step 2: Verify compile**

```bash
cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume-builder/live-preview.tsx
git commit -m "feat(wave5): live preview with mobile drawer"
```

---

## Task 11: Rubric score panel

**Files:**
- Create: `frontend/src/components/resume-builder/rubric-score-panel.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { ATSScoreDisplay } from "@/components/ui/ats-score-display";
import { rubricSwatch } from "@/components/resume-builder/types";
import type { AtsRubricResponse } from "@/lib/api";
import type { FriendlyError } from "@/lib/friendly-error";

interface RubricScorePanelProps {
  rubric: AtsRubricResponse | null;
  loading: boolean;
  error: FriendlyError | null;
  jobDescription: string;
  onJobDescriptionChange: (value: string) => void;
  onScore: () => void;
}

export function RubricScorePanel({
  rubric,
  loading,
  error,
  jobDescription,
  onJobDescriptionChange,
  onScore,
}: RubricScorePanelProps): ReactNode {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">ATS rubric score</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Optionally paste a job description for a targeted, weighted score.
            </p>
          </div>
          <Badge variant="info">Premium</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <textarea
          value={jobDescription}
          onChange={(e) => onJobDescriptionChange(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Paste a job description here for a targeted, weighted rubric score (optional)"
        />
        <Button
          onClick={onScore}
          disabled={loading}
          className="w-full"
          data-testid="resume-rubric-trigger"
        >
          {loading ? "Scoring..." : "Score with ATS rubric"}
        </Button>

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            data-testid="resume-rubric-error"
            className={`rounded-md border p-3 text-sm ${
              error.tone === "error"
                ? "bg-red-50 border-red-200 text-red-800"
                : error.tone === "warning"
                  ? "bg-amber-50 border-amber-200 text-amber-900"
                  : "bg-blue-50 border-blue-200 text-blue-900"
            }`}
          >
            <p className="font-medium">{error.title}</p>
            <p className="mt-0.5">{error.description}</p>
          </div>
        )}

        {loading && <LoadingState lines={4} />}

        {rubric && !loading && (
          <div className="space-y-4 pt-2" data-testid="resume-rubric-score">
            <div className="flex items-center gap-4">
              <ATSScoreDisplay score={rubric.atsScore} size="lg" />
              <div className="text-sm text-gray-500">
                {rubric.source === "ai" ? "AI-powered rubric" : "Heuristic rubric"}
                {rubric.matchScore !== null && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">
                    Match {rubric.matchScore}/100
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {rubric.criteria.map((c) => {
                const tone = rubricSwatch(c.score);
                return (
                  <div
                    key={c.key}
                    data-testid={`resume-rubric-criterion-${c.key}`}
                    className={`rounded-md border border-gray-200 p-3 ${tone.bg}`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={`text-sm font-medium ${tone.text}`}>{c.label}</p>
                      <p className="text-xs text-gray-600">
                        {c.score}/100 · weight {c.weight}
                      </p>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-white/60">
                      <div
                        className={`h-2 rounded-full ${tone.bar}`}
                        style={{ width: `${Math.max(0, Math.min(100, c.score))}%` }}
                      />
                    </div>
                    {c.notes.length > 0 && (
                      <ul className="mt-2 list-inside list-disc text-xs text-gray-700">
                        {c.notes.slice(0, 5).map((n, i) => (
                          <li key={i}>{n}</li>
                        ))}
                      </ul>
                    )}
                    {c.missing && c.missing.length > 0 && (
                      <p className="mt-2 text-xs text-red-700">
                        Missing: {c.missing.slice(0, 12).join(", ")}
                        {c.missing.length > 12 && ` +${c.missing.length - 12} more`}
                      </p>
                    )}
                    {c.present && c.present.length > 0 && (
                      <p className="mt-1 text-xs text-emerald-700">
                        Found: {c.present.slice(0, 12).join(", ")}
                        {c.present.length > 12 && ` +${c.present.length - 12} more`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {rubric.suggestions.length > 0 && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-900">
                  Suggestions
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-blue-900">
                  {rubric.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify compile**

```bash
cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend
npx tsc --noEmit
```

Expected: PASS. If `LoadingState` or `ATSScoreDisplay` aren't found, confirm their paths against the existing page (we read both at lines 11-12 of the current `page.tsx`).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume-builder/rubric-score-panel.tsx
git commit -m "feat(wave5): rubric score panel with criteria bars + suggestions"
```

---

## Task 12: Wire it all up in `page.tsx`

**Files:**
- Modify: `frontend/src/app/candidate/resume-builder/page.tsx` (whole-file replacement)

- [ ] **Step 1: Replace the page**

Replace the contents of `frontend/src/app/candidate/resume-builder/page.tsx` with:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  profile,
  skills,
  billing,
  type CandidateProfile,
  type GeneratedResume,
  type BillingStatus,
  type AtsRubricResponse,
} from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/loading-state";
import { toFriendlyError, type FriendlyError } from "@/lib/friendly-error";
import { PremiumGate } from "@/components/ui/premium-gate";
import { EarlyTesterFeedback } from "@/components/feedback/early-tester-feedback";
import { reviewResumeInput } from "@/lib/early-tester-content";
import { StepIndicator } from "@/components/resume-builder/step-indicator";
import { BasicsStep, basicsStepValid } from "@/components/resume-builder/basics-step";
import { ExperienceStep } from "@/components/resume-builder/experience-step";
import { EducationStep, educationStepValid } from "@/components/resume-builder/education-step";
import { SummaryStep } from "@/components/resume-builder/summary-step";
import { TemplateStep } from "@/components/resume-builder/template-step";
import { LivePreview } from "@/components/resume-builder/live-preview";
import { RubricScorePanel } from "@/components/resume-builder/rubric-score-panel";
import type { ResumePreviewData, TemplateId } from "@/components/resume-builder/types";

interface WorkEntry {
  company: string;
  title: string;
  period: string;
  description: string;
}

interface EduEntry {
  institution: string;
  degree: string;
  period: string;
}

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  targetRole: string;
  yearsExperience: string;
  summary: string;
  skills: string;
  certifications: string;
  workHistory: WorkEntry[];
  educationHistory: EduEntry[];
}

const emptyWork: WorkEntry = { company: "", title: "", period: "", description: "" };
const emptyEdu: EduEntry = { institution: "", degree: "", period: "" };

const STEP_LABELS = ["Basics", "Experience", "Education", "Summary", "Template"] as const;
const TOTAL_STEPS = STEP_LABELS.length;

function formHasDraft(value: FormState): boolean {
  return Boolean(
    value.targetRole ||
      value.location ||
      value.summary ||
      value.skills ||
      value.certifications ||
      value.workHistory.some((item) => item.company || item.title || item.description) ||
      value.educationHistory.some((item) => item.institution || item.degree),
  );
}

function fromProfile(candidateProfile: CandidateProfile): Partial<FormState> {
  return {
    location: candidateProfile.targetCountries?.[0] || "",
    targetRole: candidateProfile.targetRoles?.[0] || "",
    yearsExperience: String(candidateProfile.yearsExperience ?? 0),
    summary: candidateProfile.bio || candidateProfile.headline || "",
    skills: candidateProfile.skills.join(", "),
    certifications: (candidateProfile.certifications || [])
      .map((item) => item.name)
      .filter(Boolean)
      .join(", "),
    workHistory: candidateProfile.workHistory?.length
      ? candidateProfile.workHistory.map((item) => ({
          company: item.company || "",
          title: item.title || "",
          period: item.period || "",
          description: item.description || "",
        }))
      : [{ ...emptyWork }],
    educationHistory: candidateProfile.educationHistory?.length
      ? candidateProfile.educationHistory.map((item) => ({
          institution: item.institution || "",
          degree: item.degree || "",
          period: item.period || "",
        }))
      : [{ ...emptyEdu }],
  };
}

export default function ResumeBuilderPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState<FormState>({
    fullName: user?.name || "",
    email: user?.email || "",
    phone: "",
    location: "",
    targetRole: "",
    yearsExperience: "0",
    summary: "",
    skills: "",
    certifications: "",
    workHistory: [{ ...emptyWork }],
    educationHistory: [{ ...emptyEdu }],
  });

  const [step, setStep] = useState<number>(1);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>("classic");
  const [generated, setGenerated] = useState<GeneratedResume | null>(null);
  const [editedText, setEditedText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedProfile, setSavedProfile] = useState<CandidateProfile | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);

  const [rubric, setRubric] = useState<AtsRubricResponse | null>(null);
  const [rubricLoading, setRubricLoading] = useState(false);
  const [rubricError, setRubricError] = useState<FriendlyError | null>(null);
  const [rubricJobDescription, setRubricJobDescription] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!user || user.role !== "CANDIDATE") return;
    billing.status().then(setBillingStatus).catch(() => undefined);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    profile
      .get()
      .then((candidateProfile) => {
        if (cancelled || !candidateProfile) return;
        setSavedProfile(candidateProfile);
        setForm((current) => {
          if (formHasDraft(current)) return current;
          setProfileNotice("Resume builder started from your saved profile.");
          return { ...current, ...fromProfile(candidateProfile) };
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user]);

  const isProfessional = billingStatus?.plan === "PROFESSIONAL";

  const skillsArray = useMemo(
    () => form.skills.split(",").map((s) => s.trim()).filter(Boolean),
    [form.skills],
  );
  const certificationsArray = useMemo(
    () => form.certifications.split(",").map((c) => c.trim()).filter(Boolean),
    [form.certifications],
  );

  const previewData: ResumePreviewData = useMemo(() => ({
    fullName: form.fullName,
    email: form.email,
    phone: form.phone,
    location: form.location,
    targetRole: form.targetRole,
    yearsExperience: form.yearsExperience,
    summary: form.summary,
    skills: skillsArray,
    certifications: certificationsArray,
    workHistory: form.workHistory,
    educationHistory: form.educationHistory,
    generatedRawText: generated ? editedText || generated.rawText : undefined,
    generatedSource: generated?.source,
  }), [form, skillsArray, certificationsArray, generated, editedText]);

  const canAdvance = (() => {
    if (step === 1) return basicsStepValid(form);
    if (step === 3) return educationStepValid({ ...form });
    return true;
  })();
  const canGenerate = basicsStepValid(form) && educationStepValid({ ...form });

  function goNext() {
    if (canAdvance && step < TOTAL_STEPS) setStep(step + 1);
  }
  function goBack() {
    if (step > 1) setStep(step - 1);
  }

  function applyProfileToForm(candidateProfile: CandidateProfile, overwrite = false) {
    const profileForm = fromProfile(candidateProfile);
    setForm((prev) => ({
      ...prev,
      ...Object.fromEntries(
        Object.entries(profileForm).filter(([key, value]) => {
          if (overwrite) return true;
          const current = prev[key as keyof FormState];
          if (Array.isArray(current)) {
            return (
              current.length === 0 ||
              current.every((item) => Object.values(item).every((field) => !field))
            );
          }
          return !current && Boolean(value);
        }),
      ),
    }));
    setProfileNotice(
      overwrite
        ? "Resume fields updated from your latest profile."
        : "Blank resume fields were prefilled from your profile.",
    );
  }

  async function handleGenerate() {
    const readiness = reviewResumeInput(form);
    if (readiness.missing.length > 0) {
      setError({
        title: "Resume details missing",
        description: `Add these required details before generating: ${readiness.missing.join(", ")}.`,
        tone: "warning",
      });
      return;
    }
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const result = await skills.generateResume({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone || undefined,
        location: form.location || undefined,
        targetRole: form.targetRole,
        yearsExperience: Number(form.yearsExperience),
        summary: form.summary || undefined,
        skills: skillsArray,
        workHistory: form.workHistory.filter((w) => w.company && w.title),
        educationHistory: form.educationHistory.filter((e) => e.institution && e.degree),
        certifications: certificationsArray.length > 0 ? certificationsArray : undefined,
      });
      setGenerated(result.resume);
      setEditedText(result.resume.rawText);
    } catch (err) {
      setError(toFriendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!generated) return;
    setSaving(true);
    setError(null);
    try {
      await skills.saveResume({
        content: generated.sections as unknown as Record<string, unknown>,
        rawText: editedText || generated.rawText,
      });
      setSaved(true);
    } catch (err) {
      setError(toFriendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  async function handleScoreRubric() {
    if (!generated) return;
    setRubricLoading(true);
    setRubricError(null);
    setRubric(null);
    try {
      const result = await skills.scoreAtsRubric({
        resumeContent: generated.sections as unknown as Record<string, unknown>,
        targetJobDescription: rubricJobDescription.trim() || undefined,
      });
      setRubric(result);
    } catch (err) {
      // skills.scoreAtsRubric throws FriendlyError-shaped objects directly.
      setRubricError(err && typeof err === "object" && "title" in err ? (err as FriendlyError) : toFriendlyError(err));
    } finally {
      setRubricLoading(false);
    }
  }

  if (authLoading || !user) return null;

  if (!isProfessional && billingStatus) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <PremiumGate
            feature="AI Resume Builder & Templates"
            requiredPlan="Professional"
            benefits={[
              "AI-generated ATS-optimized resume drafts",
              "Premium downloadable resume templates",
              "Auto-fill your profile into any template",
              "Unlimited ATS compatibility scans",
            ]}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 print:bg-white print:py-0 print:px-0">
      <div className="mx-auto max-w-7xl space-y-6 print:max-w-none print:space-y-0">
        <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Resume Builder</h1>
            <p className="text-sm text-gray-500 mt-1">
              Build an ATS-friendly resume draft from truthful profile, project, and work details.
            </p>
          </div>
          <Badge variant="info">Premium</Badge>
        </div>

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            data-testid="resume-builder-error"
            className={`rounded-md border p-4 text-sm print:hidden ${
              error.tone === "error"
                ? "bg-red-50 border-red-200 text-red-800"
                : error.tone === "warning"
                  ? "bg-amber-50 border-amber-200 text-amber-900"
                  : "bg-blue-50 border-blue-200 text-blue-900"
            }`}
          >
            <p className="font-medium">{error.title}</p>
            <p className="mt-0.5">{error.description}</p>
          </div>
        )}

        {profileNotice && !generated && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 print:hidden">
            {profileNotice}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 print:grid-cols-1">
          {/* LEFT: form / preview controls */}
          <div className="space-y-6 print:hidden">
            <Card>
              <CardHeader>
                <StepIndicator step={step} total={TOTAL_STEPS} labels={STEP_LABELS} />
              </CardHeader>
              <CardContent className="space-y-6">
                {!generated && savedProfile && step === 1 && (
                  <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-3">
                    <Button size="sm" variant="outline" onClick={() => applyProfileToForm(savedProfile, false)}>
                      Update from profile
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => applyProfileToForm(savedProfile, true)}>
                      Start from profile
                    </Button>
                  </div>
                )}

                {!generated && step === 1 && (
                  <BasicsStep
                    value={form}
                    onChange={(patch) => setForm((p) => ({ ...p, ...patch }))}
                    isActive
                  />
                )}
                {!generated && step === 2 && (
                  <ExperienceStep
                    value={form.workHistory}
                    onChange={(workHistory) => setForm((p) => ({ ...p, workHistory }))}
                    isActive
                  />
                )}
                {!generated && step === 3 && (
                  <EducationStep
                    value={{
                      educationHistory: form.educationHistory,
                      skills: form.skills,
                      certifications: form.certifications,
                    }}
                    onChange={(patch) => setForm((p) => ({ ...p, ...patch }))}
                    isActive
                  />
                )}
                {!generated && step === 4 && (
                  <SummaryStep
                    value={form.summary}
                    onChange={(summary) => setForm((p) => ({ ...p, summary }))}
                    isActive
                  />
                )}
                {!generated && step === 5 && (
                  <TemplateStep
                    selected={selectedTemplate}
                    onSelect={setSelectedTemplate}
                    onGenerate={handleGenerate}
                    generating={loading}
                    canGenerate={canGenerate}
                    isActive
                  />
                )}

                {generated && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={generated.source === "ai" ? "success" : "default"}>
                        {generated.source === "ai" ? "AI Generated" : "Template"}
                      </Badge>
                      {saved && <Badge variant="success">Saved</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => {
                          setGenerated(null);
                          setSaved(false);
                          setEditedText("");
                          setRubric(null);
                          setStep(1);
                        }}
                        variant="outline"
                      >
                        Edit Inputs
                      </Button>
                      <Button onClick={handlePrint} variant="outline">
                        Export / Print
                      </Button>
                      <Button onClick={handleSave} disabled={saving || saved}>
                        {saving ? "Saving..." : saved ? "Saved" : "Save Resume"}
                      </Button>
                    </div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Preview text{" "}
                      <span className="normal-case font-normal text-gray-400">
                        (editable — refine before saving)
                      </span>
                    </label>
                    <textarea
                      value={editedText}
                      onChange={(e) => {
                        setEditedText(e.target.value);
                        setSaved(false);
                      }}
                      rows={18}
                      data-testid="resume-preview-textarea"
                      className="w-full rounded-md border border-gray-200 bg-white px-4 py-3 font-mono text-sm text-gray-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {saved && (
                      <p className="text-sm text-emerald-700">
                        Resume saved. Job Matcher will now use this for similarity scoring.
                      </p>
                    )}
                  </div>
                )}

                {!generated && (
                  <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                    <Button
                      variant="outline"
                      onClick={goBack}
                      disabled={step === 1}
                      data-testid="resume-step-back"
                    >
                      Back
                    </Button>
                    {step < TOTAL_STEPS && (
                      <Button
                        onClick={goNext}
                        disabled={!canAdvance}
                        data-testid="resume-step-next"
                      >
                        Next
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {generated && (
              <RubricScorePanel
                rubric={rubric}
                loading={rubricLoading}
                error={rubricError}
                jobDescription={rubricJobDescription}
                onJobDescriptionChange={setRubricJobDescription}
                onScore={handleScoreRubric}
              />
            )}

            <EarlyTesterFeedback feature="resume-builder" />

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 print:hidden">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">Premium template bundle</p>
                  <p className="mt-1">
                    Preview ATS-ready layouts and download templates included with your plan.
                  </p>
                </div>
                <Link
                  href="/candidate/resume-templates"
                  className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-transparent px-3.5 py-2 text-sm font-medium text-zinc-900 shadow-sm transition-all duration-200 hover:bg-zinc-100"
                >
                  Browse templates
                </Link>
              </div>
            </div>
          </div>

          {/* RIGHT: live preview */}
          <div className="lg:sticky lg:top-6 lg:self-start print:static print:col-span-2">
            <LivePreview data={previewData} template={selectedTemplate} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript passes**

```bash
cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend
npx tsc --noEmit
```

Expected: PASS. If `reviewResumeInput`, `EarlyTesterFeedback`, or anything else fails to resolve, the existing imports from the old `page.tsx` (lines 14-17 of the pre-change file) are authoritative — match them exactly.

- [ ] **Step 3: Verify lint passes**

```bash
cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend
npm run lint
```

Expected: PASS (0 errors, warnings only on `<img>` are pre-existing).

- [ ] **Step 4: Verify next build succeeds**

```bash
cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend
npm run build
```

Expected: PASS. If it fails, check the error and fix in-place.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/candidate/resume-builder/page.tsx
git commit -m "feat(wave5): in-place multi-step resume builder + live preview + rubric"
```

---

## Task 13: Smoke test the dev server manually

**Files:** none.

- [ ] **Step 1: Start the backend (mock AI mode)**

```bash
cd /Users/ocheme/Desktop/Client-Projects/afri-tech/backend
MOCK_AI=1 npm run dev
```

Expected: server up on http://localhost:4000.

- [ ] **Step 2: Start the frontend**

```bash
cd /Users/ocheme/Desktop/Client-Projects/afri-tech/frontend
NEXT_PUBLIC_API_URL=http://localhost:4000 npm run dev
```

Expected: dev server up on http://localhost:3000.

- [ ] **Step 3: Visit /candidate/resume-builder logged in as a PROFESSIONAL candidate**

Manual checks (write findings to a scratch buffer, NOT into a doc):

- Steps 1 → 5 advance with "Next" enabled at correct fields.
- "Back" goes backwards, no data lost.
- Live preview updates as fields change on desktop; mobile drawer toggles.
- Template selector flips the preview between classic / modern / minimal.
- Step 5's "Generate Resume" hits `/api/skills/resume-builder/generate` and produces a result.
- After generation: preview switches to rawText rendering, "Save", "Export / Print", and "Score with ATS rubric" all work.
- "Score with ATS rubric" hits `/api/skills/resume-builder/ats-rubric/score` (mocked under MOCK_AI=1; backend returns a stub).
- Print preview renders only the preview pane (CSS sanity check).
- Free/Basic plan user → `PremiumGate` shown.

If anything is broken, fix in-place and commit per the bite-size pattern (one fix per commit when feasible). Do not move to Task 14 with broken behavior.

- [ ] **Step 4: Stop dev servers**

Hit Ctrl-C in both terminals.

- [ ] **Step 5: No commit unless you fixed something**

If you made any fixes during smoke-test, commit them with the message pattern `fix(wave5): <specific issue>`.

---

## Task 14: Push branch + open PR + notify reviewers

**Files:** none (git ops only).

- [ ] **Step 1: Push the branch**

```bash
cd /Users/ocheme/Desktop/Client-Projects/afri-tech
git push -u origin release/launch-wave-5-resume-builder-ats
```

Expected: pushes successfully. (Origin branch was auto-deleted on PR #92 merge; this recreates it.)

- [ ] **Step 2: Open PR**

```bash
gh pr create --base develop --title "feat(wave5): resume builder UX + live preview + ATS rubric (PR #3 of 4)" --body "$(cat <<'EOF'
## Summary

Wave 5 PR #3 of 4. Upgrades the candidate resume builder to a guided 5-step flow with a persistent live preview, a client-side template selector (classic / modern / minimal), and a rubric score panel consuming the new `/api/skills/resume-builder/ats-rubric/score` endpoint from PR #92.

In-place upgrade of `frontend/src/app/candidate/resume-builder/page.tsx`. Path `/tools/resume-builder/` from the original task description was a speculative example — the live route at `/candidate/resume-builder/` wins (per team-lead 2026-05-12).

## API contract (frozen with backend-engineer)

Source of truth: `backend/src/lib/resume/rubric-schema.ts` (commit 630696a) + error codes at 3a07488. Verified verbatim before this PR.

`POST /api/skills/resume-builder/ats-rubric/score` — request `{ resumeContent, targetJobId?, targetJobDescription? }`, response `{ resumeVersionId, atsScore, matchScore, criteria[], suggestions, optimizedContent, source }`. PROFESSIONAL + Role.CANDIDATE gate. 256 KB per-field cap and 768 KB envelope cap. Five error codes mapped to FriendlyError shapes inside `skills.scoreAtsRubric` so every call site gets typed errors for free: RESUME_TOO_LARGE / RESUME_FIELD_TOO_LARGE / RESUME_NOT_SERIALIZABLE / VALIDATION_FAILED / ATS_RUBRIC_INTERNAL_ERROR.

## Behavior changes

- Step 3 ("Education") gates its "Next" button on at least one non-empty skill. The existing single-screen form already required this at submission time (`disabled={... || !form.skills}`); this surfaces the requirement earlier in the flow for a faster failure signal. Net change to what's required to submit: none.
- "Generate" button moves from a standalone CTA to step 5. Same required-fields union (name + email + target-role + years + ≥1 skill).
- Preview is now persistent across all steps, not just post-generation.

## Files

Added: 12 components under `frontend/src/components/resume-builder/` (5 steps + indicator + preview + score panel + 3 template renderers + types).
Modified: `frontend/src/lib/api.ts` (additive — 4 new types + 1 helper), `frontend/src/app/candidate/resume-builder/page.tsx` (rewrite to orchestrate steps).

## Out of scope (deferred)

- `targetJobId` rubric flow — needs a job-picker, deferred.
- PDF/DOCX export beyond `window.print()`.
- Persisting `templateId` on `UserResume` — option (a) confirmed during contract negotiation.

## Test plan

- [ ] Playwright E2E coverage — qa-tester PR #4
- [ ] Manual smoke: 5-step flow, template switching, generate → save → score → print
- [ ] Manual: FREE/BASIC plan shows PremiumGate
- [ ] Manual: rubric error codes (force via tampered request) surface friendly messages

## Founder action checklist

None for this PR. Code-only change.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: PR URL printed.

- [ ] **Step 3: Wait for CI**

```bash
gh pr checks --watch
```

Expected: all checks green. If anything fails, fix in-place and push more commits to the branch.

- [ ] **Step 4: Message qa-tester for Playwright coverage**

Use SendMessage tool to `qa-tester` with the PR URL + the list of `data-testid` hooks added (see the spec file's "Testing hooks" section). Suggest E2E paths: step flow + template flip + generate/save round trip + rubric error path + premium-gate render.

- [ ] **Step 5: Message code-reviewer**

Use SendMessage tool to `code-reviewer` with the PR URL and a 3-line summary.

- [ ] **Step 6: After code-reviewer approves, message team-lead**

Use SendMessage tool to `team-lead` with the PR URL, 3-line summary, and the founder-action checklist ("None — code-only").

- [ ] **Step 7: Mark task #3 completed in TaskList**

Use TaskUpdate tool: taskId="3", status="completed", only after code-reviewer has signed off.

---

## Self-review

**Spec coverage:**
- 5-step flow ✓ (Tasks 4-9)
- Live preview ✓ (Task 10)
- 3 templates ✓ (Task 8)
- Rubric panel + 5 error codes ✓ (Tasks 1, 11, 12)
- PROFESSIONAL plan gate ✓ (Task 12 — preserves existing `PremiumGate` path)
- `formHasDraft` reuse note ✓ (Task 12 — explicit comment, function copied from existing page)
- Accessibility (aria-current, aria-live, focus management) ✓ (Tasks 3-9)
- Data-testid hooks ✓ (Tasks 3, 9, 10, 11)
- Existing route paths preserved ✓ (no inbound-link changes needed)
- Print stylesheet ✓ (Task 12 — `print:` Tailwind utilities)

**Placeholder scan:** none. Every code block is complete. No TODOs, no "similar to Task N", no "add appropriate error handling" — everything is named.

**Type consistency:** `TemplateId` is `"classic" | "modern" | "minimal"` everywhere. `ResumePreviewData` shape is identical across `types.ts`, all three template renderers, `live-preview.tsx`, and `page.tsx`. `AtsRubricResponse` matches `RubricCriterion[]` everywhere. `FriendlyError` shape `{ title, description, tone }` is used consistently (matches the existing `friendly-error.ts` shape, not the `{ title, body }` shape from backend's example).

**Edge: `educationStepValid({ ...form })`** is called with a `FormState`-shaped object that has extra fields — TS will accept it via structural subtyping since `EducationStepValue` only requires `educationHistory`, `skills`, `certifications` which all exist on `FormState`. Verified.

**No backend changes.** No API additions. No new SSM / KMS / Terraform / Prisma touchpoints. No founder action items required for this PR.
