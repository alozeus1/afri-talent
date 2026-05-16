# Runbook — Billing webhook backlog

**Severity:** P1 — payment failures degrade trust; deferred webhook delivery breaks subscription state.
**Last updated:** 2026-05-15 (Wave 9 §10.3).

## Trigger

- Lambda `afritalent-dev-webhook-stripe` or `afritalent-dev-webhook-flutterwave` `Errors` metric spiking.
- Lambda `Duration` consistently near timeout (30s).
- Founder/user report: "I paid but my account still shows Free tier."
- Stripe / Flutterwave dashboard shows undelivered events older than 1 hour.

## Immediate triage

```bash
# 1. Lambda error rate (last 30 min):
for FN in afritalent-dev-webhook-stripe afritalent-dev-webhook-flutterwave; do
  echo "=== $FN ==="
  aws logs tail "/aws/lambda/$FN" --since 30m --region us-east-1 --format short | tail -30
done

# 2. Invocation count vs error count (last hour):
for FN in afritalent-dev-webhook-stripe afritalent-dev-webhook-flutterwave; do
  echo "=== $FN ==="
  aws cloudwatch get-metric-statistics --namespace AWS/Lambda --metric-name Errors --dimensions Name=FunctionName,Value=$FN \
    --start-time $(date -u -d '1 hour ago' +%FT%TZ) --end-time $(date -u +%FT%TZ) \
    --period 300 --statistics Sum --region us-east-1
done

# 3. In Stripe dashboard: Webhooks → check the endpoint; "Pending deliveries" count.
#    In Flutterwave dashboard: Settings → Webhooks → recent failures.
```

## Common causes

1. **Webhook secret rotated** — Stripe or Flutterwave dashboard rotated; SSM `STRIPE_WEBHOOK_SECRET` / `FLUTTERWAVE_SECRET_HASH` is stale; signature validation fails; Lambda returns 401; provider retries.
2. **Lambda Function URL AuthType drift** — Wave 1 set this to `NONE` intentionally (signatures verified in code). If a TF apply flipped it to `AWS_IAM`, providers can't reach it.
3. **DATABASE_URL write contention** — Lambda can't write `Subscription` rows fast enough; times out at 30s. Look for `connection timeout` in Lambda logs.
4. **Stripe/Flutterwave platform outage** — check their public status pages.
5. **Catalog drift** — `STRIPE_PRICE_CATALOG_JSON` SSM value doesn't match the prices in `STRIPE_PRICE_*_MONTHLY` SSM params; Lambda rejects event as unknown price.

## Mitigation

- **Webhook secret rotation:** copy fresh secret from provider dashboard:
  ```bash
  # Stripe:
  aws ssm put-parameter --name /afritalent/dev/STRIPE_WEBHOOK_SECRET \
    --type SecureString --value "$NEW_SECRET" --overwrite --region us-east-1
  # Force Lambda cold start (env refresh):
  aws lambda update-function-configuration \
    --function-name afritalent-dev-webhook-stripe \
    --description "Cycle env after webhook secret rotation $(date -u +%FT%TZ)" \
    --region us-east-1
  ```
- **AuthType drift:** confirm via `aws lambda get-function-url-config --function-name afritalent-dev-webhook-stripe`. If wrong, fix via TF apply.
- **DB write contention:** Aurora may be auto-paused; ping `/api/health` or warm up by calling a backend endpoint first. Permanent fix is to raise `aurora_min_acu` from 0 to 0.5 in tfvars.
- **Catalog drift:** dump current SSM values, diff against `backend/src/lib/billing/STRIPE_PRICE_CATALOG.JSON` (the source of truth). Re-populate any missing keys.

## Replay missed webhooks

Both providers retain delivery history and let you replay specific events:

- **Stripe:** Webhooks → endpoint → click event → "Resend webhook". Replay covers up to 30 days.
- **Flutterwave:** Settings → Webhooks → Logs → "Retry" against the specific event ID. Coverage ~24h.

For events older than the provider retention window, use the admin replay path in backend (`scripts/admin/replay-billing-event.ts`) feeding the raw event JSON from Stripe/Flutterwave export.

## Reconciliation

After mitigation, check that `Subscription` rows match upstream state for affected users:

```bash
psql "$DATABASE_URL" -c "
  SELECT user_id, plan, status, current_period_end
  FROM \"Subscription\"
  WHERE updated_at < NOW() - INTERVAL '24 hours'
    AND status IN ('past_due', 'incomplete', 'incomplete_expired');
"
```

Any row in `incomplete_expired` for a user who actually paid → manual reconcile per `docs/BILLING_INCIDENT_RESPONSE.md`.

## Escalation

- **15 minutes, customer-affecting:** founder paged.
- **30 minutes, > $100 in undelivered events:** start incident commander mode; treat as revenue-affecting outage.

## References

- `docs/BILLING_INCIDENT_RESPONSE.md` — playbook for failed payments.
- `docs/PAYMENT_OUTAGE.md` — broader outage classification.
- `backend/src/lambda/webhook-stripe.ts`, `backend/src/lambda/webhook-flutterwave.ts`.
