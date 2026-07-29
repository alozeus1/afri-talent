import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("../../../../prisma.js", () => ({
  default: { graphRun: { findFirst } },
}));

import {
  buildEmployerVerificationDeps,
  runEmployerVerificationRollout,
} from "../employerVerificationAdapter.js";
import {
  buildCandidateVerificationDeps,
  runCandidateVerificationRollout,
} from "../candidateVerificationAdapter.js";

const OLD_ENV = { ...process.env };

function clearFlags() {
  delete process.env.LANGGRAPH_ENABLED;
  delete process.env.LANGGRAPH_EMPLOYER_VERIFICATION;
  delete process.env.LANGGRAPH_CANDIDATE_VERIFICATION;
}

describe("verification rollout adapters", () => {
  beforeEach(() => {
    findFirst.mockReset();
    clearFlags();
  });
  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it("is dormant by default — no rollout, no DB touch, when flags are unset", async () => {
    const e = await runEmployerVerificationRollout("emp-1", { artifactId: "a1" });
    const c = await runCandidateVerificationRollout("cand-1", { artifactId: "a2", documentRef: "doc-1" });
    expect(e).toBeNull();
    expect(c).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("respects the per-graph flag being explicitly off even if global is on", async () => {
    process.env.LANGGRAPH_ENABLED = "1";
    process.env.LANGGRAPH_EMPLOYER_VERIFICATION = "0";
    process.env.LANGGRAPH_CANDIDATE_VERIFICATION = "0";
    expect(await runEmployerVerificationRollout("emp-1", { artifactId: "a1" })).toBeNull();
    expect(await runCandidateVerificationRollout("cand-1", { artifactId: "a2" })).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("dedupes: skips a new run when one is already awaiting approval", async () => {
    process.env.LANGGRAPH_EMPLOYER_VERIFICATION = "1";
    findFirst.mockResolvedValueOnce({ id: "existing-run" });
    const out = await runEmployerVerificationRollout("emp-1", { artifactId: "a1" });
    expect(out).toBeNull();
    expect(findFirst).toHaveBeenCalledWith({
      where: { employerId: "emp-1", workflowType: "employer_verification", approvalState: "REQUESTED" },
      select: { id: true },
    });
  });

  it("never throws on a DB error (best-effort)", async () => {
    process.env.LANGGRAPH_CANDIDATE_VERIFICATION = "1";
    findFirst.mockRejectedValueOnce(new Error("db down"));
    await expect(
      runCandidateVerificationRollout("cand-1", { artifactId: "a2", documentRef: "doc-1" }),
    ).resolves.toBeNull();
  });

  it("builds deps with the shape each graph expects", () => {
    const emp = buildEmployerVerificationDeps();
    expect(Object.keys(emp).sort()).toEqual(
      ["allowPublishing", "assessEmployer", "recordEvent", "restrictPublishing", "suspendEmployer"].sort(),
    );
    const cand = buildCandidateVerificationDeps("doc-ref");
    expect(Object.keys(cand).sort()).toEqual(["getSignals", "recordEvent", "setVerification"].sort());
  });
});
