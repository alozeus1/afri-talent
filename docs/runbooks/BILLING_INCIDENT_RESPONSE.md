# Runbook: Billing Incident Response

## Trigger

- `billing_reconciliation_failed`
- paid-but-not-entitled count greater than `0`
- webhook failures rising or stuck open
- checkout blocks caused by unexpected region mismatch
- finance or support reports invoice/refund inconsistencies

## Severity Guide

- `SEV-1`
  - active customers lose paid access
  - checkout or billing portal broken for most users
- `SEV-2`
  - webhook processing failing
  - entitlement drift affecting some customers
  - refunds not progressing
- `SEV-3`
  - isolated support cases or single-customer mismatch

## Immediate Actions

1. Open `/admin/billing` and confirm the current discrepancy mix.
2. Check the latest reconciliation run status and timestamp.
3. Inspect recent `BillingEventAudit` entries for the affected users.
4. Verify Stripe keys, webhook secret, and Stripe service health.
5. Confirm whether the issue is checkout creation, webhook processing, entitlement sync, or regional pricing validation.

## Triage Flow

### If checkout is failing

- Check `billing.checkout.failed` and `billing.checkout.blocked` events.
- Verify `RegionalPrice` configuration for the target plan, region, interval, and currency.
- Confirm the customer billing profile currency is supported for the stored region.

### If webhooks are failing

- Inspect dead letters and `WEBHOOK_FAILURE` discrepancies.
- Re-run reconciliation after the root cause is fixed.
- Replay Stripe webhooks only after idempotency and handler health are confirmed.

### If paid users lost access

- Search the customer in `/admin/billing`.
- Check the subscription row, entitlement state, and latest billing events.
- Use `Re-sync entitlements`.
- If the local state is wrong, correct the subscription source of truth first, then re-sync.

### If unpaid users still have access

- Review `PAYMENT_FAILURE` and `UNPAID_BUT_ENTITLED` discrepancies.
- Confirm whether the account is still within an intended grace period.
- Coordinate with finance/support before forcing downgrade or cancellation.

### If refunds are stuck

- Inspect `refund.created`, `refund.updated`, and `charge.refunded` audit events.
- Review pending refund discrepancies and recent support notes.
- Confirm whether Stripe marked the refund as `pending`, `requires_action`, or `succeeded`.

## Recovery Actions

- Re-sync entitlements for affected customers
- Add support notes with reason codes for every manual correction
- Trigger manual reconciliation after batch recovery
- If needed, apply a finance-approved grandfather override

## Exit Criteria

- Checkout creation succeeds
- No unresolved `WEBHOOK_FAILURE` discrepancies remain
- Paid-but-not-entitled count returns to `0`
- Latest reconciliation run is `SUCCESS` or understood `PARTIAL`
- Support action history documents the recovery steps
