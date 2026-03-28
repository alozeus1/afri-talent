# Phase 3 Billing Localization Plan

## Objective

Deliver region-aware pricing and payment readiness with strong compliance defaults for Europe, while creating a staged roadmap for African payment rails.

## Current Implementation Baseline

### Region Model

Configured in `RegionConfig` with active regions:

- `AFRICA`
- `EUROPE`
- `ROW`

Backed by:

- `backend/prisma/seed-regional-pricing.ts`
- `GET /api/pricing`
- `GET /api/pricing/me`
- `GET /api/pricing/payment-localization`

### Entitlement Coupling

Plan-level capabilities are defined independently from region pricing to prevent entitlement drift by geography.

## Regional Strategy

## Europe (Immediate)

### Requirements

- EUR/GBP/CHF pricing support
- VAT-aware tax labeling and invoicing metadata
- B2B reverse-charge handling metadata
- Europe-friendly payment methods

### Current Coverage

- Tax behavior: `exclusive`
- Tax label: `VAT`
- Metadata supports VAT and reverse-charge markers
- Live methods metadata includes card + SEPA + iDEAL + Bancontact

### Next Steps

- Stripe Tax or equivalent for country-level VAT rate logic
- Legal invoice template validation per country requirements
- VAT ID validation at checkout + invoice-level persistence

## Africa (Roadmap-first)

### Requirements

- Keep card payments live globally as fallback
- Add localized methods incrementally (gateway by gateway)
- Minimize failed payment rates due to card coverage gaps

### Current Coverage

- Live methods metadata includes `card`
- Roadmap metadata includes:
  - `flutterwave`
  - `paystack`
  - `mtn_momo`
  - `airtel_money`

### Next Steps

- Introduce payment-provider abstraction (`PaymentMethodAdapter` pattern)
- Add currency settlement and FX reconciliation workflow
- Country rollout matrix by gateway support and fraud profile

## Architecture Plan

### API Contract

Primary public endpoint for frontend capability rendering:

- `GET /api/pricing/payment-localization`

Response includes per-region:

- `defaultCurrency`
- `currencies`
- `taxBehavior`
- `taxLabel`
- `paymentMethodsLive`
- `paymentMethodsRoadmap`
- `compliance`
- `taxMetadata`

### Data Ownership

- Product/Finance controls region and method policy in `RegionConfig.metadata`
- Engineering controls runtime wiring and adapter behavior
- Support/Ops consumes region metadata for customer comms and troubleshooting

## Compliance Plan

## Europe

- VAT ID capture (where applicable)
- Reverse-charge logic for valid B2B flows
- Invoice line-item tax transparency
- Retention and retrieval of tax evidence

## Africa + ROW

- Country-specific legal/tax treatment tracked in regional metadata roadmap
- Move to explicit tax behavior per country as gateway coverage expands

## Risk Log

- Payment method mismatch between UI metadata and backend provider setup
- FX exposure where local display currency differs from settlement currency
- Tax misconfiguration during new-country launches
- Failed payment spikes during gateway rollouts

## Mitigations

- Feature-flag each new payment method by region and country
- Canary rollout with controlled merchant cohorts
- Alerting on payment failure reason codes by region/method
- Automated regression checks for pricing + entitlement response contracts

## Rollout Gates

1. Metadata only (UI discoverability, no checkout enablement)
2. Internal sandbox transactions by region
3. Limited production rollout to selected countries
4. Full regional rollout with monitoring and support playbook

## Verification Checklist

- `GET /api/pricing` returns region-correct currencies and price rows
- `GET /api/pricing/payment-localization` returns expected method metadata
- Entitlements unchanged across region switches for identical plan
- Checkout routes enforce only enabled methods for active region
- Invoice metadata includes tax behavior/labels where required
