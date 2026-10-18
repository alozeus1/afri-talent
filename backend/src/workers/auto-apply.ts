// ─────────────────────────────────────────────────────────────────────────────
// Auto-Apply Pipeline — Proactive AI agent that generates apply packs
//
// OFF by default: does nothing unless AUTO_APPLY_ENABLED=1.
// Eligibility is explicit opt-in only (CandidateAutopilotProfile.
// autoApplyEnabled === true). It is never derived from plan or free mode.
// For opted-in users, this worker:
//   1. Picks up high-scoring JobAlerts (score >= threshold)
//   2. Generates tailored resume + cover letter via AI
//   3. Creates an "AI-prepared" application (pending user review)
//   4. Notifies the user that an apply pack is ready
//
// This is the "works while you sleep" feature that differentiates AfriTalent
// from every other Africa-focused job board.
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { generateQuickCoverLetter } from "../lib/ai/cover-letter.js";
import { isGraphEnabled } from "../lib/ai/langgraph/index.js";
import { evaluateAutopilotGate } from "../lib/ai/langgraph/integration/candidateAutopilotAdapter.js";
import {
  SubmitGuardError,
  assertCanSubmitApplication,
  assessSubmissionRisk,
  recordSubmissionTrust,
  riskFieldsFor,
} from "../lib/apply/submit-guard.js";

const AUTO_APPLY_SCORE_THRESHOLD = parseInt(process.env.AUTO_APPLY_SCORE_THRESHOLD || "75", 10);
const MAX_AUTO_APPLIES_PER_CYCLE = parseInt(process.env.MAX_AUTO_APPLIES_PER_CYCLE || "20", 10);
// Employer-trust guardrail: at most N AI-prepared applications per candidate
// per day, regardless of how many high-scoring alerts exist.
const AUTO_APPLY_DAILY_USER_CAP = parseInt(process.env.AUTO_APPLY_DAILY_USER_CAP || "5", 10);
const AUTO_APPLY_INTERVAL_MS = parseInt(process.env.AUTO_APPLY_INTERVAL_MINUTES || "60", 10) * 60 * 1000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const AI_DISABLED = process.env.AI_DISABLED === "1";

export { AUTO_APPLY_INTERVAL_MS };

/** Env kill switch. Default off: the worker does nothing unless AUTO_APPLY_ENABLED=1. */
export function isAutoApplyEnabled(): boolean {
  return process.env.AUTO_APPLY_ENABLED === "1";
}

export async function runAutoApplyCycle(): Promise<void> {
  if (!isAutoApplyEnabled()) {
    logger.debug("[auto-apply] disabled (AUTO_APPLY_ENABLED != 1), skipping");
    return;
  }
  if (AI_DISABLED) {
    logger.debug("[auto-apply] AI disabled, skipping");
    return;
  }

  let generated = 0;
  let skipped = 0;
  let errors = 0;

  // Explicit opt-in only: users who turned auto-apply on in their autopilot
  // settings. Read regardless of the LangGraph flag, never from plan/free mode.
  const eligibleUsers = await prisma.candidateAutopilotProfile.findMany({
    where: { autoApplyEnabled: true },
    select: { userId: true },
  });

  const eligibleUserIds = new Set(eligibleUsers.map((u) => u.userId));
  if (eligibleUserIds.size === 0) {
    logger.debug("[auto-apply] no eligible users");
    return;
  }

  // Find high-scoring alerts that haven't been auto-applied yet
  const alerts = await prisma.jobAlert.findMany({
    where: {
      userId: { in: Array.from(eligibleUserIds) },
      matchScore: { gte: AUTO_APPLY_SCORE_THRESHOLD },
      sentAt: { not: null }, // only process alerts that have been notified
      clickedAt: null, // user hasn't manually acted on it
      job: { status: "PUBLISHED", isExpired: false },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      job: {
        select: {
          id: true,
          title: true,
          slug: true,
          description: true,
          location: true,
          visaSponsorship: true,
          sourceName: true,
          employerId: true,
          employer: { select: { companyName: true } },
        },
      },
    },
    orderBy: { matchScore: "desc" },
    take: MAX_AUTO_APPLIES_PER_CYCLE,
  });

  // Rollout: optional LangGraph autopilot safety gate (per user, cached per
  // cycle). Flag off → not consulted, behavior unchanged. When on, opted-out /
  // unentitled / high-risk / incomplete-profile users are skipped before any pack
  // is prepared. Generation below is untouched.
  const autopilotGateEnabled = isGraphEnabled("candidate_autopilot");
  const gateCache = new Map<string, boolean>();
  // Per-user daily counter (seeded from DB once per user per cycle)
  const dailyCountCache = new Map<string, number>();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  for (const alert of alerts) {
    try {
      if (autopilotGateEnabled) {
        let allowed = gateCache.get(alert.userId);
        if (allowed === undefined) {
          const gate = await evaluateAutopilotGate(alert.userId);
          allowed = gate.allowed;
          gateCache.set(alert.userId, allowed);
          if (!allowed) {
            logger.info({ userId: alert.userId.slice(0, 8), reason: gate.reason }, "[auto-apply] autopilot gate blocked user");
          }
        }
        if (!allowed) {
          skipped++;
          continue;
        }
      }

      // Shared apply guard — the same checks the manual apply path enforces:
      // job published + not expired, dedupe, apply caps (1 per job / 60d,
      // 3 jobs per employer / 30d), daily cap, verified email, account
      // standing. Runs before any AI spend.
      let guard;
      try {
        guard = await assertCanSubmitApplication({ userId: alert.userId, jobId: alert.jobId });
      } catch (guardErr) {
        if (!(guardErr instanceof SubmitGuardError)) throw guardErr;
        logger.debug(
          { userId: alert.userId.slice(0, 8), code: guardErr.code },
          "[auto-apply] apply guard rejected — skipping alert",
        );
        skipped++;
        continue;
      }

      // Per-user daily volume cap
      let dailyCount = dailyCountCache.get(alert.userId);
      if (dailyCount === undefined) {
        dailyCount = await prisma.application.count({
          where: {
            candidateId: alert.userId,
            createdAt: { gte: todayStart },
            notes: { startsWith: "[AI Auto-Applied]" },
          },
        });
      }
      if (dailyCount >= AUTO_APPLY_DAILY_USER_CAP) {
        dailyCountCache.set(alert.userId, dailyCount);
        skipped++;
        continue;
      }
      dailyCountCache.set(alert.userId, dailyCount + 1);

      // Get candidate profile
      const profile = await prisma.candidateProfile.findUnique({
        where: { userId: alert.userId },
        include: {
          resumes: { where: { isActive: true, securityStatus: "CLEAN" }, take: 1 },
        },
      });

      if (!profile || profile.resumes.length === 0) {
        skipped++;
        continue;
      }

      const companyName =
        alert.job.employer?.companyName ?? alert.job.sourceName ?? "the company";

      // Generate AI cover letter
      const clResult = await generateQuickCoverLetter({
        candidateName: alert.user.name,
        headline: profile.headline,
        skills: profile.skills,
        bio: profile.bio,
        yearsExperience: profile.yearsExperience,
        jobTitle: alert.job.title,
        companyName,
        jobDescription: alert.job.description,
      });

      // Create application in PENDING status (user reviews before finalizing)
      const risk = assessSubmissionRisk(guard, clResult.coverLetter);
      const created = await prisma.application.create({
        data: {
          jobId: alert.jobId,
          candidateId: alert.userId,
          cvUrl: profile.resumes[0].s3Key,
          coverLetter: clResult.coverLetter,
          notes: `[AI Auto-Applied] Match score: ${alert.matchScore}%. Cover letter source: ${clResult.source}. Review and confirm to finalize.`,
          status: "PENDING",
          ...riskFieldsFor(risk),
        },
      });
      await recordSubmissionTrust({ userId: alert.userId, job: guard.job, applicationId: created.id, risk });

      // Notify user that an apply pack is ready
      await prisma.notification.create({
        data: {
          userId: alert.userId,
          type: "APPLICATION_STATUS",
          title: `AI applied to: ${alert.job.title}`,
          body: `Your AI assistant prepared an application for ${alert.job.title} at ${companyName} (${alert.matchScore}% match). Review your tailored cover letter and confirm.`,
          metadata: {
            jobId: alert.jobId,
            jobSlug: alert.job.slug,
            matchScore: alert.matchScore,
            autoApplied: true,
          },
        },
      });

      // Mark the alert as acted upon
      await prisma.jobAlert.update({
        where: { id: alert.id },
        data: { clickedAt: new Date() },
      });

      generated++;
      logger.info(
        {
          userId: alert.userId.slice(0, 8),
          jobId: alert.jobId.slice(0, 8),
          matchScore: alert.matchScore,
          clSource: clResult.source,
        },
        "[auto-apply] application generated"
      );
    } catch (err) {
      errors++;
      logger.error(
        { alertId: alert.id, userId: alert.userId.slice(0, 8), err },
        "[auto-apply] failed to generate application"
      );
    }
  }

  logger.info(
    { generated, skipped, errors, eligibleUsers: eligibleUserIds.size },
    "[auto-apply] cycle complete"
  );
}
