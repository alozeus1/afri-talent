// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — Prisma persistence tools
//
// Thin, best-effort adapters that persist the business-facing audit layer
// (GraphRun + GraphRunEvent). All writes are non-fatal: observability/audit must
// never break a workflow. Only PII-free fields are written (ids, refs, statuses,
// flat scalar event details).
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../../../prisma.js";
import logger from "../../../logger.js";
import type { GraphEvent, GraphEventSink } from "../observability/graphEvents.js";
import type { GraphRunStatus, ApprovalState, WorkflowType } from "../state/schemas.js";

export interface CreateGraphRunInput {
  graphRunId: string;
  workflowType: WorkflowType;
  threadId: string;
  userId?: string;
  candidateId?: string;
  employerId?: string;
  jobId?: string;
  applicationId?: string;
  aiRunId?: string;
}

/** Create the GraphRun audit row. Best-effort. */
export async function createGraphRun(input: CreateGraphRunInput): Promise<void> {
  try {
    await prisma.graphRun.create({
      data: {
        graphRunId: input.graphRunId,
        workflowType: input.workflowType,
        threadId: input.threadId,
        status: "RUNNING",
        userId: input.userId,
        candidateId: input.candidateId,
        employerId: input.employerId,
        jobId: input.jobId,
        applicationId: input.applicationId,
        aiRunId: input.aiRunId,
      },
    });
  } catch (err) {
    logger.warn({ err: String(err), graph_run_id: input.graphRunId }, "[graph] createGraphRun failed (non-fatal)");
  }
}

export interface UpdateGraphRunInput {
  status?: GraphRunStatus;
  approvalState?: ApprovalState;
  currentStep?: string;
  tokenUsage?: number;
  costEstimateMilliUsd?: number;
  retryCount?: number;
  riskFlags?: unknown;
  errors?: unknown;
}

/** Update the GraphRun audit row. Best-effort. */
export async function updateGraphRun(graphRunId: string, patch: UpdateGraphRunInput): Promise<void> {
  try {
    await prisma.graphRun.update({
      where: { graphRunId },
      data: {
        status: patch.status,
        approvalState: patch.approvalState,
        currentStep: patch.currentStep,
        tokenUsage: patch.tokenUsage,
        costEstimateMilliUsd: patch.costEstimateMilliUsd,
        retryCount: patch.retryCount,
        riskFlags: patch.riskFlags === undefined ? undefined : (patch.riskFlags as object),
        errors: patch.errors === undefined ? undefined : (patch.errors as object),
      },
    });
  } catch (err) {
    logger.warn({ err: String(err), graph_run_id: graphRunId }, "[graph] updateGraphRun failed (non-fatal)");
  }
}

/**
 * Build a GraphEventSink that persists events to GraphRunEvent. The parent
 * GraphRun row must exist first (the init node creates it); orphan events are
 * dropped with a warning by the FK constraint, which is acceptable for audit.
 */
export function createPrismaGraphEventSink(): GraphEventSink {
  return async (event: GraphEvent) => {
    try {
      await prisma.graphRunEvent.create({
        data: {
          graphRunId: event.graphRunId,
          type: event.type,
          node: event.node,
          details: (event.details ?? undefined) as object | undefined,
        },
      });
    } catch (err) {
      logger.warn({ err: String(err), graph_run_id: event.graphRunId }, "[graph] event persist failed (non-fatal)");
    }
  };
}
