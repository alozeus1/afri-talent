import { describe, it, expect } from "vitest";
import {
  listSkills,
  getSkill,
  registerSkill,
  type SkillDefinition,
} from "../registry/skillRegistry.js";
import { threadIds, registerGraph, getGraph, listGraphs } from "../registry/graphRegistry.js";
import { WorkflowTypeSchema, RiskTierSchema } from "../state/schemas.js";

describe("skillRegistry integrity", () => {
  const skills = listSkills();

  it("seeds the six orchestrator agents", () => {
    for (const n of [
      "resume_parser",
      "job_parser",
      "match_scorer",
      "resume_tailor",
      "cover_letter",
      "truth_consistency_guard",
    ]) {
      expect(getSkill(n), `missing skill ${n}`).toBeDefined();
    }
  });

  it("every skill has a positive token budget and a valid risk level + tier-consistent graphs", () => {
    for (const s of skills) {
      expect(s.tokenBudget, `${s.name} budget`).toBeGreaterThan(0);
      expect(RiskTierSchema.options).toContain(s.riskLevel);
      for (const g of s.graphs) expect(WorkflowTypeSchema.options).toContain(g);
    }
  });

  it("blog_writer requires human approval", () => {
    expect(getSkill("blog_writer")?.humanApprovalRequired).toBe(true);
  });

  it("rejects duplicate registration", () => {
    const dup: SkillDefinition = {
      name: "resume_parser",
      description: "dup",
      modelTier: "FAST",
      tokenBudget: 1,
      riskLevel: "LOW",
      humanApprovalRequired: false,
      allowedTools: [],
      routes: [],
      graphs: [],
      testCoverage: false,
    };
    expect(() => registerSkill(dup)).toThrow();
  });
});

describe("graphRegistry", () => {
  it("builds deterministic thread ids per the plan", () => {
    expect(threadIds.applyPack("app-1")).toBe("application:app-1:apply-pack");
    expect(threadIds.jobMatch("c1", "j1")).toBe("candidate:c1:job-match:j1");
    expect(threadIds.employerVerification("e1")).toBe("employer:e1:verification");
    expect(threadIds.blogAutomation("r1")).toBe("blog:r1:automation");
  });

  it("registers and retrieves a graph definition", () => {
    registerGraph({
      workflowType: "resume_review",
      description: "test",
      build: () => ({ invoke: async () => ({}), getState: async () => ({}) }),
      buildThreadId: (p) => threadIds.resumeReview(p.userId, p.resumeId),
    });
    expect(getGraph("resume_review")).toBeDefined();
    expect(listGraphs().length).toBeGreaterThan(0);
  });
});
