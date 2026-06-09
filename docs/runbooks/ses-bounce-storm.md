# Runbook — SES bounce storm

**Severity:** P1 — reputation damage risk; ignoring this can land us in the SES sandbox or get the sending domain suspended.
**Last updated:** 2026-05-15 (Wave 9 §10.3).

## Trigger

- SES `Reputation.BounceRate` > 5% over 24h (AWS-managed alarm — when enabled in Wave 9.5).
- SES `Reputation.ComplaintRate` > 0.1% over 24h.
- Founder report from SES: warning email about reputation thresholds.
- Sudden spike in `mail-delivery-failure` events in CloudWatch.

## Immediate triage

```bash
# 1. SES reputation metrics — last 24 h:
aws cloudwatch get-metric-statistics \
  --namespace AWS/SES \
  --metric-name Reputation.BounceRate \
  --start-time $(date -u -d '24 hours ago' +%FT%TZ) \
  --end-time $(date -u +%FT%TZ) \
  --period 3600 --statistics Maximum --region us-east-1

# 2. Recent bounce details (last 100):
aws sesv2 get-suppressed-destination --email-address <suspected-email> --region us-east-1
# Or list the whole suppression list:
aws sesv2 list-suppressed-destinations --region us-east-1 --max-items 50

# 3. Are we still in SES sandbox? If yes — we shouldn't be sending mass:
aws sesv2 get-account --region us-east-1 --query '{Sandbox:ProductionAccessEnabled,SendQuota:SendQuota}'
```

## Common causes

1. **List freshness** — a job ingestion source seeded fake/stale employer emails into our employer outreach flow. Bounces concentrate on a single domain or pattern.
2. **Compromised employer account sending phishing** — an employer user's account was takeover'd and is mass-mailing candidates with rogue content; recipients mark as spam → complaints spike.
3. **Welcome-email loop** — a registration bug causes the welcome email to send N times per user. Recipients hit "spam" out of frustration.
4. **DKIM / DMARC broken** — recent infra change invalidated DKIM signature; receivers reject as forgery; effectively all mail bounces.
5. **DigitalOcean → Route 53 cutover mid-flight** — DNS records out of sync; DKIM TXT not yet propagated.

## Mitigation

- **Immediate triage (within 15 minutes):**
  ```bash
  # Halt all SES sending while we triage:
  aws ssm put-parameter --name /afritalent/dev/SES_ENABLED --value "0" --overwrite --type String --region us-east-1
  # Restart backend so workers pick up:
  aws ecs update-service --cluster afritalent-dev --service afritalent-dev-backend --force-new-deployment --region us-east-1
  ```
- **Identify the offending source:** check recent CloudWatch Logs for `email.ts` calls grouped by template name. If one template/flow dominates, disable that flow specifically rather than all sending.
- **DKIM / DMARC verification:**
  ```bash
  dig +short TXT default._domainkey.afri-talent.com
  dig +short TXT _dmarc.afri-talent.com
  ```
  Compare against the SES-issued values: `aws sesv2 get-email-identity --email-identity afri-talent.com --region us-east-1`.
- **Compromised employer account:** soft-suspend the user (`UPDATE "User" SET suspended_at = NOW() WHERE id = '...'` via a DBA session). Coordinate with security-engineer.
- **List freshness:** re-run list validation; quarantine emails that bounced from the offending source for a 30-day cooldown.

## Reputation rescue

Once mitigated, monitor `Reputation.BounceRate` for 7 days. If still elevated:

1. Reduce send volume by 50%.
2. Focus on transactional mail only (password reset, magic link, payment confirm). Pause marketing/digest sends.
3. If SES suspends us, file a case via AWS Support — turnaround is typically 24 h for first offense.

## Escalation

- **15 minutes:** founder + security-engineer paged.
- **Bounce rate > 10%:** treat as production-critical; SES suspension is imminent at that level.
- **Suspended:** Wave 9.5 — provision a fallback SMTP via Postmark or SendGrid; this is a follow-up infrastructure item.

## References

- `docs/EMAIL_DELIVERY_OUTAGE.md` — broader outage taxonomy.
- `backend/src/lib/email.ts` — SES sender wrapper.
- `infra/terraform/modules/ses/` — domain identity + DKIM config.
