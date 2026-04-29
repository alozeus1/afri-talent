# AfriTalent — AI Usage & Rate Limit Policy

**Date:** 2026-04-29  
**Status:** Early-access (sandbox limits active)

---

## AI Provider

AfriTalent uses **Anthropic Claude** as its primary AI provider.

- **Fast model:** `claude-haiku-4-5-20251001` — used for quick AI tasks (resume review, chat responses)
- **Quality model:** `claude-sonnet-4-6` — used for job matching, apply packs, complex analysis
- **Orchestrator token budget cap:** 120,000 tokens per run (configurable via `ORCHESTRATOR_TOKEN_BUDGET_MAX`)
- **Kill switch:** Set `AI_DISABLED=1` to return 503 for all AI routes
- **Mock mode:** Set `MOCK_AI=1` to return stub responses (no API key required)

Semantic job matching additionally uses **OpenAI `text-embedding-3-small`** for embeddings.

---

## Candidate-Facing AI Features

| Feature | Route | Provider | Limits |
|---------|-------|----------|--------|
| Resume review | `POST /api/orchestrator/run` (run_type: resume_review) | Claude | 15k token budget |
| Job matching | `POST /api/orchestrator/run` (run_type: job_match) | Claude | 12k per job, max 120k total |
| Apply pack | `POST /api/orchestrator/run` (run_type: apply_pack) | Claude | 120k token budget |
| AI chat (Mara) | `POST /api/chat` | Claude | Conversation-level |
| Resume builder | `POST /api/skills/resume-builder` | Claude | Per-request |
| Career advisor | `POST /api/skills/career-advisor` | Claude | Per-request |

---

## Usage Limits (Server-Enforced)

Limits are enforced at the backend via the `orchestratorLimiter` middleware and per-skill daily quotas.

| Plan | Resume Reviews/Day | Job Matches/Day | Apply Packs/Day |
|------|-------------------|-----------------|-----------------|
| Free | 10 | 20 | 5 |
| Basic | 10 | 20 | 5 |
| Professional | Unlimited | Unlimited | Unlimited |
| Admin/test | No limit (bypass) | No limit | No limit |

Environment overrides:
- `DAILY_RESUME_REVIEW_LIMIT` (default: 10)
- `DAILY_JOB_MATCH_LIMIT` (default: 20)
- `DAILY_APPLY_PACK_LIMIT` (default: 5)

---

## Rate Limit Behaviour

When a user hits their daily limit:
- Backend returns `429 Too Many Requests`
- Response body: `{ "error": "Daily limit reached", "resetAt": "<ISO timestamp>" }`
- Frontend shows: "You've reached today's AI analysis limit. Try again tomorrow or upgrade your plan."

---

## Orchestrator Request Limits

Each orchestrator run enforces a token budget:
- Token budget prevents runaway API costs on large inputs
- Jobs > 10 or resume > 15k chars are truncated before submission
- The orchestrator gracefully degrades — partial results are returned if the budget is reached

---

## Cost Protection

1. **Server-side quota** — enforced via database `AiRun` table tracking per-user daily usage
2. **Per-run token cap** — `ORCHESTRATOR_TOKEN_BUDGET_MAX=120000`  
3. **Kill switch** — `AI_DISABLED=1` immediately stops all AI calls
4. **MOCK_AI mode** — safe for testing without API calls

---

## AI Provider Not Exposed

The Anthropic API key is stored as an AWS Secrets Manager secret (`afritalent-staging/app-secrets`) and injected at runtime. It is never exposed in frontend bundles, API responses, or logs.

---

## Follow-Up Work

- [ ] Show remaining daily quota in the AI assistant UI
- [ ] Add Pro plan bypass for orchestrator limits
- [ ] Add alert email when daily budget exceeds 80% of monthly budget
- [ ] Evaluate Anthropic token pricing against expected user volume for pricing tier calibration
