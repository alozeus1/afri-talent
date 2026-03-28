# Billing Reconciliation Operations

## Purpose

This document defines the operational layer for AfriTalent billing across Africa, Europe, and Rest of World pricing. It covers the admin dashboard surfaces, reconciliation jobs, discrepancy classes, and alert expectations that keep billing auditable and supportable.

## Implemented Surfaces

- Admin billing dashboard: `/admin/billing`
- Admin billing API:
  - `GET /api/admin/billing/dashboard`
  - `GET /api/admin/billing/discrepancies`
  - `GET /api/admin/billing/reconciliation-runs`
  - `POST /api/admin/billing/reconcile`
  - `GET /api/admin/billing/customers/search`
  - `GET /api/admin/billing/customers/:userId`
  - `POST /api/admin/billing/customers/:userId/resync-entitlements`
  - `POST /api/admin/billing/customers/:userId/actions`

## Billing Integrity Controls

- Webhook idempotency:
  - Redis-backed Stripe event reservation with in-memory fallback
  - Duplicate webhook attempts logged into `BillingEventAudit`
- Billing event audit trail:
  - `BillingEventAudit` stores checkout creation, webhook processing, payment failures, recoveries, and refund updates
- Entitlement sync validation:
  - `BillingEntitlementState` stores the last synchronized effective plan, status, checksum, and pricing context
  - Reconciliation validates drift before re-syncing
- Discrepancy tracking:
  - `BillingDiscrepancy` captures webhook failures, plan mismatches, stale entitlements, region mismatches, pending refunds, and payment risk
- Support action history:
  - `BillingSupportAction` stores notes, receipt resend attempts, refund reviews, manual resyncs, and grandfather overrides with reason codes

## Dashboard Views

## Admin billing dashboard cards

- Successful payments
- Failed payments
- Webhook failures
- Mismatched subscription states
- Unpaid but entitled
- Paid but not entitled
- Pending refunds
- Last reconciliation run

## Customer drill-down

- Billing profile and region metadata
- Grandfathering and pricing version
- Subscription identifiers and period end
- Entitlement sync state
- Invoice, payment, webhook, and refund event history
- Support action timeline

## Recommended CloudWatch and log-derived metrics

- `billing_successful_payments_24h`
- `billing_failed_payments_24h`
- `billing_webhook_failures_open`
- `billing_subscription_state_mismatches_open`
- `billing_unpaid_but_entitled_open`
- `billing_paid_but_not_entitled_open`
- `billing_pending_refunds_open`
- `billing_reconciliation_completed`
- `billing_reconciliation_failed`

## Daily Reconciliation Job

- Worker: `billing-reconciliation`
- Default schedule: every 24 hours
- First-run after boot: 60 seconds after scheduler startup
- Responsibilities:
  - validate local subscription state against entitlement snapshot
  - re-sync entitlement state
  - detect unpaid-but-entitled and paid-but-not-entitled users
  - compare Stripe subscription state when Stripe is configured
  - update reconciliation run history
  - emit billing snapshot metrics

## Discrepancy Classes

- `WEBHOOK_FAILURE`
- `SUBSCRIPTION_STATE_MISMATCH`
- `PLAN_MISMATCH`
- `UNPAID_BUT_ENTITLED`
- `PAID_BUT_NOT_ENTITLED`
- `PENDING_REFUND`
- `REGION_MISMATCH`
- `STALE_ENTITLEMENT`
- `PAYMENT_FAILURE`

## Severity and Ownership

- `CRITICAL`
  - paid-but-not-entitled users
  - widespread webhook failure
  - reconciliation run failed
  - Owner: Platform + Finance Ops
- `HIGH`
  - subscription state mismatch
  - repeated payment failure on paid accounts
  - region tampering mismatch
  - Owner: Billing engineering + Support lead
- `MEDIUM`
  - stale entitlement snapshot
  - pending refund backlog
  - Owner: Support + Finance Ops

## Alert Expectations

- Page the on-call engineer when:
  - `billing_reconciliation_failed` occurs
  - webhook failures stay open for more than 15 minutes
  - paid-but-not-entitled count is greater than 0
- Notify finance/support Slack channel when:
  - unpaid-but-entitled count exceeds threshold
  - pending refunds exceed threshold
  - failed payments spike day-over-day

## Reason Codes

Standard support and moderation reason codes for billing actions:

- `manual_entitlement_resync`
- `invoice_payment_failed`
- `subscription_status_mismatch`
- `subscription_plan_mismatch`
- `billing_country_payment_country_mismatch`
- `unsupported_currency_for_region`
- `refund_pending`
- `support_note`
- `refund_review`
- `plan_correction`
- `grandfather_override`

## Regional Pricing Safety Rules

- Billing region is resolved server-side from the stored billing profile
- User-supplied region is never trusted during checkout
- Currency must be supported for the resolved region
- Checkout is blocked when the stored billing country conflicts with the last verified Stripe payment country and the account is not grandfathered
- Europe checkout enables tax ID collection and automatic tax support

## Manual Support Expectations

- Use `/admin/billing` before opening Stripe for any customer case
- Record every manual intervention with a support action and reason code
- Re-sync entitlements after any manual subscription correction
- Treat grandfather overrides as finance-approved exceptions only
