# Regional Pricing Architecture

## Overview

AfriTalent implements region-aware billing across three billing regions (Africa, Europe, Rest of World) while keeping plan entitlements fully decoupled from regional pricing. This means a Professional plan in Nigeria has the same features as a Professional plan in Germany — only the price and currency differ.

---

## Architecture Diagram

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Frontend    │────▶│  /api/pricing │────▶│ Region Resolver  │
│  Billing UI  │     │  /api/billing │     │  (priority chain) │
└─────────────┘     └──────┬───────┘     └────────┬────────┘
                           │                       │
                    ┌──────▼───────┐     ┌────────▼────────┐
                    │ RegionalPrice │     │ UserBillingProfile│
                    │   (DB table)  │     │  (country/region) │
                    └──────┬───────┘     └────────┬────────┘
                           │                       │
                    ┌──────▼───────┐     ┌────────▼────────┐
                    │    Stripe     │     │ BillingRegionAudit│
                    │  (checkout)   │     │  (audit trail)    │
                    └──────────────┘     └─────────────────┘
```

## Data Models

### RegionalPrice
Stores pricing for each plan × region × interval × currency combination.
- Keyed by `(plan, region, interval, currency)` unique constraint
- Each row has an optional `stripePriceId` for Stripe integration
- Prices are in minor currency units (cents, kobo, etc.)

### PlanEntitlement
Stores feature entitlements per plan. Keyed by `plan` (unique).
- **NOT** keyed by region — entitlements are plan-only
- Includes limits (applicationsPerMonth, aiResumeReviews, etc.)
- Includes boolean flags (prioritySupport, autopilot, apiAccess, etc.)
- Extensible via `customFeatures` JSON field

### UserBillingProfile
Per-user billing context:
- `country` — ISO 3166-1 alpha-2, authoritative for region mapping
- `region` — derived from country via `countryToRegion()`
- `currency` — user's billing currency
- `isGrandfathered` — locked into a pricing version
- `pricingVersion` — which price table version applies
- `regionSource` — how the region was determined
- `taxIdType/taxIdValue` — for EU VAT collection

### BillingRegionAudit
Immutable audit trail for every region/country change.
- Records previous and new values
- Captures the source (USER_SELECTED, STRIPE_PAYMENT, IP_GEOLOCATION, ADMIN_OVERRIDE)
- Includes IP address and metadata

### RegionConfig
Configuration per billing region:
- Default currency and supported currencies
- Country code list
- Tax behavior (inclusive/exclusive/unspecified)
- Tax label (VAT, GST, etc.)

## Region Resolution Priority Chain

```
1. UserBillingProfile.country (user-selected)     → HIGH confidence
2. UserBillingProfile.stripeCountry (payment)      → HIGH confidence
3. IP geolocation headers (cf-ipcountry, etc.)     → LOW confidence
4. Default: ROW / USD                              → FALLBACK
```

**Key rule:** IP geolocation is NEVER persisted automatically as a permanent region. It's used only as a soft signal for the pricing page and checkout pre-selection.

## Grandfathering

When prices change:
1. Call `grandfatherActiveSubscribers(currentVersion)` BEFORE updating prices
2. Sets `isGrandfathered = true` and `pricingVersion` on all active paid subscribers
3. Grandfathered users keep their current Stripe subscription price
4. New subscribers get the new prices
5. Grandfathering is removed when a user cancels and re-subscribes

## Stripe Integration

### Checkout Flow
1. Frontend calls `POST /api/billing/checkout` with `{ plan, interval }`
2. Backend resolves user's region via `resolveUserRegion()`
3. Looks up `RegionalPrice` for `(plan, region, interval, currency)`
4. Creates Stripe Checkout session with the correct `stripePriceId`
5. Falls back to legacy env-var prices if no regional price exists

### Webhook Updates
- `payment_method.attached` → captures card country, calls `updateStripeCountry()`
- `checkout.session.completed` → activates subscription
- `customer.subscription.updated` → syncs plan/status changes
- `customer.subscription.deleted` → cancels, removes grandfathering

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/pricing` | No | Public pricing page (region from query/IP) |
| GET | `/api/pricing/me` | Yes | User's personalized pricing context |
| POST | `/api/pricing/billing-country` | Yes | Set billing country + currency |
| GET | `/api/pricing/regions` | No | List active region configs |
| GET | `/api/pricing/entitlements/:plan` | No | Get entitlements for a plan |
| POST | `/api/billing/checkout` | Yes | Create regional checkout session |
| POST | `/api/billing/portal` | Yes | Stripe customer portal |
| GET | `/api/billing/status` | Yes | Current subscription status |

## Pricing Table (v1)

### Candidate Plans

| Plan | Africa (USD) | Europe (EUR) | ROW (USD) |
|------|-------------|-------------|-----------|
| Free | $0 | €0 | $0 |
| Basic / mo | $3.99 | €9.99 | $9.99 |
| Basic / yr | $39.90 | €99.90 | $99.90 |
| Professional / mo | $9.99 | €24.99 | $24.99 |
| Professional / yr | $99.90 | €249.90 | $249.90 |

### Employer Plans

| Plan | Africa (USD) | Europe (EUR) | ROW (USD) |
|------|-------------|-------------|-----------|
| Employer Free | $0 | €0 | $0 |
| Employer Basic / mo | $49.99 | €99.99 | $99.99 |
| Employer Basic / yr | $499.90 | €999.90 | $999.90 |
| Employer Premium / mo | $149.99 | €299.99 | $299.99 |
| Employer Premium / yr | $1,499.90 | €2,999.90 | $2,999.90 |

---

## Assumptions

1. Stripe is the only payment provider. No M-Pesa, Paystack, or Flutterwave integration at launch.
2. Africa pricing is denominated in USD by default. Local currency (NGN, KES) prices are available but Stripe Price objects must be created per currency.
3. IP geolocation relies on CDN headers (CloudFront/CloudFlare). No server-side MaxMind DB.
4. VAT is collected at checkout via Stripe Tax ID Collection for European customers. Actual tax calculation is delegated to Stripe Tax (not implemented in this iteration).
5. Existing subscribers on legacy env-var prices continue to work — the system falls back to `STRIPE_PRICES` when no `RegionalPrice` row matches.
6. Free plans do not have `RegionalPrice` rows. They are always free globally.
7. Stripe Price IDs in the `RegionalPrice` table are set to `null` until actual Stripe Prices are created via the Stripe Dashboard or API.
8. The seed script provides example pricing. Production prices should be reviewed by the business team.
9. Currency conversion is NOT handled by the platform. Each currency has its own explicit price.
10. Plan upgrades/downgrades follow the same regional pricing — Stripe proration handles the math.

---

## Rollout Plan

### Phase 1: Database & Backend (Complete)
- [x] Prisma schema additions (6 new models/enums)
- [x] Migration applied
- [x] Billing library (`lib/billing/`) with 5 modules
- [x] Pricing API routes
- [x] Updated billing checkout to resolve regional prices
- [x] Webhook updated to capture Stripe payment country
- [x] Seed script for regional pricing data
- [x] 32 unit tests passing

### Phase 2: Stripe Configuration (Manual)
- [ ] Create Stripe Price objects for each plan × region × interval × currency
- [ ] Update `RegionalPrice.stripePriceId` for each row
- [ ] Enable Stripe Tax ID Collection on the Stripe account
- [ ] Configure Stripe webhook to include `payment_method.attached` event
- [ ] Test checkout flow for each region

### Phase 3: Frontend Rollout
- [x] Updated billing page with regional pricing, interval toggle, currency display
- [ ] Add billing country selector to user settings/onboarding
- [ ] Add region/currency indicator to checkout flow

### Phase 4: Monitoring & Iteration
- [ ] Monitor `BillingRegionAudit` for mismatches between IP and payment country
- [ ] Dashboard for regional revenue breakdown
- [ ] Add Paystack/Flutterwave for African local payment methods (future)
- [ ] Implement Stripe Tax for automatic VAT calculation (future)

---

## Manual QA Steps

1. **Region Detection — Africa**
   - Set `cf-ipcountry: NG` header → GET `/api/pricing` → verify `region: AFRICA`, prices in USD at African rates
2. **Region Detection — Europe**
   - Set `cf-ipcountry: DE` header → GET `/api/pricing` → verify `region: EUROPE`, prices in EUR
3. **Region Detection — ROW fallback**
   - No headers → GET `/api/pricing` → verify `region: ROW`, prices in USD at standard rates
4. **User billing country selection**
   - Authenticate → POST `/api/pricing/billing-country` with `{ "country": "KE" }` → verify region AFRICA persisted
   - GET `/api/pricing/me` → verify region AFRICA, currency USD
5. **Billing country override**
   - Change country from KE to GB → verify region switches to EUROPE, currency to EUR
   - Check `BillingRegionAudit` has entry for the change
6. **Checkout with regional price**
   - Set billing country to NG → POST `/api/billing/checkout` with `{ "plan": "BASIC", "interval": "MONTHLY" }` → verify correct Stripe Price ID used
7. **Entitlements are plan-only**
   - GET `/api/pricing/entitlements/PROFESSIONAL` → verify same features regardless of region query
8. **Grandfathering**
   - Subscribe to BASIC → run grandfathering script → change prices → verify user still on old price
9. **Free plan availability**
   - Verify `/api/pricing` returns all 3 regions with FREE plan available (no price rows, but entitlements present)
10. **Webhook country capture**
    - Simulate `payment_method.attached` webhook with card country DE → verify `UserBillingProfile.stripeCountry` updated
11. **Frontend rendering**
    - Visit `/billing` → verify prices displayed with correct currency symbol and region badge
    - Toggle monthly/yearly → verify prices update
    - Switch between candidate and employer plans
12. **Tax ID for Europe**
    - Set country to DE → POST checkout → verify Stripe session has `tax_id_collection: { enabled: true }`
