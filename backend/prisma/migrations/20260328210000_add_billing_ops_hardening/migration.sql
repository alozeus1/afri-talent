-- Billing ops hardening: audit trail, entitlement sync, reconciliation, and support actions

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingEventOutcome') THEN
    CREATE TYPE "BillingEventOutcome" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'DUPLICATE', 'RECONCILED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingDiscrepancyType') THEN
    CREATE TYPE "BillingDiscrepancyType" AS ENUM (
      'WEBHOOK_FAILURE',
      'SUBSCRIPTION_STATE_MISMATCH',
      'PLAN_MISMATCH',
      'UNPAID_BUT_ENTITLED',
      'PAID_BUT_NOT_ENTITLED',
      'PENDING_REFUND',
      'REGION_MISMATCH',
      'STALE_ENTITLEMENT',
      'PAYMENT_FAILURE'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingDiscrepancyStatus') THEN
    CREATE TYPE "BillingDiscrepancyStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingSupportActionType') THEN
    CREATE TYPE "BillingSupportActionType" AS ENUM (
      'NOTE',
      'RESYNC_ENTITLEMENTS',
      'RESEND_RECEIPT',
      'REFUND_REVIEW',
      'CANCEL_SUBSCRIPTION',
      'UPGRADE_DOWNGRADE_CORRECTION',
      'GRANDFATHER_OVERRIDE'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingReconciliationStatus') THEN
    CREATE TYPE "BillingReconciliationStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "BillingEntitlementState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "effectivePlan" "SubscriptionPlan" NOT NULL,
  "effectiveStatus" "SubscriptionStatus" NOT NULL,
  "billingRegion" "BillingRegion",
  "currency" VARCHAR(3),
  "pricingVersion" INTEGER,
  "entitlements" JSONB NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "isInSync" BOOLEAN NOT NULL DEFAULT true,
  "mismatchReason" VARCHAR(160),
  "source" VARCHAR(50) NOT NULL DEFAULT 'system',
  "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastValidatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingEntitlementState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BillingEntitlementState_userId_key"
  ON "BillingEntitlementState"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "BillingEntitlementState_subscriptionId_key"
  ON "BillingEntitlementState"("subscriptionId");
CREATE INDEX IF NOT EXISTS "BillingEntitlementState_userId_lastSyncedAt_idx"
  ON "BillingEntitlementState"("userId", "lastSyncedAt" DESC);
CREATE INDEX IF NOT EXISTS "BillingEntitlementState_isInSync_lastValidatedAt_idx"
  ON "BillingEntitlementState"("isInSync", "lastValidatedAt" DESC);

CREATE TABLE IF NOT EXISTS "BillingEventAudit" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "subscriptionId" TEXT,
  "eventId" VARCHAR(255),
  "source" VARCHAR(40) NOT NULL,
  "eventType" VARCHAR(120) NOT NULL,
  "outcome" "BillingEventOutcome" NOT NULL DEFAULT 'RECEIVED',
  "plan" "SubscriptionPlan",
  "status" "SubscriptionStatus",
  "billingRegion" "BillingRegion",
  "currency" VARCHAR(3),
  "amountMinor" INTEGER,
  "stripeCustomerId" VARCHAR(255),
  "stripeSubscriptionId" VARCHAR(255),
  "stripeInvoiceId" VARCHAR(255),
  "stripePaymentIntentId" VARCHAR(255),
  "stripeChargeId" VARCHAR(255),
  "stripeRefundId" VARCHAR(255),
  "reasonCode" VARCHAR(120),
  "message" VARCHAR(500),
  "metadata" JSONB,
  "rawPayload" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingEventAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BillingEventAudit_eventId_idx" ON "BillingEventAudit"("eventId");
CREATE INDEX IF NOT EXISTS "BillingEventAudit_source_eventType_createdAt_idx"
  ON "BillingEventAudit"("source", "eventType", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "BillingEventAudit_userId_createdAt_idx"
  ON "BillingEventAudit"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "BillingEventAudit_subscriptionId_createdAt_idx"
  ON "BillingEventAudit"("subscriptionId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "BillingEventAudit_outcome_createdAt_idx"
  ON "BillingEventAudit"("outcome", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "BillingEventAudit_stripeInvoiceId_idx"
  ON "BillingEventAudit"("stripeInvoiceId");
CREATE INDEX IF NOT EXISTS "BillingEventAudit_stripePaymentIntentId_idx"
  ON "BillingEventAudit"("stripePaymentIntentId");
CREATE INDEX IF NOT EXISTS "BillingEventAudit_stripeRefundId_idx"
  ON "BillingEventAudit"("stripeRefundId");

CREATE TABLE IF NOT EXISTS "BillingReconciliationRun" (
  "id" TEXT NOT NULL,
  "status" "BillingReconciliationStatus" NOT NULL DEFAULT 'SUCCESS',
  "triggeredBy" VARCHAR(50) NOT NULL DEFAULT 'scheduler',
  "checkedSubscriptions" INTEGER NOT NULL DEFAULT 0,
  "successPayments" INTEGER NOT NULL DEFAULT 0,
  "failedPayments" INTEGER NOT NULL DEFAULT 0,
  "webhookFailures" INTEGER NOT NULL DEFAULT 0,
  "subscriptionMismatches" INTEGER NOT NULL DEFAULT 0,
  "unpaidEntitlements" INTEGER NOT NULL DEFAULT 0,
  "paidNotEntitled" INTEGER NOT NULL DEFAULT 0,
  "pendingRefunds" INTEGER NOT NULL DEFAULT 0,
  "summary" JSONB,
  "errorMessage" VARCHAR(500),
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingReconciliationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BillingReconciliationRun_status_startedAt_idx"
  ON "BillingReconciliationRun"("status", "startedAt" DESC);

CREATE TABLE IF NOT EXISTS "BillingDiscrepancy" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "subscriptionId" TEXT,
  "billingEventId" TEXT,
  "reconciliationRunId" TEXT,
  "type" "BillingDiscrepancyType" NOT NULL,
  "status" "BillingDiscrepancyStatus" NOT NULL DEFAULT 'OPEN',
  "severity" VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  "title" VARCHAR(160) NOT NULL,
  "reasonCode" VARCHAR(120),
  "details" JSONB,
  "dueAt" TIMESTAMP(3),
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingDiscrepancy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BillingDiscrepancy_status_type_detectedAt_idx"
  ON "BillingDiscrepancy"("status", "type", "detectedAt" DESC);
CREATE INDEX IF NOT EXISTS "BillingDiscrepancy_userId_status_detectedAt_idx"
  ON "BillingDiscrepancy"("userId", "status", "detectedAt" DESC);
CREATE INDEX IF NOT EXISTS "BillingDiscrepancy_subscriptionId_status_detectedAt_idx"
  ON "BillingDiscrepancy"("subscriptionId", "status", "detectedAt" DESC);

CREATE TABLE IF NOT EXISTS "BillingSupportAction" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "billingEventId" TEXT,
  "discrepancyId" TEXT,
  "actionType" "BillingSupportActionType" NOT NULL,
  "reasonCode" VARCHAR(120) NOT NULL,
  "notes" VARCHAR(2000),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingSupportAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BillingSupportAction_userId_createdAt_idx"
  ON "BillingSupportAction"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "BillingSupportAction_actorId_createdAt_idx"
  ON "BillingSupportAction"("actorId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "BillingSupportAction_actionType_createdAt_idx"
  ON "BillingSupportAction"("actionType", "createdAt" DESC);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'BillingEntitlementState_userId_fkey'
  ) THEN
    ALTER TABLE "BillingEntitlementState"
      ADD CONSTRAINT "BillingEntitlementState_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'BillingEntitlementState_subscriptionId_fkey'
  ) THEN
    ALTER TABLE "BillingEntitlementState"
      ADD CONSTRAINT "BillingEntitlementState_subscriptionId_fkey"
      FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'BillingEventAudit_userId_fkey'
  ) THEN
    ALTER TABLE "BillingEventAudit"
      ADD CONSTRAINT "BillingEventAudit_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'BillingEventAudit_subscriptionId_fkey'
  ) THEN
    ALTER TABLE "BillingEventAudit"
      ADD CONSTRAINT "BillingEventAudit_subscriptionId_fkey"
      FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'BillingDiscrepancy_userId_fkey'
  ) THEN
    ALTER TABLE "BillingDiscrepancy"
      ADD CONSTRAINT "BillingDiscrepancy_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'BillingDiscrepancy_subscriptionId_fkey'
  ) THEN
    ALTER TABLE "BillingDiscrepancy"
      ADD CONSTRAINT "BillingDiscrepancy_subscriptionId_fkey"
      FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'BillingDiscrepancy_billingEventId_fkey'
  ) THEN
    ALTER TABLE "BillingDiscrepancy"
      ADD CONSTRAINT "BillingDiscrepancy_billingEventId_fkey"
      FOREIGN KEY ("billingEventId") REFERENCES "BillingEventAudit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'BillingDiscrepancy_reconciliationRunId_fkey'
  ) THEN
    ALTER TABLE "BillingDiscrepancy"
      ADD CONSTRAINT "BillingDiscrepancy_reconciliationRunId_fkey"
      FOREIGN KEY ("reconciliationRunId") REFERENCES "BillingReconciliationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'BillingSupportAction_actorId_fkey'
  ) THEN
    ALTER TABLE "BillingSupportAction"
      ADD CONSTRAINT "BillingSupportAction_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'BillingSupportAction_userId_fkey'
  ) THEN
    ALTER TABLE "BillingSupportAction"
      ADD CONSTRAINT "BillingSupportAction_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'BillingSupportAction_subscriptionId_fkey'
  ) THEN
    ALTER TABLE "BillingSupportAction"
      ADD CONSTRAINT "BillingSupportAction_subscriptionId_fkey"
      FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'BillingSupportAction_billingEventId_fkey'
  ) THEN
    ALTER TABLE "BillingSupportAction"
      ADD CONSTRAINT "BillingSupportAction_billingEventId_fkey"
      FOREIGN KEY ("billingEventId") REFERENCES "BillingEventAudit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'BillingSupportAction_discrepancyId_fkey'
  ) THEN
    ALTER TABLE "BillingSupportAction"
      ADD CONSTRAINT "BillingSupportAction_discrepancyId_fkey"
      FOREIGN KEY ("discrepancyId") REFERENCES "BillingDiscrepancy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
