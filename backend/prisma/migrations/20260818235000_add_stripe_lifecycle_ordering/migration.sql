-- Durable per-subscription ordering markers for Stripe lifecycle webhooks.
-- Nullable by design: existing subscriptions retain no fabricated history and
-- establish their baseline when the first valid lifecycle event arrives.
ALTER TABLE "Subscription"
  ADD COLUMN "stripeLifecycleOccurredAt" TIMESTAMP(3),
  ADD COLUMN "stripeLifecyclePriority" INTEGER,
  ADD COLUMN "stripeLifecycleEventId" VARCHAR(255);

CREATE INDEX "Subscription_stripeSubId_stripeLifecycleOccurredAt_idx"
  ON "Subscription"("stripeSubId", "stripeLifecycleOccurredAt");
