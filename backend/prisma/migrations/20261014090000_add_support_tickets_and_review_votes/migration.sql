-- Additive only: customer-support tickets (+ replies), per-user helpful-vote
-- dedupe for company reviews, review moderation timestamps, and a
-- SUPPORT_REPLY notification type. No drops, renames or data rewrites.

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "SupportTicketTopic" AS ENUM ('GENERAL', 'ACCOUNT', 'JOBS', 'EMPLOYER', 'TRUST_SAFETY', 'TECHNICAL', 'FEEDBACK', 'PARTNERSHIP', 'PRIVACY', 'OTHER');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SUPPORT_REPLY';

-- AlterTable
ALTER TABLE "CompanyReview" ADD COLUMN     "moderatedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CompanyReviewHelpfulVote" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyReviewHelpfulVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "reference" VARCHAR(20) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "topic" "SupportTicketTopic" NOT NULL DEFAULT 'GENERAL',
    "subject" VARCHAR(200),
    "message" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
    "userId" TEXT,
    "userRole" VARCHAR(20),
    "assigneeId" TEXT,
    "internalNotes" TEXT,
    "locale" VARCHAR(10),
    "pageUrl" VARCHAR(500),
    "userAgent" VARCHAR(500),
    "firstResponseAt" TIMESTAMP(3),
    "lastReplyAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketReply" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyReviewHelpfulVote_reviewId_idx" ON "CompanyReviewHelpfulVote"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyReviewHelpfulVote_userId_reviewId_key" ON "CompanyReviewHelpfulVote"("userId", "reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_reference_key" ON "SupportTicket"("reference");

-- CreateIndex
CREATE INDEX "SupportTicket_status_createdAt_idx" ON "SupportTicket"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SupportTicket_priority_idx" ON "SupportTicket"("priority");

-- CreateIndex
CREATE INDEX "SupportTicket_topic_idx" ON "SupportTicket"("topic");

-- CreateIndex
CREATE INDEX "SupportTicket_assigneeId_idx" ON "SupportTicket"("assigneeId");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId");

-- CreateIndex
CREATE INDEX "SupportTicket_email_idx" ON "SupportTicket"("email");

-- CreateIndex
CREATE INDEX "SupportTicketReply_ticketId_createdAt_idx" ON "SupportTicketReply"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "CompanyReviewHelpfulVote" ADD CONSTRAINT "CompanyReviewHelpfulVote_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "CompanyReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyReviewHelpfulVote" ADD CONSTRAINT "CompanyReviewHelpfulVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketReply" ADD CONSTRAINT "SupportTicketReply_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketReply" ADD CONSTRAINT "SupportTicketReply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
