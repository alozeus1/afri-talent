# Runbook — Apply Agent failures spike

**Severity:** P1 — direct candidate-facing failure; bad UX + churn risk.
**Last updated:** 2026-05-15 (Wave 9 §10.3).

## Trigger

- **Alarm `afritalent-dev-slo-apply-delivery-rate`** — Apply Agent confirmed-delivery rate dropped below 95% over 15 minutes. (SLO #4 — see `modules/observability/alarms.tf`.)
- Customer support escalation: "I applied but the employer never got it."
- BullMQ `applications` queue with high `failed` count in Redis (when enabled).

> Note: Wave 9 §10.1 PR-A defines the alarm; the underlying metric (`ApplyAgentSubmissions` / `ApplyAgentConfirmed`) is emitted by PR-B (`release/launch-wave-9-agent-metrics`). Until PR-B applies, this alarm sits in INSUFFICIENT_DATA — the runbook still applies for manual triage via logs.

## Immediate triage

```bash
# 1. Recent Apply Agent activity (last 30 min):
aws logs tail /ecs/afritalent-dev/backend --since 30m --region us-east-1 --format short \
  | grep -E 'ApplyAgent|apply.*submission' | tail -50

# 2. By status, last 24 h (DB query — use psql via bastion or SSM):
psql "$DATABASE_URL" -c "
  SELECT submission_status, COUNT(*)
  FROM \"ApplicationSubmission\"
  WHERE created_at > NOW() - INTERVAL '24 hours'
  GROUP BY 1 ORDER BY 2 DESC;
"

# 3. ATS-side delivery — recent webhook events:
psql "$DATABASE_URL" -c "
  SELECT provider, event_type, COUNT(*)
  FROM \"AtsEvent\"
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY 1,2;
"
```

## Common causes

1. **Greenhouse / Lever / Workable API key revoked** — employer rotated their token; we silently fail until they re-link.
2. **Apify task quota exhausted** — career-page scraping for "no public API" employers via Apify hits monthly limit.
3. **ATS_TOKEN_ENCRYPTION_KEY rotated without re-encrypting existing tokens** — all stored tokens fail to decrypt. Visible as 100% failure for a specific employer cohort.
4. **Anthropic / OpenAI degraded** — Apply Agent depends on LLM to fill out custom application forms. LLM 5xx → fall-through to manual queue.
5. **Stale job tombstone** — Apply Agent submits but employer already closed the role; ATS responds 410 Gone. Should be caught by stale-job-removal (SLO #6); if it isn't, both alarms fire together.

## Mitigation

- **Stop the bleed:** disable Apply Agent autopilot until root cause known:
  ```bash
  aws ssm put-parameter --name /afritalent/dev/APPLY_AUTOPILOT_ENABLED --value "0" --overwrite --type String --region us-east-1
  aws ecs update-service --cluster afritalent-dev --service afritalent-dev-backend --force-new-deployment --region us-east-1
  ```
- **Revoked ATS token (per-employer):** mark the employer's ATS integration `unhealthy`. Backend will skip applying via that path and fall back to email/manual. Notify the employer (template in `lib/notifications/`).
- **Apify quota:** check `https://console.apify.com/billing`. Founder action: top up or upgrade plan.
- **LLM degraded:** check Anthropic + OpenAI status pages. Switch model via SSM `AI_QUALITY_MODEL` if a specific model has the issue; gate Apply Agent to known-good model.
- **Token decryption failures:** lookup recent rotations of `ATS_TOKEN_ENCRYPTION_KEY` in audit log. If rotated without backfill, restore prior key from KMS history (founder approval — destructive).

## Backfill failed submissions

For confirmed-deliverable failures that we incorrectly marked failed:

1. Query `ApplicationSubmission WHERE submission_status = 'failed' AND failure_reason IS NULL` (likely caused by transient).
2. Re-enqueue via admin script: `npx tsx scripts/admin/re-enqueue-failed-applications.ts --since "24 hours ago"`.
3. Monitor for re-failure within 1 hour; if delivery rate doesn't recover, root cause isn't a transient.

## Escalation

- **15 minutes:** founder paged.
- **30 minutes, >25% of submissions in 24h failed:** post status-page update; the "AI agents" component → Degraded.
- **1 hour, unresolved:** disable applications endpoint via feature flag and message affected candidates by email.

## References

- `backend/src/lib/apply/` — Apply Agent implementation.
- `backend/src/lib/ats/` — ATS providers + token handling.
- `docs/PHASE3_ROLLOUT_PLAN.md` — Apply Agent confirmation flow design.
