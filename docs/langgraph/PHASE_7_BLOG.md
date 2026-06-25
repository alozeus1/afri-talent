# LangGraph — Phase 7: Blog automation (human-gated publish)

**Status:** Implemented, full project typecheck clean, 78/78 langgraph tests green (6 new). **Purely additive** — one graph + tests, no changes to any existing runtime file. Not wired into the blog worker yet → zero behavior change.

## What it does
`graphs/blogAutomation.graph.ts`: `source → factCheck → write → createDraft → adminApproval (interrupt) → publish`.

- **Source-credibility scoring is deterministic** — aggregate = mean fact-check score + whitelist-density bonus. Runs below the threshold are **blocked before a draft is created** (`low_credibility`).
- **Preserves the existing human gate**: `createDraft` persists `Resource(published=false) + AdminReview(PENDING)` and logs all sources + the fact-check result; the graph then **pauses on an admin-approval interrupt**.
- **Publishes only after approval**, and the publish side effect is **idempotent** (`runOnce` keyed by resourceId) — a replay never double-publishes.
- Admin reject → stays unpublished (`rejected`).

## Safety guarantee (the non-negotiable, test-covered)
**Nothing reaches readers without admin approval.** The `publish` node is only reachable through the approval interrupt resolving with `approved:true`. Tests verify: draft created but `published:0` while awaiting approval; `published:1` only after approve; `published:0` on reject; and low-credibility/no-content runs never draft or publish.

## Design
All sourcing / fact-check / writing / persistence / publish are **injected** (`BlogAutomationDeps`), so the graph reuses the existing pipeline agents (`FactCheckAgent`, `BlogWriterAgent`, `ImageSourcer`) and the `Resource` + `AdminReview` persistence via an adapter wired during controlled rollout. The graph is fully unit-tested with no DB.

## Files
- `backend/src/lib/ai/langgraph/graphs/blogAutomation.graph.ts`
- `backend/src/lib/ai/langgraph/tests/blogAutomation.test.ts`

## Verify locally
```bash
cd backend
npm run typecheck
LOG_LEVEL=silent MOCK_AI=1 NODE_ENV=test npx vitest run src/lib/ai/langgraph
```

## Controlled rollout (after merge)
Wire `BlogAutomationDeps` to the existing pipeline and call `startBlogAutomation()` from `workers/blog-automation.ts` behind `LANGGRAPH_BLOG_AUTOMATION=1`; the admin approve/reject UI calls `resumeBlogAutomation()`. The existing pipeline remains the default until the flag is set.

## Next (Phase 8 — final)
Hardening: graph registration in the registry, an E2E/integration pass over the interrupt/resume flows, a deployment checklist + rollback runbook, and doc updates. CI + security scans stay green.
