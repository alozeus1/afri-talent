# Wave 5 PR #3 — Resume builder UX + live preview (design)

**Date:** 2026-05-13
**Owner:** frontend-engineer
**Branch:** `release/launch-wave-5-resume-builder-ats`
**Task:** #3 (Wave 5 PR #3)
**Depends on:** PR #90 (merged 5d82fdc), PR #92 (merged 9e48a31)

## Goal

Upgrade the existing candidate resume builder from a single-screen form into a multi-step guided experience with a persistent live preview and a client-side template selector, and surface the new ATS rubric scoring service (PR #92) inside the preview.

In-place upgrade of `frontend/src/app/candidate/resume-builder/page.tsx` (approved by team-lead 2026-05-12 — option (c)). The path `/tools/resume-builder/` referenced in the original task description was a speculative example and is not created.

## Non-goals

- No new design system, no shadcn primitives that don't already exist in `@/components/ui/`.
- No persistence of `templateId` on `UserResume` (option (a) from contract negotiation — templates are styling assets, not data).
- No backend API changes — the contract was frozen in PR #92 before this PR opened.
- No changes to `/api/skills/resume-builder/{generate,save,scan-ats,translate}` request/response shapes.
- No changes to `i18n` messages.ts beyond strings the new UI needs (additive only).
- No new export pipeline — print/PDF stays through `window.print()` until a follow-up wave.

## Existing surface (audited 2026-05-12)

`frontend/src/app/candidate/resume-builder/page.tsx` today:

- Two display modes branching off `!generated`:
  - Input form (single screen, ~270 lines of fields)
  - Generated view (preview textarea + ATS scanner block)
- Authentication via `useAuth`, plan gate via `billing.status()` + `PremiumGate`
- Profile prefill via `profile.get()` + `applyProfileToForm`
- Friendly errors via `toFriendlyError` (`{ title, description, tone }` shape)
- Existing `data-testid` hooks: `resume-builder-error`, `resume-preview-textarea`, `ats-scan-error`

Inbound links (preserved, no path change needed):

- `frontend/src/app/candidate/page.tsx:92`
- `frontend/src/app/candidate/job-matches/page.tsx:170`
- `frontend/src/app/candidate/resume-templates/page.tsx:86, 130`
- `frontend/src/app/[locale]/candidate/resume-builder/page.tsx:1` (re-export)

## API contract (frozen with backend-engineer)

Source of truth: `backend/src/lib/resume/rubric-schema.ts` at commit `630696a`, error-code surface at `3a07488`.

### New endpoint consumed

`POST /api/skills/resume-builder/ats-rubric/score`

Request:

```ts
{
  resumeContent: ResumeContent;             // Record<string, unknown>, ≤ 256 KB serialized
  targetJobId?: string;                     // optional uuid; omit when absent (undefined, never null)
  targetJobDescription?: string;            // optional; omit when absent
}
```

Response:

```ts
{
  resumeVersionId: string | null;           // non-null when persisted (targetJobId provided)
  atsScore: number;                         // 0..100 integer
  matchScore: number | null;                // 0..100 integer; null when no jobId
  criteria: Array<{
    key: string;                            // stable id, e.g. "keywords"
    label: string;                          // human-readable
    score: number;                          // 0..100 integer
    weight: number;                         // 0..100, sums to 100 across criteria
    notes: string[];                        // ≤ 10 short observations
    present?: string[];                     // ≤ 50, keywords-style criteria only
    missing?: string[];                     // ≤ 50, keywords-style criteria only
  }>;                                       // 1..20 criteria
  suggestions: string[];                    // ≤ 10
  optimizedContent: ResumeContent | null;
  source: "ai" | "template";
}
```

Wave 5 ships 4 fixed criteria: `keywords` (weight 40), `formatting` (weight 20), `experience` (weight 25), `skills` (weight 15). FE renders the array without hardcoding keys — extensible by design.

### Error codes (from PR #92, commit 3a07488)

| Code | HTTP | Body fields | UX surface |
|---|---|---|---|
| `RESUME_TOO_LARGE` | 413 | `limit_bytes`, `received_bytes` | warning tone, size-aware copy |
| `RESUME_FIELD_TOO_LARGE` | 400 | `details: error.issues` | warning tone, size-aware copy |
| `RESUME_NOT_SERIALIZABLE` | 400 | — | error tone, "couldn't process your resume" |
| `VALIDATION_FAILED` | 400 | `details: error.issues` | error tone, generic "review your inputs" (issues logged to console only) |
| `ATS_RUBRIC_INTERNAL_ERROR` | 500 | — | error tone, "temporarily unavailable" |
| (unknown / other 5xx) | — | — | error tone, generic fallback |

Gate: PROFESSIONAL plan + `Role.CANDIDATE` — same as existing `scan-ats`.

## Component breakdown

All new components live under `frontend/src/components/resume-builder/`. Page-level orchestration stays in `frontend/src/app/candidate/resume-builder/page.tsx`.

```
frontend/src/components/resume-builder/
  step-indicator.tsx         // step pills 1..5 with active/done states
  basics-step.tsx            // step 1: name/email/phone/location/role/years
  experience-step.tsx        // step 2: work history (re-uses existing repeater pattern)
  education-step.tsx         // step 3: education + certifications + skills
  summary-step.tsx           // step 4: summary textarea + safety checklist
  template-step.tsx          // step 5: template selector + generate trigger
  live-preview.tsx           // right column / mobile drawer; renders form through chosen template
  template-renderers/
    classic.tsx              // serif, single-column, ATS-safe
    modern.tsx               // sans-serif, two-column header
    minimal.tsx              // tight monoline, single-column, no color
  rubric-score-panel.tsx     // stacked bar + per-criterion notes + suggestions
```

Template renderers are intentionally small and parallel-shaped: each is a pure function component that accepts the same `ResumePreviewData` prop. Adding a 4th template later is a single file under `template-renderers/` + one entry in the selector's template list — no plumbing changes. Wave 5 ships the three above as styling-only defaults; the founder can request different visuals in a follow-up wave without touching this component's shape.

Page-level state in `page.tsx`:

- `step: 1..5` + `direction: "forward" | "back"` for accessibility focus management
- All existing form/generated/edited/saved/error state preserved
- New: `selectedTemplate: "classic" | "modern" | "minimal"` (default `classic`)
- New: `rubric: AtsRubricResponse | null`, `rubricLoading`, `rubricError: FriendlyError | null`
- New: `previewCollapsed: boolean` (mobile only)

## Flow

1. **Plan gate:** unchanged. Non-PROFESSIONAL → `PremiumGate`. Loading state preserved.
2. **Auto-prefill:** profile prefill on first mount preserved. Uses the existing `formHasDraft(value: FormState): boolean` helper already defined inside `frontend/src/app/candidate/resume-builder/page.tsx` (line 88 in the current file) — no new helper added. If it returns true on mount, skip prefill.
3. **Step 1 (Basics):** name, email, phone, location, target role, years. "Next" disabled until name/email/target-role/years are valid.
4. **Step 2 (Experience):** work-history repeater. Existing pattern, no field changes. Can advance with 0 entries.
5. **Step 3 (Education):** education repeater + skills (comma-separated) + certifications (comma-separated). "Next" disabled until skills has at least one entry. **Behavior change vs. the existing single-screen form:** the existing form gates the "Generate" button on `!form.fullName || !form.targetRole || !form.skills`, so skills was already effectively required at submission time. The new behavior pulls that same requirement up one step so the user gets a faster failure signal. To be called out in PR body under "Behavior changes". The new "Generate" button at step 5 keeps the existing union of required fields (name + email + target-role + years + ≥1 skill) so there is no net change to what is required to submit.
6. **Step 4 (Summary):** optional summary + safety checklist callout.
7. **Step 5 (Template + Generate):** template grid (3 cards), "Generate resume" button. After generation, scrolls into preview pane and reveals "Save", "Print", "Score with ATS rubric".
8. **Live preview:** rendered continuously from step 1 onward using the chosen template (or default `classic`). On `lg:` desktop, occupies right half of the layout. On `<lg` mobile, accessible via a collapsible drawer (`previewCollapsed` toggle).
9. **Rubric scoring:** after generation, "Score with ATS rubric" calls `skills.scoreAtsRubric(...)`. Optional textarea for `targetJobDescription`. No `targetJobId` flow in Wave 5 (would require a job-picker — deferred).
10. **Save:** unchanged — `skills.saveResume(...)`. Embedding fire-and-forget on the server.
11. **Print:** unchanged — `window.print()`. Preview uses `print:` Tailwind utilities to render only the preview pane.

## API client additions

`frontend/src/lib/api.ts` — additive only:

```ts
// Mirror of backend/src/lib/resume/rubric-schema.ts (verified verbatim against 630696a)
export type ResumeContent = Record<string, unknown>;
export interface RubricCriterion {
  key: string;
  label: string;
  score: number;
  weight: number;
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

// Added under `export const skills = { ... }`:
scoreAtsRubric: (data: {
  resumeContent: ResumeContent;
  targetJobId?: string;
  targetJobDescription?: string;
}) => fetchAPI<AtsRubricResponse>("/api/skills/resume-builder/ats-rubric/score", {
  method: "POST",
  body: JSON.stringify(data),
}),
```

Error handling lives inside the helper: on non-2xx, parse JSON body, switch on `code`, throw a `FriendlyError` shaped via `toFriendlyError`. The 5-case switch from the contract message is implemented exactly.

## Template rendering (client-side)

Each `template-renderers/<name>.tsx` is a pure function component:

```tsx
export function ClassicTemplate({ resume }: { resume: ResumePreviewData }) { ... }
```

`ResumePreviewData` is a normalised view of either the in-progress `FormState` or the post-generation `GeneratedResume.sections`. A small adapter in `live-preview.tsx` maps between the two so the templates take a single stable type.

Templates use only Tailwind classes and the existing typography scale. No external libs, no `react-pdf`. Print uses `@media print` via Tailwind `print:` utilities.

## Accessibility

- Step indicator is `role="list"` with `aria-current="step"` on the active step.
- "Next"/"Back" buttons manage focus to the first form field of the new step.
- Live preview is `aria-live="polite"` so screen readers announce score changes.
- Mobile drawer trigger is a `<button aria-expanded>` toggle, focus-trapped only when open.
- All form labels are explicit `<label htmlFor>` (existing pattern).

## Testing hooks (data-testid)

Preserved from existing page:

- `resume-builder-error`
- `resume-preview-textarea`
- `ats-scan-error`

New (for qa-tester Playwright coverage in PR #4):

- `resume-step-1` .. `resume-step-5`
- `resume-step-next`, `resume-step-back`
- `resume-template-classic`, `resume-template-modern`, `resume-template-minimal`
- `resume-template-selected` (data-attr `data-selected="true"`)
- `resume-preview-pane`, `resume-preview-toggle`
- `resume-rubric-trigger`, `resume-rubric-score`, `resume-rubric-error`
- `resume-rubric-criterion-<key>` (one per criterion)

## Self-review

- **Placeholders:** none.
- **Internal consistency:** path is `/candidate/resume-builder/` throughout, the templates section confirms no `templateId` persisted (matches "no backend changes"), rubric is consumed post-generation (matches the step flow).
- **Scope:** focused — single page, additive components, one new API helper. Single PR.
- **Ambiguity:** none — every API field, every state transition, every test hook is concrete.

## Out of scope (deferred)

- `targetJobId` rubric flow (needs a job-picker UI; deferred to Wave 7 or a follow-up).
- PDF/DOCX export beyond `window.print()`.
- Saving the chosen template as a UserResume preference (would need backend additive column; deferred).
- Translating the rendered template (existing `translate` endpoint stays unchanged).
