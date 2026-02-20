import { createHash } from "crypto";
import prisma from "../prisma.js";
import logger from "../logger.js";
import { AiRunStatus, AiRunType, Prisma } from "@prisma/client";
import type { OrchestratorOutput } from "./orchestrator/index.js";

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 64);
}

export async function createAiRun(
  userId: string,
  runId: string,
  runType: string,
  resumeHash: string,
  tokenBudgetTotal: number
): Promise<void> {
  try {
    const type =
      runType === "resume_review"
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
  } catch (err) {
    logger.warn({ run_id: runId, err }, "[persistence] createAiRun failed (non-fatal)");
  }
}

export async function completeAiRun(
  runId: string,
  output: OrchestratorOutput
): Promise<void> {
  try {
    const statusMap: Record<string, AiRunStatus> = {
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
              ? (tailored.tailored_resume as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            coverLetterOutput: tailored?.cover_letter_pack
              ? (tailored.cover_letter_pack as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            guardReport: tailored?.guard_report
              ? (tailored.guard_report as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          },
        });
      } catch (innerErr) {
        logger.warn(
          { run_id: runId, job_id: rj.job_id, err: innerErr },
          "[persistence] upsertRunJob failed (non-fatal)"
        );
      }
    }
  } catch (err) {
    logger.warn({ run_id: runId, err }, "[persistence] completeAiRun failed (non-fatal)");
  }
}

export interface AiRunHistoryItem {
  id: string;
  runId: string;
  runType: AiRunType;
  status: AiRunStatus;
  tokenBudgetTotal: number;
  tokenBudgetUsed: number;
  notes: string[];
  createdAt: Date;
  completedAt: Date | null;
  jobs: Array<{
    jobIndex: number;
    jobTitle: string | null;
    jobCompany: string | null;
    score: number | null;
    mustHavePct: number | null;
    tailoredOutput: unknown;
    coverLetterOutput: unknown;
    guardReport: unknown;
  }>;
}

export async function getRunHistory(
  userId: string,
  limit = 10
): Promise<AiRunHistoryItem[]> {
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

  return runs as AiRunHistoryItem[];
}
