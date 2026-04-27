// ─────────────────────────────────────────────────────────────────────────────
// Autopilot API — user-facing candidate automation framework
//
// GET  /api/autopilot/status         — overview of the agent system
// GET  /api/autopilot/matches        — AI-scored job matches for the user
// POST /api/autopilot/settings       — update automation settings
// GET  /api/autopilot/pipeline       — resume versions + task queue snapshot
// POST /api/autopilot/resume-builder — synthesize a profile-based resume version
// POST /api/autopilot/follow-up/:applicationId
// POST /api/autopilot/interview-prep/:applicationId
// POST /api/autopilot/apply          — trigger on-demand apply pack for a job
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { CandidateAgentTaskStatus, CandidateAgentTaskType, CandidateAutomationLevel, Role, SubscriptionPlan, } from "@prisma/client";
import { generateQuickCoverLetter } from "../lib/ai/cover-letter.js";
import { getUserEntitlements } from "../lib/billing/entitlements.js";
import { buildFollowUpDraft, buildInterviewPrepPack, buildResumeVersion, buildTaskTitle, ensureCandidateAutopilotProfile, getCandidatePipelineSnapshot, queueCandidateAgentTask, } from "../lib/autopilot/framework.js";
const router = Router();
const applySchema = z.object({
    jobId: z.string().uuid(),
});
const settingsSchema = z.object({
    enabled: z.boolean().optional(),
    automationLevel: z.nativeEnum(CandidateAutomationLevel).optional(),
    minimumMatchScore: z.number().int().min(50).max(95).optional(),
    resumeBuilderEnabled: z.boolean().optional(),
    autoApplyEnabled: z.boolean().optional(),
    followUpEnabled: z.boolean().optional(),
    interviewPrepEnabled: z.boolean().optional(),
    schedulingEnabled: z.boolean().optional(),
    preferredTone: z.enum(["professional", "warm", "direct"]).optional(),
    followUpCadenceDays: z.array(z.number().int().min(1).max(30)).max(5).optional(),
    availabilityWindows: z.array(z.object({
        day: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
        startHour: z.number().int().min(0).max(23),
        endHour: z.number().int().min(1).max(24),
        timezone: z.string().min(2).max(80),
    })).max(14).optional(),
    targetCompensation: z.object({
        currency: z.string().min(3).max(3).optional(),
        minimum: z.number().int().min(0).optional(),
        ideal: z.number().int().min(0).optional(),
    }).optional(),
}).strict();
const resumeBuilderSchema = z.object({
    jobId: z.string().uuid().optional(),
});
function featureBlocked(res, message) {
    res.status(403).json({ error: message });
}
function hasResumeBuilderAccess(plan) {
    return plan === SubscriptionPlan.BASIC || plan === SubscriptionPlan.PROFESSIONAL;
}
function hasInterviewPrepAccess(plan, videoMockInterviews) {
    return plan !== SubscriptionPlan.FREE && (videoMockInterviews ?? 0) !== 0;
}
async function loadCandidateContext(userId) {
    const [profile, user, entitlements] = await Promise.all([
        prisma.candidateProfile.findUnique({
            where: { userId },
            include: {
                resumes: {
                    where: { isActive: true },
                    take: 1,
                    orderBy: { uploadedAt: "desc" },
                },
            },
        }),
        prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, email: true },
        }),
        getUserEntitlements(userId),
    ]);
    return { profile, user, entitlements };
}
function buildRecommendations(input) {
    const recs = [];
    if (!input.profile) {
        recs.push("Complete your candidate profile to unlock autonomous resume building and verified job matching.");
        return recs;
    }
    if (input.profile.profileCompleteness < 70) {
        recs.push(`Improve your profile completeness for stronger resume synthesis and match quality (${input.profile.profileCompleteness}%).`);
    }
    if (input.profile.skills.length < 5) {
        recs.push("Add more skills so the agent can tailor resumes and outreach with better precision.");
    }
    if (!input.profile.openToWork) {
        recs.push("Enable 'Open to Work' so the autonomous search agent can keep your pipeline active.");
    }
    if (input.savedSearchCount === 0) {
        recs.push("Create at least one saved search so the job-discovery agent has a market brief to work from.");
    }
    if (!input.entitlements.autopilot) {
        recs.push("Upgrade to Professional to unlock autonomous apply packs, follow-up drafting, and scheduling support.");
    }
    if (!input.latestResumeVersionTitle) {
        recs.push("Generate a master resume from your profile so every apply pack starts from a current baseline.");
    }
    if (input.taskSummary.needsReview > 0) {
        recs.push(`You have ${input.taskSummary.needsReview} automation item(s) waiting for review before they can be sent.`);
    }
    if (recs.length === 0) {
        recs.push("Your candidate agent system is active and ready to keep your search moving.");
    }
    return recs;
}
// GET /api/autopilot/status — Overview of the proactive agent for this user
router.get("/status", authenticate, authorize(Role.CANDIDATE), async (req, res) => {
    const userId = req.user.userId;
    try {
        const [subscription, savedSearchCount, totalAlerts, pendingAlerts, recentApplications, profile, pipeline,] = await Promise.all([
            prisma.subscription.findUnique({ where: { userId }, select: { plan: true, status: true } }),
            prisma.savedSearch.count({ where: { userId, alertEnabled: true } }),
            prisma.jobAlert.count({ where: { userId } }),
            prisma.jobAlert.count({ where: { userId, sentAt: null } }),
            prisma.application.count({
                where: { candidateId: userId, createdAt: { gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
            }),
            prisma.candidateProfile.findUnique({
                where: { userId },
                select: { profileCompleteness: true, skills: true, openToWork: true },
            }),
            getCandidatePipelineSnapshot(userId),
        ]);
        const entitlements = await getUserEntitlements(userId);
        res.json({
            agent: {
                active: savedSearchCount > 0 || (profile?.openToWork ?? false) || pipeline.settings.enabled,
                autoApplyEnabled: pipeline.settings.autoApplyEnabled && entitlements.autopilot,
                tier: subscription?.plan ?? "FREE",
                automationLevel: pipeline.settings.automationLevel,
            },
            stats: {
                activeSavedSearches: savedSearchCount,
                totalMatches: totalAlerts,
                pendingMatches: pendingAlerts,
                applicationsThisWeek: recentApplications,
                queuedTasks: pipeline.taskSummary.queued,
                reviewTasks: pipeline.taskSummary.needsReview,
            },
            profile: {
                completeness: profile?.profileCompleteness ?? 0,
                skillCount: profile?.skills.length ?? 0,
                openToWork: profile?.openToWork ?? false,
                latestResumeVersion: pipeline.latestResumeVersion,
            },
            modules: {
                resumeBuilder: pipeline.settings.resumeBuilderEnabled,
                autoApply: pipeline.settings.autoApplyEnabled && entitlements.autopilot,
                followUp: pipeline.settings.followUpEnabled && entitlements.autopilot,
                interviewPrep: pipeline.settings.interviewPrepEnabled && hasInterviewPrepAccess(entitlements.plan, entitlements.videoMockInterviews),
                scheduling: pipeline.settings.schedulingEnabled && entitlements.autopilot,
            },
            taskSummary: pipeline.taskSummary,
            recommendations: buildRecommendations({
                profile,
                savedSearchCount,
                entitlements,
                taskSummary: pipeline.taskSummary,
                latestResumeVersionTitle: pipeline.latestResumeVersion?.title ?? null,
            }),
        });
    }
    catch (err) {
        logger.error({ err }, "[autopilot] status fetch failed");
        res.status(500).json({ error: "Failed to fetch autopilot status" });
    }
});
// GET /api/autopilot/matches — Paginated list of AI-scored job matches
router.get("/matches", authenticate, authorize(Role.CANDIDATE), async (req, res) => {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const minScore = parseInt(req.query.minScore) || 0;
    try {
        const where = {
            userId,
            ...(minScore > 0 ? { matchScore: { gte: minScore } } : {}),
        };
        const [matches, total] = await Promise.all([
            prisma.jobAlert.findMany({
                where,
                include: {
                    job: {
                        select: {
                            id: true,
                            title: true,
                            slug: true,
                            location: true,
                            type: true,
                            seniority: true,
                            salaryMin: true,
                            salaryMax: true,
                            currency: true,
                            visaSponsorship: true,
                            relocationAssistance: true,
                            sourceName: true,
                            publishedAt: true,
                            employer: { select: { companyName: true } },
                        },
                    },
                },
                orderBy: [{ matchScore: "desc" }, { createdAt: "desc" }],
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.jobAlert.count({ where }),
        ]);
        const appliedJobIds = new Set((await prisma.application.findMany({
            where: { candidateId: userId, jobId: { in: matches.map((match) => match.jobId) } },
            select: { jobId: true },
        })).map((application) => application.jobId));
        res.json({
            matches: matches.map((match) => ({
                ...match,
                alreadyApplied: appliedJobIds.has(match.jobId),
                companyName: match.job.employer?.companyName ?? match.job.sourceName ?? null,
            })),
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        logger.error({ err }, "[autopilot] matches fetch failed");
        res.status(500).json({ error: "Failed to fetch matches" });
    }
});
// POST /api/autopilot/settings — update automation preferences
router.post("/settings", authenticate, authorize(Role.CANDIDATE), async (req, res) => {
    const userId = req.user.userId;
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
        return;
    }
    try {
        const entitlements = await getUserEntitlements(userId);
        const profile = await ensureCandidateAutopilotProfile(userId);
        const data = parsed.data;
        const update = {
            ...data,
        };
        if (!entitlements.autopilot) {
            update.enabled = false;
            update.autoApplyEnabled = false;
            update.followUpEnabled = false;
            update.schedulingEnabled = false;
            update.automationLevel = CandidateAutomationLevel.ASSISTED;
        }
        if (!hasInterviewPrepAccess(entitlements.plan, entitlements.videoMockInterviews)) {
            update.interviewPrepEnabled = false;
        }
        if (!hasResumeBuilderAccess(entitlements.plan)) {
            update.resumeBuilderEnabled = false;
        }
        const updated = await prisma.candidateAutopilotProfile.update({
            where: { id: profile.id },
            data: update,
        });
        res.json(updated);
    }
    catch (err) {
        logger.error({ err }, "[autopilot] settings update failed");
        res.status(500).json({ error: "Failed to update autopilot settings" });
    }
});
// GET /api/autopilot/pipeline — task queue + resume versions
router.get("/pipeline", authenticate, authorize(Role.CANDIDATE), async (req, res) => {
    const userId = req.user.userId;
    try {
        const [snapshot, resumeVersions, tasks] = await Promise.all([
            getCandidatePipelineSnapshot(userId),
            prisma.candidateResumeVersion.findMany({
                where: { userId },
                select: {
                    id: true,
                    title: true,
                    targetRole: true,
                    source: true,
                    status: true,
                    score: true,
                    keywords: true,
                    createdAt: true,
                    updatedAt: true,
                },
                orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
                take: 8,
            }),
            prisma.candidateAgentTask.findMany({
                where: { userId },
                select: {
                    id: true,
                    type: true,
                    status: true,
                    title: true,
                    summary: true,
                    scheduledFor: true,
                    completedAt: true,
                    createdAt: true,
                    outputSummary: true,
                },
                orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
                take: 20,
            }),
        ]);
        res.json({
            snapshot,
            resumeVersions,
            tasks,
        });
    }
    catch (err) {
        logger.error({ err }, "[autopilot] pipeline fetch failed");
        res.status(500).json({ error: "Failed to fetch candidate pipeline" });
    }
});
// POST /api/autopilot/resume-builder — synthesize a candidate resume version
router.post("/resume-builder", authenticate, authorize(Role.CANDIDATE), async (req, res) => {
    const userId = req.user.userId;
    const parsed = resumeBuilderSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
        return;
    }
    try {
        const { profile, user, entitlements } = await loadCandidateContext(userId);
        if (!profile || !user) {
            res.status(400).json({ error: "Complete your profile before using the resume builder" });
            return;
        }
        if (!hasResumeBuilderAccess(entitlements.plan)) {
            featureBlocked(res, "Upgrade to Basic or Professional to use the autonomous resume builder.");
            return;
        }
        const targetJob = parsed.data.jobId
            ? await prisma.job.findUnique({
                where: { id: parsed.data.jobId },
                select: { id: true, title: true, description: true, tags: true, sourceName: true },
            })
            : null;
        const version = await buildResumeVersion({
            user,
            profile,
            job: targetJob,
        });
        await queueCandidateAgentTask({
            userId,
            type: CandidateAgentTaskType.RESUME_REFRESH,
            jobId: targetJob?.id ?? null,
            resumeVersionId: version.id,
            priority: 60,
            title: buildTaskTitle(CandidateAgentTaskType.RESUME_REFRESH, targetJob?.title ?? null),
            summary: targetJob
                ? `Tailored master resume for ${targetJob.title}.`
                : "Refreshed master resume from profile data.",
            status: CandidateAgentTaskStatus.COMPLETED,
            outputSummary: {
                resumeVersionId: version.id,
                score: version.score,
            },
        });
        res.status(201).json({ version });
    }
    catch (err) {
        logger.error({ err }, "[autopilot] resume builder failed");
        res.status(500).json({ error: "Failed to build resume version" });
    }
});
// POST /api/autopilot/follow-up/:applicationId — create follow-up drafts
router.post("/follow-up/:applicationId", authenticate, authorize(Role.CANDIDATE), async (req, res) => {
    const userId = req.user.userId;
    const applicationId = req.params.applicationId;
    try {
        const { user, entitlements } = await loadCandidateContext(userId);
        if (!user || !entitlements.autopilot) {
            featureBlocked(res, "Upgrade to Professional to unlock autonomous follow-up drafting.");
            return;
        }
        const application = await prisma.application.findFirst({
            where: { id: applicationId, candidateId: userId },
            include: {
                job: {
                    select: {
                        id: true,
                        title: true,
                        sourceName: true,
                        applicationUrl: true,
                        sourceUrl: true,
                    },
                },
            },
        });
        if (!application) {
            res.status(404).json({ error: "Application not found" });
            return;
        }
        const drafts = await buildFollowUpDraft({
            user,
            application,
            job: application.job,
        });
        res.status(201).json({ drafts });
    }
    catch (err) {
        logger.error({ err, applicationId }, "[autopilot] follow-up generation failed");
        res.status(500).json({ error: "Failed to create follow-up drafts" });
    }
});
// POST /api/autopilot/interview-prep/:applicationId — build interview prep pack
router.post("/interview-prep/:applicationId", authenticate, authorize(Role.CANDIDATE), async (req, res) => {
    const userId = req.user.userId;
    const applicationId = req.params.applicationId;
    try {
        const { profile, user, entitlements } = await loadCandidateContext(userId);
        if (!profile || !user) {
            res.status(400).json({ error: "Complete your candidate profile before generating interview prep" });
            return;
        }
        if (!hasInterviewPrepAccess(entitlements.plan, entitlements.videoMockInterviews)) {
            featureBlocked(res, "Upgrade to Basic or Professional to unlock interview prep automation.");
            return;
        }
        const application = await prisma.application.findFirst({
            where: { id: applicationId, candidateId: userId },
            include: {
                job: {
                    select: {
                        id: true,
                        title: true,
                        description: true,
                        tags: true,
                        sourceName: true,
                    },
                },
            },
        });
        if (!application) {
            res.status(404).json({ error: "Application not found" });
            return;
        }
        const pack = await buildInterviewPrepPack({
            user,
            profile,
            application,
            job: application.job,
        });
        res.status(201).json({ pack });
    }
    catch (err) {
        logger.error({ err, applicationId }, "[autopilot] interview prep failed");
        res.status(500).json({ error: "Failed to build interview prep pack" });
    }
});
// POST /api/autopilot/apply — On-demand apply pack for a specific job
router.post("/apply", authenticate, authorize(Role.CANDIDATE), async (req, res) => {
    const userId = req.user.userId;
    const parsed = applySchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
        return;
    }
    const { jobId } = parsed.data;
    try {
        const { profile, user, entitlements } = await loadCandidateContext(userId);
        if (!profile || !user) {
            res.status(400).json({ error: "Complete your profile first" });
            return;
        }
        const job = await prisma.job.findUnique({ where: { id: jobId } });
        if (!job || job.status !== "PUBLISHED") {
            res.status(404).json({ error: "Job not found or not available" });
            return;
        }
        const existingApp = await prisma.application.findFirst({
            where: { jobId, candidateId: userId },
        });
        if (existingApp) {
            res.status(400).json({ error: "Already applied to this job" });
            return;
        }
        const activeResume = profile.resumes[0] ?? null;
        const companyName = job.employerId
            ? (await prisma.employer.findUnique({ where: { id: job.employerId }, select: { companyName: true } }))?.companyName ?? job.sourceName ?? "the company"
            : job.sourceName ?? "the company";
        const clResult = await generateQuickCoverLetter({
            candidateName: user.name ?? "Candidate",
            headline: profile.headline,
            skills: profile.skills,
            bio: profile.bio,
            yearsExperience: profile.yearsExperience,
            jobTitle: job.title,
            companyName,
            jobDescription: job.description,
        });
        const application = await prisma.application.create({
            data: {
                jobId,
                candidateId: userId,
                cvUrl: activeResume?.s3Key ?? null,
                coverLetter: clResult.coverLetter,
                notes: `[AI-Assisted Application] Cover letter source: ${clResult.source}`,
                status: "PENDING",
            },
            include: {
                job: {
                    select: {
                        id: true,
                        title: true,
                        slug: true,
                        description: true,
                        tags: true,
                        sourceName: true,
                        applicationUrl: true,
                        sourceUrl: true,
                    },
                },
            },
        });
        const resumeVersion = await buildResumeVersion({
            user,
            profile,
            job: {
                id: application.job.id,
                title: application.job.title,
                description: application.job.description,
                tags: application.job.tags,
                sourceName: application.job.sourceName,
            },
        });
        await queueCandidateAgentTask({
            userId,
            type: CandidateAgentTaskType.APPLY_PACK,
            applicationId: application.id,
            jobId,
            resumeVersionId: resumeVersion.id,
            priority: 80,
            title: buildTaskTitle(CandidateAgentTaskType.APPLY_PACK, job.title),
            summary: `Prepared resume + cover letter for ${job.title}.`,
            status: CandidateAgentTaskStatus.COMPLETED,
            outputSummary: {
                coverLetterSource: clResult.source,
                resumeVersionId: resumeVersion.id,
            },
        });
        let followUps = [];
        let interviewPrepTaskId = null;
        if (entitlements.autopilot) {
            followUps = await buildFollowUpDraft({
                user,
                application,
                job: {
                    id: application.job.id,
                    title: application.job.title,
                    sourceName: application.job.sourceName,
                    applicationUrl: application.job.applicationUrl,
                    sourceUrl: application.job.sourceUrl,
                },
            });
        }
        if (hasInterviewPrepAccess(entitlements.plan, entitlements.videoMockInterviews)) {
            const interviewPrep = await buildInterviewPrepPack({
                user,
                profile,
                application,
                job: {
                    id: application.job.id,
                    title: application.job.title,
                    description: application.job.description,
                    tags: application.job.tags,
                    sourceName: application.job.sourceName,
                },
            });
            interviewPrepTaskId = interviewPrep.taskId;
        }
        await prisma.notification.create({
            data: {
                userId,
                type: "APPLICATION_STATUS",
                title: `AI prepared your application for ${job.title}`,
                body: `Your apply pack is ready${followUps.length > 0 ? ", including follow-up drafts" : ""}${interviewPrepTaskId ? " and interview prep" : ""}.`,
                metadata: {
                    jobId,
                    jobSlug: application.job.slug,
                    resumeVersionId: resumeVersion.id,
                    followUpTaskIds: followUps.map((draft) => draft.taskId),
                    interviewPrepTaskId,
                },
            },
        });
        res.status(201).json({
            application,
            coverLetterSource: clResult.source,
            resumeVersionId: resumeVersion.id,
            followUpDrafts: followUps,
            interviewPrepTaskId,
            message: "Application submitted with AI-generated cover letter and autonomous task pack",
        });
    }
    catch (err) {
        logger.error({ jobId, err }, "[autopilot] on-demand apply failed");
        res.status(500).json({ error: "Failed to generate application" });
    }
});
export default router;
//# sourceMappingURL=autopilot.js.map