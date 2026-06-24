// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — tool policy (least privilege)
//
// Declares which tool families each graph may call. Tools are thin adapters over
// existing libs (prisma, rag, billing, notifications, apply, trust). A graph node
// must assertToolAllowed() before invoking a tool so privilege escalation is
// impossible by construction.
// ─────────────────────────────────────────────────────────────────────────────

import type { WorkflowType } from "../state/schemas.js";

export const TOOL_FAMILIES = [
  "prisma",
  "rag",
  "billing",
  "notification",
  "apply",
  "trust",
] as const;
export type ToolFamily = (typeof TOOL_FAMILIES)[number];

/** Allow-list of tool families per workflow. Default-deny: absent = not allowed. */
const TOOL_POLICY: Record<WorkflowType, ToolFamily[]> = {
  resume_review: ["prisma", "rag"],
  job_match: ["prisma", "rag"],
  apply_pack: ["prisma", "rag", "billing", "apply", "notification"],
  candidate_autopilot: ["prisma", "rag", "billing", "apply", "notification", "trust"],
  employer_verification: ["prisma", "trust", "notification"],
  candidate_verification: ["prisma", "trust", "notification"],
  job_ingestion_quality: ["prisma", "rag", "trust"],
  interview_prep: ["prisma", "rag"],
  follow_up: ["prisma", "notification"],
  blog_automation: ["prisma", "notification"],
  trust_moderation: ["prisma", "trust", "notification"],
  billing_recovery: ["prisma", "billing", "notification"],
};

export function isToolAllowed(workflow: WorkflowType, tool: ToolFamily): boolean {
  return TOOL_POLICY[workflow]?.includes(tool) ?? false;
}

export class ToolPolicyError extends Error {
  constructor(workflow: WorkflowType, tool: ToolFamily) {
    super(`Tool family "${tool}" is not permitted for workflow "${workflow}"`);
    this.name = "ToolPolicyError";
  }
}

export function assertToolAllowed(workflow: WorkflowType, tool: ToolFamily): void {
  if (!isToolAllowed(workflow, tool)) throw new ToolPolicyError(workflow, tool);
}

export function allowedTools(workflow: WorkflowType): ToolFamily[] {
  return TOOL_POLICY[workflow] ?? [];
}
