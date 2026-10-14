// ─────────────────────────────────────────────────────────────────────────────
// Shared apply guard for every path that creates an employer-visible
// Application on a candidate's behalf (quick-apply, autopilot /apply,
// autopilot batch (inline + BullMQ worker) and the auto-apply worker).
//
// It enforces the same checks the manual POST /api/applications path does:
//   - account standing (SUSPENDED → 403, LIMITED → 429)
//   - verified email
//   - job is PUBLISHED and not expired
//   - no existing application for (job, candidate)
//   - checkApplyCaps (1 per job / 60d, 3 distinct jobs per employer / 30d)
//   - a per-user daily cap on AI/automated applications
// and exposes the trust-risk assessment + hold bookkeeping so callers can
// write riskScore/riskLevel/trustFlags (HIGH/CRITICAL rows are hidden from
// employers) and open a trust case exactly like routes/applications.ts.
//
// Usage:
//   const guard = await assertCanSubmitApplication({ userId, jobId });  // throws SubmitGuardError
//   ...generate cover letter...
//   const risk = assessSubmissionRisk(guard, coverLetter);
//   const app = await prisma.application.create({ data: { ..., ...riskFieldsFor(risk) } });
//   await recordSubmissionTrust({ userId, job: guard.job, applicationId: app.id, risk });
// ─────────────────────────────────────────────────────────────────────────────

import { JobStatus, TrustEntityType, TrustRiskLevel, type Job } from "@prisma/client";
import prisma from "../prisma.js";
import { checkApplyCaps } from "./caps.js";
import { assessApplicationRisk, type RiskAssessment } from "../trust/risk.js";
import {
  addTrustCaseAction,
  createTrustCase,
  recordTrustRiskEvent,
  refreshCandidateTrustProfile,
} from "../trust/service.js";

/** Notes prefixes written by the automated/AI apply paths. Used for the daily cap. */
export const AUTOMATED_APPLY_NOTE_PREFIXES = [
  "[Quick Apply]",
  "[AI-Assisted Application]",
  "[Batch Application",
  "[AI Auto-Applied]",
] as const;

export function getAutopilotDailyApplyCap(): number {
  const parsed = parseInt(process.env.AUTOPILOT_DAILY_APPLY_CAP || "20", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

export type SubmitGuardErrorCode =
  | "USER_NOT_FOUND"
  | "ACCOUNT_SUSPENDED"
  | "ACCOUNT_LIMITED"
  | "EMAIL_VERIFICATION_REQUIRED"
  | "JOB_NOT_AVAILABLE"
  | "ALREADY_APPLIED"
  | "APPLY_CAP_PER_JOB"
  | "APPLY_CAP_PER_EMPLOYER"
  | "DAILY_APPLY_CAP";

const HTTP_STATUS: Record<SubmitGuardErrorCode, number> = {
  USER_NOT_FOUND: 404,
  ACCOUNT_SUSPENDED: 403,
  ACCOUNT_LIMITED: 429,
  EMAIL_VERIFICATION_REQUIRED: 403,
  JOB_NOT_AVAILABLE: 404,
  ALREADY_APPLIED: 409,
  APPLY_CAP_PER_JOB: 429,
  APPLY_CAP_PER_EMPLOYER: 429,
  DAILY_APPLY_CAP: 429,
};

export class SubmitGuardError extends Error {
  readonly code: SubmitGuardErrorCode;
  readonly httpStatus: number;
  readonly nextAllowedAt?: Date;

  constructor(code: SubmitGuardErrorCode, message: string, nextAllowedAt?: Date) {
    super(message);
    this.name = "SubmitGuardError";
    this.code = code;
    this.httpStatus = HTTP_STATUS[code];
    this.nextAllowedAt = nextAllowedAt;
  }

  toJSON(): { error: string; code: SubmitGuardErrorCode; nextAllowedAt?: Date } {
    return {
      error: this.message,
      code: this.code,
      ...(this.nextAllowedAt ? { nextAllowedAt: this.nextAllowedAt } : {}),
    };
  }
}

export interface SubmitGuardResult {
  job: Job;
  candidateRiskScore: number;
  applicationsLast24h: number;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Applications created today by the automated/AI apply paths. */
export async function countAutomatedAppliesToday(userId: string): Promise<number> {
  return prisma.application.count({
    where: {
      candidateId: userId,
      createdAt: { gte: startOfToday() },
      OR: AUTOMATED_APPLY_NOTE_PREFIXES.map((prefix) => ({ notes: { startsWith: prefix } })),
    },
  });
}

/**
 * Throws SubmitGuardError when the candidate may not submit an application
 * to this job. On success returns the job plus the inputs needed for the
 * trust-risk assessment.
 */
export async function assertCanSubmitApplication(input: {
  userId: string;
  jobId: string;
  /** Default true. Set false only for paths that are not automated. */
  enforceDailyCap?: boolean;
}): Promise<SubmitGuardResult> {
  const { userId, jobId } = input;
  const enforceDailyCap = input.enforceDailyCap ?? true;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true, accountRestrictionStatus: true, accountRestrictionReason: true },
  });
  if (!user) throw new SubmitGuardError("USER_NOT_FOUND", "User not found");

  if (user.accountRestrictionStatus === "SUSPENDED") {
    throw new SubmitGuardError(
      "ACCOUNT_SUSPENDED",
      user.accountRestrictionReason || "This account is suspended pending trust review.",
    );
  }
  if (user.accountRestrictionStatus === "LIMITED") {
    throw new SubmitGuardError(
      "ACCOUNT_LIMITED",
      user.accountRestrictionReason || "Sensitive actions are temporarily limited pending trust review.",
    );
  }
  if (!user.emailVerified) {
    throw new SubmitGuardError("EMAIL_VERIFICATION_REQUIRED", "Email verification required for this action.");
  }

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || job.status !== JobStatus.PUBLISHED || job.isExpired) {
    throw new SubmitGuardError("JOB_NOT_AVAILABLE", "Job not found or not available");
  }

  const existing = await prisma.application.findFirst({
    where: { jobId, candidateId: userId },
    select: { id: true },
  });
  if (existing) throw new SubmitGuardError("ALREADY_APPLIED", "You have already applied to this job");

  const cap = await checkApplyCaps(prisma, userId, jobId);
  if (!cap.ok) {
    if (cap.code === "PER_JOB_CAP") {
      throw new SubmitGuardError("APPLY_CAP_PER_JOB", "You have already applied to this role recently.", cap.nextAllowedAt);
    }
    throw new SubmitGuardError(
      "APPLY_CAP_PER_EMPLOYER",
      "You have reached the per-employer apply cap for the last 30 days.",
      cap.nextAllowedAt,
    );
  }

  if (enforceDailyCap) {
    const limit = getAutopilotDailyApplyCap();
    const today = await countAutomatedAppliesToday(userId);
    if (today >= limit) {
      throw new SubmitGuardError(
        "DAILY_APPLY_CAP",
        `You have reached the daily limit of ${limit} assisted applications. Try again tomorrow.`,
      );
    }
  }

  const [trustProfile, applicationsLast24h] = await Promise.all([
    refreshCandidateTrustProfile(userId),
    prisma.application.count({
      where: { candidateId: userId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
  ]);

  return { job, candidateRiskScore: trustProfile.riskScore, applicationsLast24h };
}

export interface SubmissionRisk extends RiskAssessment {
  heldForReview: boolean;
}

/** Same assessment + hold rule as routes/applications.ts. */
export function assessSubmissionRisk(guard: SubmitGuardResult, coverLetter?: string | null): SubmissionRisk {
  const risk = assessApplicationRisk({
    coverLetter: coverLetter ?? null,
    applicationsLast24h: guard.applicationsLast24h,
    candidateRiskScore: guard.candidateRiskScore,
  });
  const heldForReview =
    risk.autoHold || risk.level === TrustRiskLevel.HIGH || risk.level === TrustRiskLevel.CRITICAL;
  return { ...risk, heldForReview };
}

/** Fields to spread into prisma.application.create({ data }). */
export function riskFieldsFor(risk: SubmissionRisk): {
  riskScore: number;
  riskLevel: TrustRiskLevel;
  trustFlags: string[];
} {
  return { riskScore: risk.score, riskLevel: risk.level, trustFlags: risk.flags };
}

/**
 * Trust bookkeeping after the Application row exists, mirroring
 * routes/applications.ts: a risk event when score > 0 and a HOLD trust case
 * when the application is held for review.
 */
export async function recordSubmissionTrust(input: {
  userId: string;
  job: Pick<Job, "id" | "title" | "employerId">;
  applicationId: string;
  risk: SubmissionRisk;
}): Promise<void> {
  const { userId, job, applicationId, risk } = input;

  if (risk.score > 0) {
    await recordTrustRiskEvent({
      entityType: TrustEntityType.APPLICATION,
      reasonCode: "application_risk_assessment",
      summary: `Application for "${job.title}" triggered trust checks.`,
      scoreDelta: risk.score,
      resultingScore: risk.score,
      riskLevel: risk.level,
      userId,
      employerId: job.employerId ?? null,
      jobId: job.id,
      applicationId,
      evidence: { flags: risk.flags },
      autoHeld: risk.heldForReview,
    });
  }

  if (risk.heldForReview) {
    const trustCase = await createTrustCase({
      entityType: TrustEntityType.APPLICATION,
      priority: risk.level,
      title: `Application review required for ${job.title}`,
      reasonCode: "application_auto_hold",
      summary: `Application held because of ${risk.flags.join(", ") || "elevated candidate risk"}.`,
      applicationId,
    });

    await addTrustCaseAction({
      caseId: trustCase.id,
      actorId: userId,
      actionType: "HOLD",
      reasonCode: "application_auto_hold",
      notes: "Application automatically held for trust review before employer visibility.",
      metadata: { flags: risk.flags },
    });
  }
}
