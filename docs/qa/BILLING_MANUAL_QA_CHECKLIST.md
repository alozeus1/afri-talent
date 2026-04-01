# Billing Manual QA Checklist

## Checkout and Pricing

- Verify Africa customer with valid Africa billing profile can create checkout for candidate and employer plans.
- Verify Europe customer receives EUR pricing, tax ID collection, and automatic tax-enabled checkout.
- Verify ROW customer receives ROW pricing and supported currency only.
- Verify checkout is blocked if the saved currency is not supported for the user region.
- Verify checkout is blocked when saved billing country conflicts with last verified Stripe payment country on a non-grandfathered user.
- Verify a grandfathered customer can still load billing pages and keep pricing metadata visible.

## Webhooks and Audit Trail

- Simulate `checkout.session.completed` and confirm:
  - subscription is activated
  - entitlement state is synced
  - billing event audit row is created
- Simulate `customer.subscription.updated` and confirm plan/status audit history.
- Simulate `invoice.payment_failed` and confirm:
  - subscription moves to `PAST_DUE`
  - `PAYMENT_FAILURE` discrepancy is created
  - retry metadata is visible
- Simulate `invoice.paid` or `invoice.payment_succeeded` and confirm:
  - subscription returns to `ACTIVE`
  - prior payment failure discrepancy resolves
- Simulate duplicate Stripe webhook delivery and confirm it is recorded as `DUPLICATE`.
- Simulate handler failure and confirm a `WEBHOOK_FAILURE` discrepancy is created.

## Refunds and Cancellations

- Simulate `refund.created` or `refund.updated` with `pending` status and confirm `PENDING_REFUND` discrepancy.
- Simulate refund success and confirm the pending refund discrepancy resolves.
- Simulate `customer.subscription.deleted` and confirm:
  - subscription downgrades to free
  - entitlement state updates
  - cancellation audit history is visible

## Reconciliation

- Trigger manual reconciliation from `/admin/billing`.
- Confirm the run is written to reconciliation history.
- Confirm unpaid-but-entitled users appear when a paid plan is `PAST_DUE`.
- Confirm paid-but-not-entitled users are surfaced if entitlement state is forced stale.
- Confirm stale entitlement discrepancies resolve after manual re-sync.

## Admin Support Tooling

- Search customer by email.
- Search customer by Stripe customer ID.
- Verify customer detail page shows:
  - billing profile
  - subscription identifiers
  - entitlement snapshot
  - billing event history
  - support action history
- Record a `NOTE` support action and verify it appears in history.
- Record a `RESEND_RECEIPT` action with invoice ID and verify the result message is shown.
- Record a `REFUND_REVIEW` action and verify the reason code is stored.

## Regional Pricing Safety

- Change billing country to a different region with supported currency and verify the save succeeds.
- Try to save unsupported currency for region and verify validation failure.
- Verify Europe VAT metadata persists on billing profile when entered.
- Confirm pricing version and grandfather state remain visible in admin detail.
