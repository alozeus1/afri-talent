// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — channel reducers
//
// Pure functions used as Annotation reducers. Append-style channels accumulate
// (audit events, errors, risk flags, artifact refs); scalar channels are
// last-write-wins; token usage merges additively.
// ─────────────────────────────────────────────────────────────────────────────

import type { AuditEvent, GraphError, RiskFlag, ArtifactRef, TokenUsage } from "./schemas.js";

/** Append `b` onto `a`. If `b` is undefined, keep `a`. */
export function appendReducer<T>(a: T[], b: T[] | T | undefined): T[] {
  if (b === undefined) return a;
  return a.concat(Array.isArray(b) ? b : [b]);
}

/** Last-write-wins: prefer `b` when defined, else keep `a`. */
export function lastWriteWins<T>(a: T, b: T | undefined): T {
  return b === undefined ? a : b;
}

/** Additive merge of token usage. */
export function mergeTokenUsage(a: TokenUsage, b: Partial<TokenUsage> | undefined): TokenUsage {
  if (!b) return a;
  const inputTokens = a.inputTokens + (b.inputTokens ?? 0);
  const outputTokens = a.outputTokens + (b.outputTokens ?? 0);
  const totalTokens =
    b.totalTokens !== undefined ? a.totalTokens + b.totalTokens : inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}

// Typed convenience aliases (keep call sites readable in graph definitions).
export const auditEventsReducer = (a: AuditEvent[], b: AuditEvent[] | AuditEvent | undefined) =>
  appendReducer(a, b);
export const errorsReducer = (a: GraphError[], b: GraphError[] | GraphError | undefined) =>
  appendReducer(a, b);
export const riskFlagsReducer = (a: RiskFlag[], b: RiskFlag[] | RiskFlag | undefined) =>
  appendReducer(a, b);
export const artifactRefsReducer = (a: ArtifactRef[], b: ArtifactRef[] | ArtifactRef | undefined) =>
  appendReducer(a, b);
