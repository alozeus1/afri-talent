# Runbook: Payment Outage

## Trigger

- Billing checkout failures spike
- Stripe webhook processing fails
- Users cannot complete plan upgrades

## Immediate Actions

1. Confirm whether failure is at checkout session creation, Stripe checkout, or webhook completion.
2. Check Stripe API key, webhook secret, and Stripe dashboard health.
3. Review backend billing logs and webhook dead letters.

## Diagnose

- `billing_checkout_session_success`, `billing_checkout_success`, `billing_checkout_failure`
- Stripe webhook logs and replay attempts
- Stripe dashboard health alerts
- Recent pricing, billing, or secret changes
- `/admin/billing` dashboard
- `docs/runbooks/BILLING_INCIDENT_RESPONSE.md`
- `docs/runbooks/BILLING_SUPPORT_SOPS.md`

## Mitigate

- Restore or rotate Stripe credentials if needed.
- Replay failed webhooks once root cause is addressed.
- Roll back billing deployment if the break aligns with a recent release.
- If checkout cannot be restored quickly, disable upgrade CTAs and post a status update.

## Exit Criteria

- Successful checkout session creation verified
- Successful webhook completion verified
- No new billing dead letters for 15 minutes
