-- CreateEnum
CREATE TYPE "BillingProvider" AS ENUM ('STRIPE', 'FLUTTERWAVE', 'PAYPAL');

-- AlterTable
ALTER TABLE "Subscription"
ADD COLUMN "billingProvider" "BillingProvider",
ADD COLUMN "providerCustomerId" VARCHAR(255),
ADD COLUMN "providerSubscriptionId" VARCHAR(255);

-- CreateIndex
CREATE INDEX "Subscription_billingProvider_idx" ON "Subscription"("billingProvider");

-- CreateIndex
CREATE INDEX "Subscription_providerCustomerId_idx" ON "Subscription"("providerCustomerId");

-- CreateIndex
CREATE INDEX "Subscription_providerSubscriptionId_idx" ON "Subscription"("providerSubscriptionId");
