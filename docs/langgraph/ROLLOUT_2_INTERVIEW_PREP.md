# Rollout 2 — Interview prep graph (live wiring)

**Status:** Implemented, full project typecheck clean, 99/99 langgraph tests green. **Flag OFF by default → the route is unchanged.** Second graph wired into a live path; safe-by-construction (single-shot, no external side effects, no money/email/submission).

## What it wires
`POST /api/autopilot/interview-prep/:applicationId` now optionally runs the `interviewPrep` graph around the existing `buildInterviewPrepPack()`:
- **Flag off** → identical to today (`{ pack }`).
- **Flag on** (`LANGGRAPH_INTERVIEW_PREP=1` or global) → `{ pack, readinessScore }` plus a `GraphRun` audit row. The pack is generated exactly once; the readiness score is deterministic.

## Adapter (`integration/interviewPrepAdapter.ts`)
- `computeProfileCompleteness()` — deterministic 0–100 from present profile signals (headline, bio, skills, years, resume).
- `runInterviewPrepRollout()` — runs the graph with `generateQuestions` delegating to the existing `buildInterviewPrepPack`, returns `{ pack, readinessScore }`.
- Readiness = `clamp(completeness·0.6 + materials·20 + companyData·20)` — explainable, no LLM.

## Tests
- `computeProfileCompleteness`: full→100, empty→0, partial→proportional.
- `runInterviewPrepRollout`: returns the pack + correct readiness (100 and 44 cases), pack built once. (`buildInterviewPrepPack` mocked since it writes a task.)

## Enable
```bash
# staging
LANGGRAPH_ENABLED=1
LANGGRAPH_INTERVIEW_PREP=1
```
Frontend can surface `readinessScore` when present; absence (flag off) is backward-compatible. Roll back by unsetting the flag.
