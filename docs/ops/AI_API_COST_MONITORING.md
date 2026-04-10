# AI API Cost Monitoring

## Overview

AfriTalent uses the Anthropic Claude API for all AI skill endpoints. This document covers how to monitor, control, and alert on API costs.

## Models in Use

| Model | Env Var | Purpose |
|---|---|---|
| `claude-sonnet-4-6` | `AI_QUALITY_MODEL` | Resume generation, ATS scan, cover letter, career advisor |
| `claude-haiku-4-5-20251001` | `AI_FAST_MODEL` | Interview question generation, quick evaluations |

Token pricing (approximate, check Anthropic console for current rates):
- Sonnet: ~$3 / 1M input tokens, ~$15 / 1M output tokens
- Haiku: ~$0.25 / 1M input tokens, ~$1.25 / 1M output tokens

## Per-Skill Estimated Token Usage

| Skill | Model | ~Input tokens | ~Output tokens | ~Cost per call |
|---|---|---|---|---|
| Resume Builder | Sonnet | 800 | 1200 | ~$0.022 |
| ATS Scanner | Sonnet | 1500 | 500 | ~$0.012 |
| Cover Letter | Sonnet | 600 | 800 | ~$0.014 |
| Career Advisor | Sonnet | 700 | 1000 | ~$0.017 |
| Interview Questions | Haiku | 400 | 600 | ~$0.001 |
| Answer Evaluator | Haiku | 500 | 600 | ~$0.001 |

## Kill Switches

### Global disable (all AI routes return 503)
```
AI_DISABLED=1
```
Restart the backend service for this to take effect.

### Per-feature flags
```
ENABLE_AUTO_APPLY=false
ENABLE_INTERVIEW_PREP=false
ENABLE_SALARY_NEGOTIATION=false
```

### Mock mode (no API calls, stubs returned)
```
MOCK_AI=1
```
Safe for load testing and development.

## Quota Enforcement

Daily per-user quotas are enforced in `backend/src/middleware/quotas.ts`:

| Quota key | Env var | Default |
|---|---|---|
| `daily_apply_pack` | `DAILY_APPLY_PACK_LIMIT` | 5 |
| `daily_job_match` | `DAILY_JOB_MATCH_LIMIT` | 20 |
| `daily_resume_review` | `DAILY_RESUME_REVIEW_LIMIT` | 10 |

When a quota is exceeded the middleware returns HTTP 429 with `{ error: "quota_exceeded", ... }`.

## Monitoring in AWS

### CloudWatch cost alerts

Create a billing alert in the Anthropic console or monitor via cost allocation tags if using AWS Bedrock in future.

For the current direct Anthropic API integration, set up a monthly spend alert:
1. Go to Anthropic Console → Billing → Usage limits
2. Set a monthly spend cap (recommended: start at $100/month per environment)
3. Set an email alert at 80% of the cap

### Backend metrics to watch

The `orchestratorLimiter` rate limiter in `backend/src/middleware/security.ts` prevents burst abuse. Monitor:
- `429` response rate on `/api/skills/*` — high rate indicates abuse or misconfigured client
- P95 response time on skill endpoints — should be <8s for Sonnet, <3s for Haiku
- AI run records in `AiRun` table — each row represents one AI invocation

### Useful queries

```sql
-- Daily AI invocations per skill type
SELECT DATE("createdAt"), "skillType", COUNT(*)
FROM "AiRun"
WHERE "createdAt" > NOW() - INTERVAL '7 days'
GROUP BY 1, 2
ORDER BY 1 DESC, 3 DESC;

-- Failed AI runs (source != 'ai' means fallback was used)
SELECT DATE("createdAt"), COUNT(*)
FROM "AiRun"
WHERE source = 'fallback'
GROUP BY 1
ORDER BY 1 DESC;
```

## Cost Control Checklist (monthly)

- [ ] Review Anthropic console spend vs previous month
- [ ] Check `AiRun` table growth — trim records older than 90 days if needed
- [ ] Verify `MOCK_AI=0` is set in production (not staging)
- [ ] Confirm rate limiter `orchestratorLimiter` is active on all skill routes
- [ ] Review daily quota limits — adjust if usage patterns have changed
- [ ] Check for any skill endpoints missing quota middleware
