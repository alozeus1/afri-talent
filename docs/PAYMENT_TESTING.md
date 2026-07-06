# Payment Testing Guide (Stripe + Flutterwave)

How to connect the backend to Stripe/Flutterwave in **test/sandbox mode** and run payment
tests locally. Everything here is test-mode only — no real money moves.

> **Never commit real secret keys.** Keys live in `backend/.env` (gitignored). Only ever use
> `sk_test_…` / sandbox keys locally. If a live key (`sk_live_…`) is ever exposed, rotate it
> immediately in the dashboard.

---

## 1. Test card numbers

These are fixed, published numbers that **only work in test/sandbox mode**. You don't generate
them — you just type them into the checkout form.

### Stripe
Use **any future expiry**, **any 3-digit CVC**, and **any postal/ZIP code**.

| Card number | Result |
|---|---|
| `4242 4242 4242 4242` | ✅ Payment succeeds |
| `4000 0025 0000 3155` | 🔐 Requires 3D-Secure ("verify it's you") |
| `4000 0000 0000 0002` | ❌ Generic decline |
| `4000 0000 0000 9995` | ❌ Decline — insufficient funds |
| `4000 0000 0000 9987` | ❌ Decline — lost card |
| `4000 0000 0000 0069` | ❌ Decline — expired card |

Full list: https://docs.stripe.com/testing

### Flutterwave (sandbox)
When prompted, use **PIN `3310`** and **OTP `12345`**; expiry any future date.

| Card number | Type | CVV |
|---|---|---|
| `5531 8866 5214 6950` | Mastercard ✅ | `564` |
| `4187 4274 1556 4246` | Visa ✅ | `828` |
| `5840 4062 5099 3823` | Mastercard (3DS/OTP) | `170` |

Full list: https://developer.flutterwave.com/docs/test-cards

---

## 2. Connect the backend to Stripe

The backend reads these env vars from `backend/.env` (see `ENV_MATRIX.md` for the full list):

| Env var | What it is | Where to get it |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` secret key | Dashboard → **Test mode ON** → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` signing secret | Printed by `stripe listen` (see below) |
| `STRIPE_PRICE_BASIC_MONTHLY` | Price ID for Basic | Created in step 3 |
| `STRIPE_PRICE_PROFESSIONAL_MONTHLY` | Price ID for Professional | Created in step 3 |
| `STRIPE_PRICE_EMPLOYER_BASIC_MONTHLY` | Price ID for Employer Basic | Created in step 3 |
| `STRIPE_PRICE_EMPLOYER_PREMIUM_MONTHLY` | Price ID for Employer Premium | Created in step 3 |

The app resolves the price at checkout as: regional catalog price (`STRIPE_PRICE_CATALOG_JSON`)
→ falls back to the per-plan `STRIPE_PRICE_*_MONTHLY` above.

### Local webhooks (the important part)

Stripe delivers events (payment succeeded, subscription updated, etc.) to a URL. Locally, the
Stripe CLI forwards them to your machine and prints the signing secret:

```bash
# In a dedicated terminal, leave this running while testing:
stripe listen --forward-to localhost:4000/api/webhooks/stripe
# It prints:  "Your webhook signing secret is whsec_xxx"
# Put that value in backend/.env as STRIPE_WEBHOOK_SECRET, then restart the backend.
```

You can also trigger events without a real payment:
```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
```

---

## 3. Create the Stripe plans (via CLI)

Four recurring monthly USD test prices (amounts mirror `default-price-catalog.ts`, ROW/USD):

```bash
KEY=sk_test_...        # your test secret key
mkprice(){ stripe prices create --api-key "$KEY" \
  -d "unit_amount=$2" -d "currency=usd" -d "recurring[interval]=month" \
  -d "product_data[name]=$1" -d "metadata[plan]=$3" -d "lookup_key=afritalent_${3}_monthly_usd"; }

mkprice "AfriTalent Basic"             999   BASIC
mkprice "AfriTalent Professional"      2499  PROFESSIONAL
mkprice "AfriTalent Employer Basic"    9999  EMPLOYER_BASIC
mkprice "AfriTalent Employer Premium"  29999 EMPLOYER_PREMIUM
```

Copy each returned `id` (starts with `price_…`) into the matching `STRIPE_PRICE_*_MONTHLY` var.

**Already created in this account (test mode):**

| Plan | Amount | Price ID |
|---|---|---|
| Basic | $9.99/mo | `price_1Tq0DXIVndXzaBq66U8Id8xy` |
| Professional | $24.99/mo | `price_1Tq0DXIVndXzaBq6X815tf2f` |
| Employer Basic | $99.99/mo | `price_1Tq0DYIVndXzaBq60fQOWG6Y` |
| Employer Premium | $299.99/mo | `price_1Tq0DYIVndXzaBq6TM0ZuLLs` |

---

## 4. Connect the backend to Flutterwave

| Env var | What it is | Where to get it |
|---|---|---|
| `FLUTTERWAVE_SECRET_KEY` | `FLWSECK_TEST-…` | Flutterwave dashboard → Settings → API keys (sandbox) |
| `FLUTTERWAVE_PUBLIC_KEY` | `FLWPUBK_TEST-…` | same page |
| `FLUTTERWAVE_SECRET_HASH` | any string **you choose** | set the SAME value in dashboard → Settings → Webhooks |
| `FLUTTERWAVE_PLAN_CATALOG_JSON` | plan → price map | see `provider-catalog.ts` (keys `PLAN:REGION:INTERVAL:CURRENCY`) |

Flutterwave calls your webhook from the internet, so locally you need a public tunnel:
```bash
ngrok http 4000
# Put the https URL + /api/webhooks/flutterwave into the Flutterwave dashboard webhook settings,
# and set FLUTTERWAVE_SECRET_HASH to the same "secret hash" value you enter there.
```

> The webhook fails **closed**: if `FLUTTERWAVE_SECRET_HASH` is unset, every webhook is rejected
> (503). That's intentional — never process an unauthenticated payment notification.

---

## 5. Run a local end-to-end test

```bash
# Terminal 1 — backend (MOCK_AI=1 avoids burning AI credits)
cd backend && MOCK_AI=1 PORT=4000 npx tsx --import ./src/instrument.ts src/server.ts

# Terminal 2 — forward Stripe webhooks
stripe listen --forward-to localhost:4000/api/webhooks/stripe

# Terminal 3 — frontend
cd frontend && npm run dev
```

Then: sign up → verify email → go to pricing → subscribe with `4242 4242 4242 4242` →
confirm the plan activates. Watch Terminal 2 for the `checkout.session.completed` event.

---

## Notes

- `backend/.env` is gitignored — safe for keys. `ENV_MATRIX.md` documents all env vars.
- Local dev DB may be behind on migrations and lacks `pgvector`; job-matching routes can 500
  locally as a result (environment artifact, not a product bug). See the runbook for full setup.
- Production keys are managed via AWS SSM/Terraform, never in `.env`.
