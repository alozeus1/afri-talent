import { createHash } from "crypto";
import prisma from "../prisma.js";
import logger from "../logger.js";
import { AiRunStatus, AiRunType, Prisma } from "@prisma/client";
export function hashText(text) {
    return createHash("sha256").update(text).digest("hex").slice(0, 64);
}
export async function createAiRun(userId, runId, runType, resumeHash, tokenBudgetTotal) {
    try {
        const type = runType === "resume_review"
            ? AiRunType.RESUME_REVIEW
            : runType === "job_match"
                ? AiRunType.JOB_MATCH
                : AiRunType.APPLY_PACK;
        await prisma.aiRun.create({
            data: {
                runId,
                userId,
                runType: type,
                resumeHash,
                tokenBudgetTotal,
                status: AiRunStatus.RUNNING,
            },
        });
    }
    catch (err) {
        logger.warn({ run_id: runId, err }, "[persistence] createAiRun failed (non-fatal)");
    }
}
export async function completeAiRun(runId, output) {
    try {
        const statusMap = {
            ok: AiRunStatus.COMPLETE,
            partial: AiRunStatus.PARTIAL,
            blocked: AiRunStatus.BLOCKED,
        };
        const status = statusMap[output.status] ?? AiRunStatus.COMPLETE;
        await prisma.aiRun.update({
            where: { runId },
            data: {
                status,
                tokenBudgetUsed: output.budget.token_used_estimate,
                notes: output.notes_for_ui,
                completedAt: new Date(),
            },
        });
        // Persist job results
        for (let i = 0; i < output.ranked_jobs.length; i++) {
            const rj = output.ranked_jobs[i];
            const tailored = output.tailored_outputs.find((t) => t.job_id === rj.job_id);
            try {
                await prisma.aiRunJob.create({
                    data: {
                        aiRun: { connect: { runId } },
                        jobIndex: i,
                        jobTitle: rj.job_json.title ?? null,
                        jobCompany: rj.job_json.company ?? null,
                        score: rj.match.score,
                        mustHavePct: rj.match.must_have_coverage_pct,
                        tailoredOutput: tailored?.tailored_resume
                            ? tailored.tailored_resume
                            : Prisma.JsonNull,
                        coverLetterOutput: tailored?.cover_letter_pack
                            ? tailored.cover_letter_pack
                            : Prisma.JsonNull,
                        guardReport: tailored?.guard_report
                            ? tailored.guard_report
                            : Prisma.JsonNull,
                    },
                });
            }
            catch (innerErr) {
                logger.warn({ run_id: runId, job_id: rj.job_id, err: innerErr }, "[persistence] upsertRunJob failed (non-fatal)");
            }
        }
    }
    catch (err) {
        logger.warn({ run_id: runId, err }, "[persistence] completeAiRun failed (non-fatal)");
    }
}
export async function getRunHistory(userId, limit = 10) {
    const runs = await prisma.aiRun.findMany({
        where: { userId },
        include: {
            jobs: {
                select: {
                    jobIndex: true,
                    jobTitle: true,
                    jobCompany: true,
                    score: true,
                    mustHavePct: true,
                    tailoredOutput: true,
                    coverLetterOutput: true,
                    guardReport: true,
                },
                orderBy: { jobIndex: "asc" },
            },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
    });
    return runs;
}
//# sourceMappingURL=persistence.js.map