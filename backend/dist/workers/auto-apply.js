// ─────────────────────────────────────────────────────────────────────────────
// Auto-Apply Pipeline — Proactive AI agent that generates apply packs
//
// For Professional-tier users who opt in, this worker:
//   1. Picks up high-scoring JobAlerts (score >= threshold)
//   2. Generates tailored resume + cover letter via AI
//   3. Creates an "AI-prepared" application (pending user review)
//   4. Notifies the user that an apply pack is ready
//
// This is the "works while you sleep" feature that differentiates AfriTalent
// from every other Africa-focused job board.
// ─────────────────────────────────────────────────────────────────────────────
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { generateQuickCoverLetter } from "../lib/ai/cover-letter.js";
const AUTO_APPLY_SCORE_THRESHOLD = parseInt(process.env.AUTO_APPLY_SCORE_THRESHOLD || "75", 10);
const MAX_AUTO_APPLIES_PER_CYCLE = parseInt(process.env.MAX_AUTO_APPLIES_PER_CYCLE || "20", 10);
const AUTO_APPLY_INTERVAL_MS = parseInt(process.env.AUTO_APPLY_INTERVAL_MINUTES || "60", 10) * 60 * 1000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const AI_DISABLED = process.env.AI_DISABLED === "1";
export { AUTO_APPLY_INTERVAL_MS };
export async function runAutoApplyCycle() {
    if (AI_DISABLED) {
        logger.debug("[auto-apply] AI disabled, skipping");
        return;
    }
    let generated = 0;
    let skipped = 0;
    let errors = 0;
    // Find professional-tier users who have opted into auto-apply
    // (subscription plan = PROFESSIONAL and status = ACTIVE)
    const eligibleUsers = await prisma.subscription.findMany({
        where: {
            plan: "PROFESSIONAL",
            status: "ACTIVE",
        },
        select: {
            userId: true,
        },
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
    for (const alert of alerts) {
        try {
            // Skip if already applied
            const existingApp = await prisma.application.findFirst({
                where: {
                    jobId: alert.jobId,
                    candidateId: alert.userId,
                },
            });
            if (existingApp) {
                skipped++;
                continue;
            }
            // Get candidate profile
            const profile = await prisma.candidateProfile.findUnique({
                where: { userId: alert.userId },
                include: {
                    resumes: { where: { isActive: true }, take: 1 },
                },
            });
            if (!profile || profile.resumes.length === 0) {
                skipped++;
                continue;
            }
            const companyName = alert.job.employer?.companyName ?? alert.job.sourceName ?? "the company";
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
            await prisma.application.create({
                data: {
                    jobId: alert.jobId,
                    candidateId: alert.userId,
                    cvUrl: profile.resumes[0].s3Key,
                    coverLetter: clResult.coverLetter,
                    notes: `[AI Auto-Applied] Match score: ${alert.matchScore}%. Cover letter source: ${clResult.source}. Review and confirm to finalize.`,
                    status: "PENDING",
                },
            });
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
            logger.info({
                userId: alert.userId.slice(0, 8),
                jobId: alert.jobId.slice(0, 8),
                matchScore: alert.matchScore,
                clSource: clResult.source,
            }, "[auto-apply] application generated");
        }
        catch (err) {
            errors++;
            logger.error({ alertId: alert.id, userId: alert.userId.slice(0, 8), err }, "[auto-apply] failed to generate application");
        }
    }
    logger.info({ generated, skipped, errors, eligibleUsers: eligibleUserIds.size }, "[auto-apply] cycle complete");
}
//# sourceMappingURL=auto-apply.js.map