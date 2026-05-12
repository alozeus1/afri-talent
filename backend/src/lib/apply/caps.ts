// §5.9 — per-candidate apply caps + employer opt-out lookup.
//
// Two enforcement points:
//
//   1. checkApplyCaps(prisma, candidateId, jobId)
//      Runs in POST /api/applications/draft before we create a new row.
//      Enforces two limits per the master prompt:
//
//        a. PER (candidate, job): max 1 application per 60 days.
//           The (jobId, candidateId) unique constraint already prevents true
//           duplicates inside that window; this check catches re-draft after
//           the parent Application was deleted (rare) and surfaces a
//           consistent reason code to the UI.
//
//        b. PER (candidate, employer): max 3 distinct jobs per 30 days.
//           Stops the autopilot from spraying a single employer.
//
//   2. isEmployerOptedOut(prisma, emailDomain)
//      Called by lib/jobs/apply-strategy.ts when the classifier would
//      otherwise return EMAIL_DRAFT. A match downgrades to
//      ASSISTED_REDIRECT.

import { ApplyStrategy, type PrismaClient } from "@prisma/client";

export const APPLY_CAP_PER_JOB_DAYS = parseInt(process.env.APPLY_CAP_PER_JOB_DAYS || "60", 10);
export const APPLY_CAP_PER_EMPLOYER_DAYS = parseInt(process.env.APPLY_CAP_PER_EMPLOYER_DAYS || "30", 10);
export const APPLY_CAP_PER_EMPLOYER_DISTINCT_JOBS = parseInt(
  process.env.APPLY_CAP_PER_EMPLOYER_DISTINCT_JOBS || "3",
  10,
);

// Default opt-out window if the email-handler doesn't set one explicitly.
export const OPT_OUT_DEFAULT_DURATION_MONTHS = 12;

export type CapResult =
  | { ok: true }
  | { ok: false; code: "PER_JOB_CAP" | "PER_EMPLOYER_CAP"; nextAllowedAt?: Date };

export async function checkApplyCaps(
  prisma: PrismaClient,
  candidateId: string,
  jobId: string,
): Promise<CapResult> {
  // Look up the job's employer once; both caps key off employerId.
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, employerId: true },
  });
  if (!job) return { ok: true }; // job-existence check is the route's problem

  const now = new Date();
  const perJobCutoff = new Date(now.getTime() - APPLY_CAP_PER_JOB_DAYS * 86_400_000);

  // ── (a) per (candidate, job) in last 60 days ────────────────────────
  const recentForJob = await prisma.application.findFirst({
    where: {
      candidateId,
      jobId,
      createdAt: { gte: perJobCutoff },
    },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  if (recentForJob) {
    const nextAllowedAt = new Date(recentForJob.createdAt.getTime() + APPLY_CAP_PER_JOB_DAYS * 86_400_000);
    return { ok: false, code: "PER_JOB_CAP", nextAllowedAt };
  }

  // ── (b) per (candidate, employer): ≤ 3 distinct jobs in 30 days ────
  if (!job.employerId) return { ok: true }; // aggregator job — no employer to cap against
  const perEmployerCutoff = new Date(now.getTime() - APPLY_CAP_PER_EMPLOYER_DAYS * 86_400_000);
  const distinctJobs = await prisma.application.findMany({
    where: {
      candidateId,
      createdAt: { gte: perEmployerCutoff },
      job: { employerId: job.employerId },
    },
    select: { jobId: true },
    distinct: ["jobId"],
  });
  if (distinctJobs.length >= APPLY_CAP_PER_EMPLOYER_DISTINCT_JOBS) {
    return { ok: false, code: "PER_EMPLOYER_CAP" };
  }

  return { ok: true };
}

export async function isEmployerOptedOut(
  prisma: PrismaClient,
  emailDomain: string | null | undefined,
): Promise<boolean> {
  if (!emailDomain) return false;
  const normalized = emailDomain.toLowerCase().trim();
  if (!normalized) return false;
  const row = await prisma.employerApplyOptOut.findUnique({
    where: { domain: normalized },
    select: { expiresAt: true },
  });
  if (!row) return false;
  return row.expiresAt.getTime() > Date.now();
}

// Helper used by tests + the admin route — builds the expiresAt date for a
// new opt-out. Default 12 months.
export function defaultOptOutExpiry(now: Date = new Date()): Date {
  const expires = new Date(now);
  expires.setMonth(expires.getMonth() + OPT_OUT_DEFAULT_DURATION_MONTHS);
  return expires;
}

// Extracts the domain part of an apply email so callers don't have to
// duplicate the split logic. Returns null for malformed inputs.
export function emailDomainOf(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase().trim() || null;
}

// Resolve the effective apply strategy after applying the EMAIL_DRAFT
// opt-out. Used by both ingest (so the candidate sees the right CTA) and
// the submit handler (defense in depth for opt-outs filed after ingest).
export interface EffectiveStrategyInput {
  applyStrategy: ApplyStrategy | null | undefined;
  applyEmailDetected: string | null | undefined;
}

export interface EffectiveStrategyResult {
  effective: ApplyStrategy;
  downgradedFromEmailDraft: boolean;
}

export async function resolveEffectiveApplyStrategy(
  prisma: PrismaClient,
  input: EffectiveStrategyInput,
): Promise<EffectiveStrategyResult> {
  const declared = input.applyStrategy ?? ApplyStrategy.ASSISTED_REDIRECT;
  if (declared !== ApplyStrategy.EMAIL_DRAFT) {
    return { effective: declared, downgradedFromEmailDraft: false };
  }
  const domain = emailDomainOf(input.applyEmailDetected);
  if (!domain) {
    // No domain to check — keep the declared strategy.
    return { effective: declared, downgradedFromEmailDraft: false };
  }
  const optedOut = await isEmployerOptedOut(prisma, domain);
  if (optedOut) {
    return { effective: ApplyStrategy.ASSISTED_REDIRECT, downgradedFromEmailDraft: true };
  }
  return { effective: declared, downgradedFromEmailDraft: false };
}
