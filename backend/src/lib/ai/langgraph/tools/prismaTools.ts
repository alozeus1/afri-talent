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
import { recordOpsEvent } from "../../../ops/events.js";
import { emitApprovalRequested } from "../../../notifications/approvalWebhook.js";
import type { GraphEvent, GraphEventSink } from "../observability/graphEvents.js";
import type { GraphRunStatus, ApprovalState, WorkflowType } from "../state/schemas.js";

/**
 * Thrown when a resume is attempted on a run that was already denied out-of-band
 * (e.g. the operator clicked "Deny" in the n8n approval email). This makes DENIED
 * a hard terminal state: no later console/user approval can resume the paused
 * LangGraph checkpoint into a sensitive side effect. Callers (HTTP routes) should
 * map this to a 409 and surface "this request was already denied".
 */
export class GraphRunDeniedError extends Error {
  readonly graphRunId: string;
  constructor(graphRunId: string) {
    super(`Graph run ${graphRunId} was denied and cannot be resumed`);
    this.name = "GraphRunDeniedError";
    this.graphRunId = graphRunId;
  }
}

/** Whether a run's persisted approval decision is DENIED. Fails open (returns
 * false) on a read error — the subsequent checkpoint invoke shares the same DB,
 * so a real outage surfaces there rather than silently blocking approvals. */
export async function isGraphRunDenied(graphRunId: string): Promise<boolean> {
  try {
    const row = await prisma.graphRun.findUnique({
      where: { graphRunId },
      select: { approvalState: true },
    });
    return row?.approvalState === "DENIED";
  } catch (err) {
    logger.warn(
      { err: String(err), graph_run_id: graphRunId },
      "[graph] isGraphRunDenied read failed (treating as not denied)",
    );
    return false;
  }
}

/**
 * Guard the entry of every resume path. If the run was denied out-of-band,
 * record the blocked attempt and throw before any checkpoint invoke, so the
 * graph's side effect (publish/send/verify) never executes.
 */
export async function assertGraphRunNotDenied(graphRunId: string): Promise<void> {
  if (await isGraphRunDenied(graphRunId)) {
    recordOpsEvent({
      metricName: "langgraph_resume_blocked_denied",
      category: "langgraph",
      outcome: "held",
      severity: "warning",
      details: { graph_run_id: graphRunId },
    });
    throw new GraphRunDeniedError(graphRunId);
  }
}

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
    const updated = await prisma.graphRun.update({
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

    // Human-gate seam: when a run pauses for human approval, notify the n8n
    // approval broker so the operator gets an email with a deep link (real,
    // TOTP-gated approval) and a one-click deny. Best-effort and non-fatal —
    // must never break the graph. No-ops when the feature is unconfigured.
    if (patch.approvalState === "REQUESTED") {
      void emitApprovalRequested(
        {
          graphRunId: updated.graphRunId,
          workflowType: updated.workflowType,
          userId: updated.userId,
          candidateId: updated.candidateId,
          employerId: updated.employerId,
          jobId: updated.jobId,
          applicationId: updated.applicationId,
          riskFlags: updated.riskFlags,
          currentStep: updated.currentStep,
        },
        Math.floor(Date.now() / 1000),
      ).catch((err) => {
        logger.warn({ err: String(err), graph_run_id: graphRunId }, "[n8n] approval emit threw (non-fatal)");
      });
    }
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
