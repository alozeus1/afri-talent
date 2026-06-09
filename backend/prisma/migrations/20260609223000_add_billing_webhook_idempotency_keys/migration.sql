-- Durable idempotency reservations for Stripe and Flutterwave webhook events.
-- Redis can cache these keys, but PostgreSQL is the source of truth across
-- process restarts, Lambda cold starts, and multi-instance delivery.
CREATE TABLE "BillingWebhookIdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(320) NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "eventId" VARCHAR(255) NOT NULL,
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "BillingWebhookIdempotencyKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingWebhookIdempotencyKey_key_key" ON "BillingWebhookIdempotencyKey"("key");
CREATE INDEX "BillingWebhookIdempotencyKey_provider_reservedAt_idx" ON "BillingWebhookIdempotencyKey"("provider", "reservedAt" DESC);
CREATE INDEX "BillingWebhookIdempotencyKey_expiresAt_idx" ON "BillingWebhookIdempotencyKey"("expiresAt");
