# Rollout 1 — Job ingestion quality gate (live wiring)

**Status:** Implemented, full project typecheck clean, 95/95 langgraph + 15/15 aggregator tests green. **Flag OFF by default → aggregator behavior unchanged.** This is the first graph wired into a live path.

## What it wires
The `jobIngestionQuality` graph is now connected to the aggregation pipeline. In `aggregator/index.ts → upsertJob`, when `LANGGRAPH_JOB_INGESTION_QUALITY` (or global `LANGGRAPH_ENABLED`) is set, each normalized job is scored by the graph and the decision maps onto persistence:

| Decision | Effect |
|---|---|
| `publish` | `status=PUBLISHED`, `riskLevel=LOW` (current behavior) |
| `publish_with_warning` | `status=PUBLISHED`, `riskLevel=MEDIUM` |
| `hold` | `status=PENDING_REVIEW` (not visible to users; goes to admin review) |
| `reject` | job is **not persisted** (`upsertJob` returns `skipped`) |

When the flag is **off**, `qualityOverride` is `undefined` and the row is written exactly as before (`PUBLISHED` / `riskScore 0` / `LOW`).

## Adapter (`integration/jobIngestionAdapter.ts`)
Connects the graph's injected deps to real functions:
- `assessContentRisk` → existing trust content-risk score (deterministic scam signal).
- `getSourceReliability` → deterministic per-source reliability (ATS boards > aggregators).
- `recordDecision` → `recordOpsEvent("job_ingestion_decision")`.
- `embedJob` → no-op (embedding stays owned by the semantic-indexer worker).

## Tests
- Decision→persistence mapping (reject→null, hold→PENDING_REVIEW, warn→PUBLISHED+MEDIUM, publish→PUBLISHED+LOW).
- Source-reliability ordering + default.
- End-to-end `gateJobIngestion` on a clean job → `publish` (uses the real content-risk function).
- Aggregator regression suite stays green (flag-off path unchanged).

## Enable (you control activation)
```bash
# staging only — start here
LANGGRAPH_ENABLED=1
LANGGRAPH_JOB_INGESTION_QUALITY=1
```
Run an aggregation cycle, then watch:
- ops metric `job_ingestion_decision` (decision distribution),
- jobs landing in `PENDING_REVIEW` (admin queue) vs `PUBLISHED`,
- no drop in legitimate publish volume.
Roll back instantly by unsetting `LANGGRAPH_JOB_INGESTION_QUALITY`.

## Notes
- Safe-first choice: no human-in-the-loop, no email/money/submission paths touched.
- `PENDING_REVIEW` jobs need an admin surface to action — they already exist in `JobStatus`; confirm the admin job queue lists them before enabling at scale.
- Per-job gate cost is small (deterministic scoring, no LLM call).
