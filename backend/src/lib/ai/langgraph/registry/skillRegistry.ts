// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — skill / agent registry
//
// Single source of truth describing every AI skill and agent: its model policy,
// schemas, token budget, allowed tools, risk level, whether it needs human
// approval, and which routes/graphs use it. New skills register here instead of
// duplicating AI plumbing. Phase 1 seeds the existing agents + skills (metadata
// only; concrete invocation is wired in later phases).
// ─────────────────────────────────────────────────────────────────────────────

import type { z } from "zod/v4";
import type { ModelTier } from "../policies/modelPolicy.js";
import type { ToolFamily } from "../policies/toolPolicy.js";
import type { RiskTier, WorkflowType } from "../state/schemas.js";

export interface SkillDefinition {
  /** Stable unique name, e.g. "resume_parser" or "ats_scanner". */
  name: string;
  description: string;
  modelTier: ModelTier;
  /** Soft token budget for a single invocation. */
  tokenBudget: number;
  /** Default risk level of the skill's output/action. */
  riskLevel: RiskTier;
  /** Whether using this skill's output for an external action needs human approval. */
  humanApprovalRequired: boolean;
  /** Tool families this skill is permitted to touch. */
  allowedTools: ToolFamily[];
  /** HTTP routes that expose this skill (for traceability). */
  routes: string[];
  /** Graphs that orchestrate this skill. */
  graphs: WorkflowType[];
  /** Whether the skill has test coverage (kept honest; updated as tests land). */
  testCoverage: boolean;
  /** Optional Zod schemas; attached as graphs are built. */
  inputSchema?: z.ZodTypeAny;
  outputSchema?: z.ZodTypeAny;
}

const REGISTRY = new Map<string, SkillDefinition>();

export function registerSkill(def: SkillDefinition): void {
  if (REGISTRY.has(def.name)) {
    throw new Error(`Skill "${def.name}" is already registered`);
  }
  REGISTRY.set(def.name, def);
}

export function getSkill(name: string): SkillDefinition | undefined {
  return REGISTRY.get(name);
}

export function listSkills(): SkillDefinition[] {
  return [...REGISTRY.values()];
}

export function _resetSkillRegistry(): void {
  REGISTRY.clear();
  seedSkills();
}

// ── Seed: the six orchestrator agents ───────────────────────────────────────
const SEED: SkillDefinition[] = [
  {
    name: "resume_parser",
    description: "Extract structured resume data with no fabrication.",
    modelTier: "FAST",
    tokenBudget: 2048,
    riskLevel: "LOW",
    humanApprovalRequired: false,
    allowedTools: ["prisma"],
    routes: ["/orchestrator"],
    graphs: ["resume_review", "job_match", "apply_pack"],
    testCoverage: false,
  },
  {
    name: "job_parser",
    description: "Parse a job posting; separate must-have from nice-to-have skills.",
    modelTier: "FAST",
    tokenBudget: 2048,
    riskLevel: "LOW",
    humanApprovalRequired: false,
    allowedTools: ["prisma"],
    routes: ["/orchestrator"],
    graphs: ["job_match", "apply_pack", "job_ingestion_quality"],
    testCoverage: false,
  },
  {
    name: "match_scorer",
    description: "Deterministic-rubric match scoring with explainable breakdown.",
    modelTier: "FAST",
    tokenBudget: 1024,
    riskLevel: "LOW",
    humanApprovalRequired: false,
    allowedTools: ["prisma", "rag"],
    routes: ["/orchestrator"],
    graphs: ["job_match", "apply_pack", "candidate_autopilot"],
    testCoverage: false,
  },
  {
    name: "resume_tailor",
    description: "Tailor a resume to a job using only original facts; no fabrication.",
    modelTier: "QUAL",
    tokenBudget: 4096,
    riskLevel: "MEDIUM",
    humanApprovalRequired: false,
    allowedTools: ["prisma"],
    routes: ["/orchestrator"],
    graphs: ["apply_pack", "candidate_autopilot"],
    testCoverage: false,
  },
  {
    name: "cover_letter",
    description: "Generate a 200–300 word cover letter grounded in resume facts.",
    modelTier: "QUAL",
    tokenBudget: 2048,
    riskLevel: "MEDIUM",
    humanApprovalRequired: false,
    allowedTools: ["prisma"],
    routes: ["/orchestrator", "/skills/application-writer"],
    graphs: ["apply_pack", "candidate_autopilot"],
    testCoverage: false,
  },
  {
    name: "truth_consistency_guard",
    description: "Audit tailored resume + cover letter against original facts (PASS/FAIL).",
    modelTier: "QUAL",
    tokenBudget: 2048,
    riskLevel: "HIGH",
    humanApprovalRequired: false,
    allowedTools: [],
    routes: ["/orchestrator"],
    graphs: ["apply_pack", "candidate_autopilot"],
    testCoverage: false,
  },
  // ── Standalone skills ──────────────────────────────────────────────────────
  {
    name: "ats_scanner",
    description: "ATS-compatibility scan of a resume.",
    modelTier: "FAST",
    tokenBudget: 2048,
    riskLevel: "LOW",
    humanApprovalRequired: false,
    allowedTools: ["prisma"],
    routes: ["/skills/resume-builder"],
    graphs: ["resume_review"],
    testCoverage: false,
  },
  {
    name: "job_field_classifier",
    description: "Classify a job's field/industry and apply strategy.",
    modelTier: "FAST",
    tokenBudget: 1024,
    riskLevel: "LOW",
    humanApprovalRequired: false,
    allowedTools: ["prisma"],
    routes: [],
    graphs: ["job_ingestion_quality"],
    testCoverage: false,
  },
  {
    name: "career_gap_explainer",
    description: "Explain employment gaps constructively from resume facts.",
    modelTier: "QUAL",
    tokenBudget: 2048,
    riskLevel: "LOW",
    humanApprovalRequired: false,
    allowedTools: [],
    routes: ["/career-gap"],
    graphs: ["resume_review"],
    testCoverage: false,
  },
  {
    name: "interview_question_generator",
    description: "Generate role-specific interview questions.",
    modelTier: "QUAL",
    tokenBudget: 3072,
    riskLevel: "LOW",
    humanApprovalRequired: false,
    allowedTools: ["rag"],
    routes: ["/autopilot"],
    graphs: ["interview_prep"],
    testCoverage: false,
  },
  {
    name: "interview_answer_evaluator",
    description: "Evaluate candidate practice answers and produce an improvement plan.",
    modelTier: "QUAL",
    tokenBudget: 3072,
    riskLevel: "LOW",
    humanApprovalRequired: false,
    allowedTools: [],
    routes: ["/autopilot"],
    graphs: ["interview_prep"],
    testCoverage: false,
  },
  {
    name: "salary_negotiator",
    description: "Salary negotiation guidance grounded in benchmarks.",
    modelTier: "QUAL",
    tokenBudget: 3072,
    riskLevel: "LOW",
    humanApprovalRequired: false,
    allowedTools: ["rag"],
    routes: ["/salary-benchmarks"],
    graphs: [],
    testCoverage: false,
  },
  {
    name: "resume_translator",
    description: "Translate a resume into a target language faithfully.",
    modelTier: "QUAL",
    tokenBudget: 4096,
    riskLevel: "LOW",
    humanApprovalRequired: false,
    allowedTools: [],
    routes: ["/skills/resume-builder"],
    graphs: ["resume_review"],
    testCoverage: false,
  },
  {
    name: "career_advisor",
    description: "Career guidance grounded in profile + RAG context.",
    modelTier: "QUAL",
    tokenBudget: 4096,
    riskLevel: "LOW",
    humanApprovalRequired: false,
    allowedTools: ["rag"],
    routes: ["/skills/career-advisor"],
    graphs: [],
    testCoverage: false,
  },
  {
    name: "blog_writer",
    description: "Write a fact-checked, cited blog post for admin review.",
    modelTier: "QUAL",
    tokenBudget: 6144,
    riskLevel: "MEDIUM",
    humanApprovalRequired: true,
    allowedTools: ["prisma", "notification"],
    routes: [],
    graphs: ["blog_automation"],
    testCoverage: true,
  },
  {
    name: "blog_fact_check",
    description: "Score source credibility and filter low-credibility claims.",
    modelTier: "FAST",
    tokenBudget: 2048,
    riskLevel: "MEDIUM",
    humanApprovalRequired: false,
    allowedTools: [],
    routes: [],
    graphs: ["blog_automation"],
    testCoverage: true,
  },
];

function seedSkills(): void {
  for (const def of SEED) REGISTRY.set(def.name, def);
}

// Seed on module load.
seedSkills();
