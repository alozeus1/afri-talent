import { describe, it, expect, afterEach } from "vitest";
import {
  resolveModel,
  isMockAi,
  getGraphBudget,
  estimateCostUsd,
} from "../policies/modelPolicy.js";
import {
  riskTierForScore,
  isAutomationAllowed,
  requiresSuspension,
  requiresHumanReview,
} from "../policies/riskPolicy.js";
import {
  requiresHumanApproval,
  missingAcknowledgements,
  REQUIRED_APPLY_ACKNOWLEDGEMENTS,
} from "../policies/humanApprovalPolicy.js";
import {
  assertToolAllowed,
  isToolAllowed,
  ToolPolicyError,
} from "../policies/toolPolicy.js";

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("modelPolicy", () => {
  it("resolves default models and respects env overrides", () => {
    delete process.env.AI_MODEL_FAST;
    delete process.env.AI_MODEL_QUAL;
    expect(resolveModel("FAST")).toContain("haiku");
    expect(resolveModel("QUAL")).toContain("sonnet");
    process.env.AI_MODEL_FAST = "custom-fast";
    expect(resolveModel("FAST")).toBe("custom-fast");
  });

  it("honors MOCK_AI flag", () => {
    process.env.MOCK_AI = "1";
    expect(isMockAi()).toBe(true);
    process.env.MOCK_AI = "0";
    expect(isMockAi()).toBe(false);
  });

  it("returns positive per-graph budgets and env override", () => {
    expect(getGraphBudget("apply_pack").maxTokens).toBeGreaterThan(0);
    process.env.LG_BUDGET_TOKENS_APPLY_PACK = "12345";
    expect(getGraphBudget("apply_pack").maxTokens).toBe(12345);
  });

  it("estimates cost monotonically with tokens", () => {
    const a = estimateCostUsd("QUAL", 1000, 1000);
    const b = estimateCostUsd("QUAL", 2000, 2000);
    expect(b).toBeGreaterThan(a);
    expect(estimateCostUsd("FAST", 1000, 1000)).toBeLessThan(a);
  });
});

describe("riskPolicy", () => {
  it("maps scores to tiers at the trust thresholds", () => {
    expect(riskTierForScore(10)).toBe("LOW");
    expect(riskTierForScore(25)).toBe("MEDIUM");
    expect(riskTierForScore(55)).toBe("HIGH");
    expect(riskTierForScore(80)).toBe("CRITICAL");
  });

  it("gates automation and review by tier", () => {
    expect(isAutomationAllowed("LOW")).toBe(true);
    expect(isAutomationAllowed("HIGH")).toBe(false);
    expect(requiresHumanReview("HIGH")).toBe(true);
    expect(requiresSuspension("CRITICAL")).toBe(true);
    expect(requiresSuspension("HIGH")).toBe(false);
  });
});

describe("humanApprovalPolicy", () => {
  it("flags sensitive actions", () => {
    expect(requiresHumanApproval("send_application")).toBe(true);
    expect(requiresHumanApproval("publish_blog")).toBe(true);
    expect(requiresHumanApproval("read_profile")).toBe(false);
  });

  it("computes missing acknowledgements (exact strings)", () => {
    expect(missingAcknowledgements([])).toEqual([...REQUIRED_APPLY_ACKNOWLEDGEMENTS]);
    expect(missingAcknowledgements([...REQUIRED_APPLY_ACKNOWLEDGEMENTS])).toEqual([]);
    expect(missingAcknowledgements(["I confirm the apply target"])).toEqual([
      "I have reviewed the cover letter",
    ]);
  });
});

describe("toolPolicy (least privilege, default-deny)", () => {
  it("allows declared families and denies others", () => {
    expect(isToolAllowed("resume_review", "rag")).toBe(true);
    expect(isToolAllowed("resume_review", "billing")).toBe(false);
    expect(isToolAllowed("apply_pack", "apply")).toBe(true);
  });

  it("assertToolAllowed throws ToolPolicyError on violation", () => {
    expect(() => assertToolAllowed("follow_up", "apply")).toThrow(ToolPolicyError);
    expect(() => assertToolAllowed("apply_pack", "apply")).not.toThrow();
  });
});
