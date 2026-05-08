// ─────────────────────────────────────────────────────────────────────────────
// Lambda entry — orchestrator (Step Functions Task)
//
// Native handler (no Express). Invoked by AWS Step Functions as a Task.
//
// Today this Lambda runs the WHOLE orchestrator flow in one invocation. The
// existing 6-agent pipeline lives in lib/ai/orchestrator/index.ts and runs to
// completion within Lambda's 15-minute hard limit.
//
// Future shape (post-migration optimization, NOT Phase 0): split each agent
// into its own Lambda + Step Functions state, gaining per-step retry, parallel
// fan-out for job parsing/scoring, and finer cost attribution. The router at
// routes/orchestrator.ts will then return immediately with run_id and the
// frontend will poll GET /api/orchestrator/runs/:id for status. That changes
// UX (polling vs. wait), so it stays deferred.
//
// Phase 0 wiring: Express route at POST /api/orchestrator/run continues to
// call runOrchestrator() in-process on Fargate. This Lambda exists so:
//   1. Terraform has a deploy target
//   2. We can A/B-test the Lambda path against Fargate post-cutover
//   3. We can flip the route to invoke this Lambda via Step Functions when ready
//
// Event contract (Step Functions Task input):
//   {
//     "input":  OrchestratorInput,  // full input as defined in lib/ai/orchestrator/types.ts
//     "userId": string              // candidate user ID
//   }
//
// Output: OrchestratorOutput (returned to Step Functions as Payload)
//
// Env contract (set by Terraform):
//   ANTHROPIC_API_KEY    — from SSM SecureString
//   AI_FAST_MODEL        — optional, default claude-haiku-4-5-20251001
//   AI_QUALITY_MODEL     — optional, default claude-sonnet-4-6
//   DATABASE_URL         — RDS Proxy endpoint (for createAiRun/completeAiRun)
//   MOCK_AI              — "1" for synthetic canary runs, "0" otherwise
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID, createHash } from "crypto";
import type { Context } from "aws-lambda";
import { runOrchestrator } from "../lib/ai/orchestrator/index.js";
import type {
  OrchestratorInput,
  OrchestratorOutput,
} from "../lib/ai/orchestrator/index.js";
import { createAiRun, completeAiRun } from "../lib/ai/persistence.js";
import logger from "../lib/logger.js";

export interface OrchestratorEvent {
  input: OrchestratorInput;
  userId: string;
}

const DEFAULT_TOKEN_BUDGET = 60_000;

export const handler = async (
  event: OrchestratorEvent,
  context: Context,
): Promise<OrchestratorOutput> => {
  const { input, userId } = event;

  if (!input || !userId) {
    throw new Error("orchestrator-step: missing input or userId in event");
  }

  const runId = input.run_id ?? randomUUID();
  const tokenBudget = input.limits?.token_budget_total ?? DEFAULT_TOKEN_BUDGET;
  const resumeHash = createHash("sha256")
    .update(input.resume_text)
    .digest("hex")
    .slice(0, 64);

  logger.info(
    {
      run_id: runId,
      user_id_prefix: userId.slice(0, 8),
      run_type: input.run_type,
      lambda_request_id: context.awsRequestId,
      remaining_ms: context.getRemainingTimeInMillis(),
    },
    "[lambda orchestrator-step] starting",
  );

  // Persist start (fire-and-forget — same pattern as the Express route).
  void createAiRun(userId, runId, input.run_type, resumeHash, tokenBudget);

  try {
    const output = await runOrchestrator({
      ...input,
      run_id: runId,
      user_id: userId,
    });

    logger.info(
      {
        run_id: runId,
        status: output.status,
        ranked_jobs: output.ranked_jobs.length,
        tailored_outputs: output.tailored_outputs.length,
        tokens_used: output.budget.token_used_estimate,
      },
      "[lambda orchestrator-step] complete",
    );

    void completeAiRun(runId, output);
    return output;
  } catch (err) {
    logger.error(
      { run_id: runId, err: (err as Error).message },
      "[lambda orchestrator-step] failed",
    );
    throw err; // Step Functions retry policy handles backoff
  }
};
