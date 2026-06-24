// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — base Annotation (graph channel definitions)
//
// Mirrors BaseGraphStateSchema as LangGraph channels with reducers. Graph-specific
// state extends this by spreading `BaseGraphAnnotation.spec`:
//
//   const MyState = Annotation.Root({
//     ...BaseGraphAnnotation.spec,
//     parsedResumeRef: Annotation<ArtifactRef | undefined>(),
//   });
// ─────────────────────────────────────────────────────────────────────────────

import { Annotation } from "@langchain/langgraph";
import type {
  ApprovalState,
  ArtifactRef,
  AuditEvent,
  GraphError,
  GraphRunStatus,
  RiskFlag,
  TokenUsage,
  WorkflowType,
} from "./schemas.js";
import {
  appendReducer,
  lastWriteWins,
  mergeTokenUsage,
} from "./reducers.js";

const emptyTokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

/**
 * BaseGraphAnnotation — shared channels for every AfriTalent graph.
 * Append channels accumulate; scalar channels are last-write-wins.
 */
export const BaseGraphAnnotation = Annotation.Root({
  graphRunId: Annotation<string>({ reducer: lastWriteWins, default: () => "" }),
  workflowType: Annotation<WorkflowType>({
    reducer: lastWriteWins,
    default: () => "resume_review" as WorkflowType,
  }),

  userId: Annotation<string | undefined>({ reducer: lastWriteWins, default: () => undefined }),
  candidateId: Annotation<string | undefined>({ reducer: lastWriteWins, default: () => undefined }),
  employerId: Annotation<string | undefined>({ reducer: lastWriteWins, default: () => undefined }),
  jobId: Annotation<string | undefined>({ reducer: lastWriteWins, default: () => undefined }),
  applicationId: Annotation<string | undefined>({ reducer: lastWriteWins, default: () => undefined }),

  currentStep: Annotation<string>({ reducer: lastWriteWins, default: () => "start" }),
  status: Annotation<GraphRunStatus>({ reducer: lastWriteWins, default: () => "RUNNING" }),

  inputRefs: Annotation<ArtifactRef[]>({ reducer: appendReducer, default: () => [] }),
  outputRefs: Annotation<ArtifactRef[]>({ reducer: appendReducer, default: () => [] }),

  riskFlags: Annotation<RiskFlag[]>({ reducer: appendReducer, default: () => [] }),

  humanApprovalRequired: Annotation<boolean>({ reducer: lastWriteWins, default: () => false }),
  approvalState: Annotation<ApprovalState>({ reducer: lastWriteWins, default: () => "NONE" }),

  tokenUsage: Annotation<TokenUsage>({ reducer: mergeTokenUsage, default: () => emptyTokenUsage }),
  costEstimateUsd: Annotation<number>({
    reducer: (a, b) => (b === undefined ? a : a + b),
    default: () => 0,
  }),

  retryCount: Annotation<number>({ reducer: lastWriteWins, default: () => 0 }),
  errors: Annotation<GraphError[]>({ reducer: appendReducer, default: () => [] }),
  auditEvents: Annotation<AuditEvent[]>({ reducer: appendReducer, default: () => [] }),

  createdAt: Annotation<string>({ reducer: lastWriteWins, default: () => new Date().toISOString() }),
  updatedAt: Annotation<string>({ reducer: lastWriteWins, default: () => new Date().toISOString() }),
});

export type BaseGraphStateChannels = typeof BaseGraphAnnotation.State;
