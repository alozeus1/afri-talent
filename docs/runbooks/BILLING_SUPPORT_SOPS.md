# Billing Support SOPs

## Customer History Review

1. Search the customer in `/admin/billing`.
2. Confirm:
   - subscription plan and status
   - billing region, country, and currency
   - grandfathering status and pricing version
   - entitlement snapshot freshness
3. Review recent billing events in order:
   - checkout created
   - invoice paid or payment failed
   - subscription updated or deleted
   - refund events
4. Review existing discrepancies and prior support actions before making changes.

## Re-sync Entitlements SOP

Use when:

- the subscription row is correct but access is wrong
- the entitlement snapshot is stale
- a webhook was delayed or recovered late

Steps:

1. Verify the subscription row is the correct source of truth.
2. Click `Re-sync entitlements`.
3. Confirm the entitlement state now matches the subscription plan and status.
4. Record a support action with `manual_entitlement_resync` if additional context is needed.

## Receipt / Invoice Resend SOP

Use when:

- a customer says they never received their invoice email
- finance needs a fresh invoice send for send-invoice flows

Steps:

1. Confirm the latest invoice ID from billing event history.
2. Run `Resend receipt / invoice` from `/admin/billing`.
3. If Stripe refuses the resend, capture the returned message in the support note.
4. Tell the customer whether the resend was accepted or whether Stripe requires a manual fallback.

## Refund Review SOP

Use when:

- support needs to document a refund decision
- finance is tracking a pending refund

Steps:

1. Confirm the related invoice, payment intent, and refund event history.
2. Record a `REFUND_REVIEW` support action with the reason code.
3. If the refund is pending, monitor for `refund.updated` or `charge.refunded`.
4. Resolve the discrepancy once Stripe reports success.

## Cancellation SOP

1. Confirm whether the cancellation came from Stripe customer portal or manual action.
2. Verify `customer.subscription.deleted` or matching subscription status change exists.
3. Confirm the account moved to the correct effective entitlements.
4. Record `CANCEL_SUBSCRIPTION` support action if a manual explanation is needed.

## Upgrade / Downgrade Correction SOP

1. Review the latest plan events and Stripe subscription state.
2. If local state is wrong, correct the source state first.
3. Re-sync entitlements.
4. Record `UPGRADE_DOWNGRADE_CORRECTION` with the exact reason code used.

## Grandfather Override SOP

1. Confirm finance approval exists.
2. Record the approval reference in the support notes.
3. Apply `GRANDFATHER_OVERRIDE`.
4. Verify pricing version and grandfather flag on the billing profile.
5. Re-run reconciliation if the case changes an open discrepancy.
